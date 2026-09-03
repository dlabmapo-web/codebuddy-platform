import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  effectiveAcademyRoles,
  generateIssuedPassword,
  isStudentRoleSet,
  issuedPasswordPrefix,
  type StudentCredentialState,
  type StudentPasswordReveal,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AuditService } from "./audit.service.js";

/**
 * AES-256-GCM. The current version, written on every new row; older rows keep
 * the version they were sealed under so a key can be rotated without a
 * migration that decrypts everything at once.
 */
const currentKeyVersion = 1;

/**
 * A student's password, for the manager who is their only way back in.
 *
 * A student has no email and therefore no self-service recovery, so the
 * manager who issued the credential *is* the recovery mechanism. One they
 * cannot read back is one they must reissue every time a child forgets, which
 * is why this service keeps what it issued rather than only showing it once.
 *
 * The invariant that makes that defensible: Cove stores only passwords **it
 * generated**, and destroys the row the moment the student replaces it. It
 * never holds a secret whose owner believes it is private, and it never claims
 * to know a password it did not issue — a hash is all Supabase has, and
 * creating a readable copy of every student password would turn one leaked
 * server key into every child's account.
 */
@Injectable()
export class StudentCredentialService {
  private readonly logger = new Logger(StudentCredentialService.name);
  private readonly key: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    config: ConfigService<ApiEnvironment, true>,
  ) {
    const configured = config.get("STUDENT_CREDENTIAL_KEY", { infer: true });
    this.key = configured ? Buffer.from(configured, "base64") : null;
    if (!this.key) {
      this.logger.warn(
        "STUDENT_CREDENTIAL_KEY is not set. Issued student passwords are shown once and not stored.",
      );
    }
  }

  /** What the manager's panel shows before anybody asks to read anything. */
  async state(
    academyId: string,
    membershipId: string,
  ): Promise<StudentCredentialState> {
    const { userId } = await this.requireStudentTarget(academyId, membershipId);
    return this.presentState(membershipId, userId);
  }

  /**
   * Generates a password, sets it in Supabase, and returns it once.
   *
   * The Supabase call comes first. If storing the copy fails afterwards the
   * student's password has still changed, and the manager is still holding the
   * only copy on their screen — whereas storing first and failing to apply it
   * would show a manager a password that does not work.
   */
  async issue(
    actorUserId: string,
    academyId: string,
    membershipId: string,
  ): Promise<StudentPasswordReveal> {
    const target = await this.requireStudentTarget(academyId, membershipId);
    if (!target.authUserId) {
      throw new AppException(
        "STUDENT_CREDENTIAL_TARGET_INVALID",
        HttpStatus.CONFLICT,
      );
    }

    const password = generateIssuedPassword();
    await this.supabaseAuth.setPassword(target.authUserId, password);

    if (this.key) {
      const sealed = this.seal(password);
      await this.prisma.studentIssuedCredential.upsert({
        where: { userId: target.userId },
        create: {
          userId: target.userId,
          academyId,
          ...sealed,
          visiblePrefix: issuedPasswordPrefix(password),
          length: password.length,
          issuedByUserId: actorUserId,
        },
        // A reissue replaces the previous one outright, including its read
        // count: the counter answers "how often has *this* password been read
        // back", and carrying it across would make it answer nothing.
        update: {
          academyId,
          ...sealed,
          visiblePrefix: issuedPasswordPrefix(password),
          length: password.length,
          issuedByUserId: actorUserId,
          issuedAt: new Date(),
          revealCount: 0,
          lastRevealedAt: null,
        },
      });
    } else {
      // Nothing can be read back later, so nothing may be left claiming it can.
      await this.prisma.studentIssuedCredential.deleteMany({
        where: { userId: target.userId },
      });
    }

    await this.audit.write(this.prisma, {
      academyId,
      actorUserId,
      action: "academy.member.password.issued",
      targetType: "membership",
      targetId: membershipId,
    });

    return {
      password,
      state: await this.presentState(membershipId, target.userId),
    };
  }

  /**
   * Reads back the password this academy issued, if it is still the student's.
   *
   * Every call is audited and counted before the plaintext is returned. The
   * count is shown to the manager on the same panel as the button: being told
   * that reads are attributed is what keeps a convenience from quietly
   * becoming a habit.
   */
  async reveal(
    actorUserId: string,
    academyId: string,
    membershipId: string,
  ): Promise<StudentPasswordReveal> {
    const target = await this.requireStudentTarget(academyId, membershipId);
    if (!this.key) {
      throw new AppException(
        "STUDENT_CREDENTIAL_STORAGE_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const stored = await this.prisma.studentIssuedCredential.findUnique({
      where: { userId: target.userId },
    });
    // Absent means the student chose their own password and Cove destroyed
    // what it had issued. Not a fault, and the message says so.
    if (!stored) {
      throw new AppException(
        "STUDENT_CREDENTIAL_NOT_STORED",
        HttpStatus.NOT_FOUND,
      );
    }
    if (stored.keyVersion !== currentKeyVersion) {
      throw new AppException(
        "STUDENT_CREDENTIAL_STORAGE_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const password = this.open(stored);
    // Counted and recorded before the plaintext is handed back, so a read that
    // reaches the caller is always a read the audit trail knows about.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.studentIssuedCredential.update({
        where: { userId: target.userId },
        data: { revealCount: { increment: 1 }, lastRevealedAt: new Date() },
      });
      await this.audit.write(transaction, {
        academyId,
        actorUserId,
        action: "academy.member.password.revealed",
        targetType: "membership",
        targetId: membershipId,
      });
    });

    return {
      password,
      state: await this.presentState(membershipId, target.userId),
    };
  }

  /**
   * Forgets the issued password for an account, because it is no longer that
   * account's password.
   *
   * Called when a student changes their own. Cove is the only route by which
   * they can — they have no email, so no recovery link reaches them — which is
   * what makes "the row exists" and "this is still their password" the same
   * statement.
   */
  async forget(userId: string): Promise<void> {
    await this.prisma.studentIssuedCredential.deleteMany({ where: { userId } });
  }

  /** The same, addressed by the Supabase identity a request arrives with. */
  async forgetForAuthUser(authUserId: string): Promise<void> {
    await this.prisma.studentIssuedCredential.deleteMany({
      where: { user: { authUserId } },
    });
  }

  /**
   * Resolves a membership to the student behind it, or refuses.
   *
   * One exception for "no such membership", "not in your academy", and "not a
   * student", so a manager cannot learn who holds a staff role elsewhere by
   * reading which refusal comes back. The staff check is what stops a manager
   * minting themselves a password for a colleague's account — their own
   * membership included.
   */
  private async requireStudentTarget(
    academyId: string,
    membershipId: string,
  ): Promise<{ userId: string; authUserId: string | null }> {
    const membership = await this.prisma.academyMembership.findFirst({
      where: { id: membershipId, academyId },
      select: {
        role: true,
        extraRoles: { select: { role: true } },
        user: { select: { id: true, authUserId: true } },
      },
    });
    const roles = membership
      ? effectiveAcademyRoles(
          membership.role,
          membership.extraRoles.map((extra) => extra.role),
        )
      : [];
    if (!membership || !isStudentRoleSet(roles)) {
      throw new AppException(
        "STUDENT_CREDENTIAL_TARGET_INVALID",
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      userId: membership.user.id,
      authUserId: membership.user.authUserId,
    };
  }

  private async presentState(
    membershipId: string,
    userId: string,
  ): Promise<StudentCredentialState> {
    const stored = this.key
      ? await this.prisma.studentIssuedCredential.findUnique({
          where: { userId },
          include: { issuedBy: { select: { displayName: true } } },
        })
      : null;

    return {
      membershipId,
      credential: stored
        ? {
            visiblePrefix: stored.visiblePrefix,
            length: stored.length,
            issuedAt: stored.issuedAt.toISOString(),
            issuedByName: stored.issuedBy.displayName,
            revealCount: stored.revealCount,
            lastRevealedAt: stored.lastRevealedAt?.toISOString() ?? null,
            revealable: stored.keyVersion === currentKeyVersion,
          }
        : null,
    };
  }

  private seal(password: string): {
    ciphertext: Uint8Array<ArrayBuffer>;
    iv: Uint8Array<ArrayBuffer>;
    authTag: Uint8Array<ArrayBuffer>;
    keyVersion: number;
  } {
    // A fresh 12-byte nonce per seal. GCM's security collapses entirely if one
    // is ever reused under the same key, and these rows are rewritten on every
    // reissue.
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key!, iv);
    const ciphertext = Buffer.concat([
      cipher.update(password, "utf8"),
      cipher.final(),
    ]);
    // Prisma's `Bytes` is a plain `Uint8Array`, and Node's `Buffer` is one
    // over a wider `ArrayBufferLike`. Copied rather than cast, so the row that
    // reaches the database owns its bytes.
    return {
      ciphertext: Uint8Array.from(ciphertext),
      iv: Uint8Array.from(iv),
      authTag: Uint8Array.from(cipher.getAuthTag()),
      keyVersion: currentKeyVersion,
    };
  }

  private open(stored: {
    ciphertext: Uint8Array<ArrayBuffer>;
    iv: Uint8Array<ArrayBuffer>;
    authTag: Uint8Array<ArrayBuffer>;
  }): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key!,
      Buffer.from(stored.iv),
    );
    decipher.setAuthTag(Buffer.from(stored.authTag));
    return Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
  }
}
