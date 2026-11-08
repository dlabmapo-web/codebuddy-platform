import { createHash } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { HistoryReviewRun } from "@cove/shared";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { StudentWorkHistoryService } from "../teach/student-work-history.service.js";
import { ManualAssetsService } from "./manual-assets.service.js";
import { GuiClientService } from "./gui-client.service.js";

/** Review executions never share ownership with student or authoring sessions. */
@Injectable()
export class ReviewExecutionService implements OnModuleDestroy {
  private readonly sessions = new Map<
    string,
    {
      userId: string;
      target: HistoryReviewRun;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private readonly history: StudentWorkHistoryService,
    private readonly db: PrismaService,
    private readonly assets: ManualAssetsService,
    private readonly gui: GuiClientService,
  ) {}
  async start(identity: SupabaseIdentity, input: HistoryReviewRun) {
    const { actor, profile, savedProfile } =
      await this.history.authorizeReviewRun(identity, input);
    const runtimeVersion =
      typeof savedProfile === "object" &&
      savedProfile !== null &&
      !Array.isArray(savedProfile)
        ? savedProfile.runtimeVersion
        : null;
    if (typeof runtimeVersion !== "string")
      throw new BadRequestException("The saved runtime version is unavailable");
    if (!Object.hasOwn(input.files, profile.entryPoint))
      throw new BadRequestException("Entry point is missing");
    const assets = await Promise.all(
      profile.assets.map(async (a) => ({
        name: a.name,
        data: await this.assets.bytes(a.assetId),
      })),
    );
    const session = await this.gui.request("/sessions", "POST", {
      runtimeVersion,
      assets,
      files: input.files,
      entryPoint: profile.entryPoint,
      width: profile.width,
      height: profile.height,
      timeLimitSeconds: profile.timeLimitSeconds,
      memoryLimitMb: profile.memoryLimitMb,
      // The runtime caps owner keys at 200 characters. Hash the complete draft
      // scope so real UUIDs stay bounded without dropping any isolation dimension.
      owner: input.submissionId
        ? `review:${actor.userId}:${input.academyId}:${input.classId}:${input.submissionId}:${input.reviewId}`
        : `review:${actor.userId}:draft:${createHash("sha256").update([input.academyId, input.classId, input.membershipId, input.materialId, input.reviewId].join(":")).digest("hex")}`,
      replaceOwner: true,
    });
    const timer = setTimeout(
      () => {
        this.sessions.delete(session.id);
        void this.gui
          .request(`/sessions/${session.id}`, "DELETE")
          .catch(() => {});
      },
      (profile.timeLimitSeconds + 120) * 1000,
    );
    timer.unref();
    // Keep only bounded authorization identifiers, never source code in the session registry.
    this.sessions.set(session.id, {
      userId: actor.userId,
      target: { ...input, files: {} },
      timer,
    });
    return session;
  }
  async session(
    identity: SupabaseIdentity,
    id: string,
    method = "GET",
    text?: string,
  ) {
    const record = this.sessions.get(id);
    if (!record) throw new NotFoundException();
    const actor = await this.db.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true },
    });
    if (actor?.id !== record.userId) throw new NotFoundException();
    try {
      await this.history.authorizeReviewRun(identity, record.target);
    } catch (error) {
      clearTimeout(record.timer);
      this.sessions.delete(id);
      await this.gui.request(`/sessions/${id}`, "DELETE").catch(() => {});
      throw error;
    }
    const result = await this.gui.request(
      `/sessions/${id}${text === undefined ? "" : "/input"}`,
      method,
      text === undefined ? undefined : { text },
    );
    if (method === "DELETE") {
      clearTimeout(record.timer);
      this.sessions.delete(id);
    }
    return result;
  }
  onModuleDestroy() {
    for (const [id, record] of this.sessions) {
      clearTimeout(record.timer);
      void this.gui.request(`/sessions/${id}`, "DELETE").catch(() => {});
    }
    this.sessions.clear();
  }
}
