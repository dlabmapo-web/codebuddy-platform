import { z } from "zod";

/**
 * What a manager can see about a student's password without asking to read it.
 *
 * The prefix and length are enough to render `hae•••••••`, which is what lets
 * a manager recognise the credential they wrote on a slip of paper without
 * revealing it to whoever is standing behind them. Everything here is safe to
 * carry in a page's initial payload; the password itself is not, and comes
 * only from `revealPassword`.
 */
export const studentCredentialSchema = z.object({
  /**
   * The first characters of the issued password, stored in the clear because
   * they are shown in the clear.
   */
  visiblePrefix: z.string().min(1).max(8),
  length: z.number().int().min(8).max(64),
  issuedAt: z.iso.datetime(),
  issuedByName: z.string().nullable(),
  /**
   * How many times somebody has read this password back.
   *
   * Shown to the manager on the same panel as the reveal button. Being told
   * that reads are counted and attributed is what keeps a convenience from
   * quietly becoming a habit.
   */
  revealCount: z.number().int().min(0),
  lastRevealedAt: z.iso.datetime().nullable(),
  /**
   * False when this deployment holds no `STUDENT_CREDENTIAL_KEY`. The password
   * was shown once at issue and nothing was stored, so there is nothing to
   * reveal and the panel says so rather than offering a button that fails.
   */
  revealable: z.boolean(),
});
export type StudentCredential = z.infer<typeof studentCredentialSchema>;

/**
 * The password panel's whole state, for one student.
 *
 * `credential: null` is not an error and is not styled as one. It means the
 * student has chosen their own password, which is the system working — Cove
 * destroys what it issued the moment it stops being true, so it never holds a
 * secret whose owner believes it is private.
 */
export const studentCredentialStateSchema = z.object({
  membershipId: z.uuid(),
  credential: studentCredentialSchema.nullable(),
});
export type StudentCredentialState = z.infer<
  typeof studentCredentialStateSchema
>;

export const issueStudentPasswordInputSchema = z
  .object({ academyId: z.uuid(), membershipId: z.uuid() })
  .strict();

export const revealStudentPasswordInputSchema = z
  .object({ academyId: z.uuid(), membershipId: z.uuid() })
  .strict();

/**
 * The plaintext, returned exactly twice in a password's life: when it is
 * issued, and when a manager asks to read it back.
 *
 * Carried in a procedure result rather than on the member record, so no list
 * response, cache, or export can ever contain one by accident.
 */
export const studentPasswordRevealSchema = z
  .object({
    password: z.string().min(1),
    state: studentCredentialStateSchema,
  })
  .strict();
export type StudentPasswordReveal = z.infer<typeof studentPasswordRevealSchema>;
