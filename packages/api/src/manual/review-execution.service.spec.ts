import type { SupabaseIdentity } from "../auth/auth.types.js";
import { describe, it, expect, vi } from "vitest";
import { ReviewExecutionService } from "./review-execution.service.js";
import type { StudentWorkHistoryService } from "../teach/student-work-history.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ManualAssetsService } from "./manual-assets.service.js";
import type { GuiClientService } from "./gui-client.service.js";
import type { HistoryReviewRun } from "@cove/shared";
function setup() {
  const history = {
    authorizeReviewRun: vi.fn().mockResolvedValue({
      actor: { userId: "teacher" },
      savedProfile: { runtimeVersion: "saved-runtime" },
      profile: {
        entryPoint: "main.py",
        assets: [],
        width: 640,
        height: 480,
        timeLimitSeconds: 30,
        memoryLimitMb: 128,
      },
    }),
  };
  const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "teacher" }) },
    },
    assets = { bytes: vi.fn() },
    gui = {
      request: vi
        .fn()
        .mockResolvedValue({ id: "private-session", state: "RUNNING" }),
    };
  const service = new ReviewExecutionService(
    history as unknown as StudentWorkHistoryService,
    db as unknown as PrismaService,
    assets as unknown as ManualAssetsService,
    gui as unknown as GuiClientService,
  );
  const input = {
    academyId: "academy",
    classId: "class",
    membershipId: "student-member",
    materialId: "material",
    submissionId: "attempt",
    kind: "manual",
    reviewId: "copy",
    files: { "main.py": 'print("private")' },
  } as HistoryReviewRun;
  return { service, history, db, assets, gui, input };
}
describe("private Turtle review execution", () => {
  it("uses private files but server-owned saved runtime/profile and a separate owner", async () => {
    const { service, gui, input } = setup();
    try {
      await service.start({ authUserId: "auth" } as SupabaseIdentity, input);
      expect(gui.request).toHaveBeenCalledWith(
        "/sessions",
        "POST",
        expect.objectContaining({
          files: input.files,
          runtimeVersion: "saved-runtime",
          owner: "review:teacher:academy:class:attempt:copy",
          width: 640,
          replaceOwner: true,
        }),
      );
    } finally {
      service.onModuleDestroy();
    }
  });
  it("checks session ownership before reading status or accepting input", async () => {
    const { service, db, gui, input } = setup();
    try {
      await service.start({ authUserId: "auth" } as SupabaseIdentity, input);
      gui.request.mockClear();
      db.user.findUnique.mockResolvedValue({ id: "someone-else" });
      await expect(
        service.session(
          { authUserId: "other" } as SupabaseIdentity,
          "private-session",
          "POST",
          "x",
        ),
      ).rejects.toThrow();
      expect(gui.request).not.toHaveBeenCalled();
    } finally {
      service.onModuleDestroy();
    }
  });
  it("rechecks access and terminates private execution after revocation", async () => {
    const { service, history, gui, input } = setup();
    try {
      await service.start({ authUserId: "auth" } as SupabaseIdentity, input);
      history.authorizeReviewRun.mockRejectedValue(new Error("revoked"));
      await expect(
        service.session(
          { authUserId: "auth" } as SupabaseIdentity,
          "private-session",
        ),
      ).rejects.toThrow("revoked");
      expect(gui.request).toHaveBeenLastCalledWith(
        "/sessions/private-session",
        "DELETE",
      );
    } finally {
      service.onModuleDestroy();
    }
  });
  it("refuses a missing saved runtime instead of substituting the current version", async () => {
    const { service, history, gui, input } = setup();
    history.authorizeReviewRun.mockResolvedValue({
      actor: { userId: "teacher" },
      savedProfile: {},
      profile: { entryPoint: "main.py", assets: [] },
    } as never);
    await expect(
      service.start({ authUserId: "auth" } as SupabaseIdentity, input),
    ).rejects.toThrow("saved runtime");
    expect(gui.request).not.toHaveBeenCalled();
  });
});

it("keeps a private draft run separate from every student and saved-submission owner", async () => {
  const { service, gui, input } = setup();
  const { submissionId: _submission, ...draft } = input;
  void _submission;
  try {
    await service.start({ authUserId: "auth" } as SupabaseIdentity, draft);
    expect(gui.request).toHaveBeenCalledWith(
      "/sessions",
      "POST",
      expect.objectContaining({
        owner: expect.stringMatching(/^review:teacher:draft:[a-f0-9]{64}$/),
        files: input.files,
      }),
    );
  } finally {
    service.onModuleDestroy();
  }
});

it("bounds UUID draft owners and separates materials even when the copy ID is reused", async () => {
  const { service, gui, input } = setup();
  const id = "11111111-1111-4111-8111-111111111111";
  const draft = {
    ...input,
    submissionId: undefined,
    academyId: id,
    classId: id,
    membershipId: id,
    materialId: id,
    reviewId: id,
  };
  try {
    await service.start({ authUserId: "auth" } as SupabaseIdentity, draft);
    const owner = gui.request.mock.calls[0][2].owner;
    expect(owner.length).toBeLessThanOrEqual(200);
    gui.request.mockResolvedValue({ id: "other-session", state: "RUNNING" });
    await service.start({ authUserId: "auth" } as SupabaseIdentity, {
      ...draft,
      materialId: "22222222-2222-4222-8222-222222222222",
    });
    expect(gui.request.mock.calls[1][2].owner).not.toBe(owner);
  } finally {
    service.onModuleDestroy();
  }
});
