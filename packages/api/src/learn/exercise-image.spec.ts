import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ManualAssetsService } from "../manual/manual-assets.service.js";
import { LearnService } from "./learn.service.js";

const identity = { authUserId: "e0000000-0000-4000-8000-000000000001" } as SupabaseIdentity;
const academyId = "a0000000-0000-4000-8000-000000000001";
const materialId = "f0000000-0000-4000-8000-000000000001";
const shown = "11111111-1111-4111-8111-111111111111";
const unshown = "22222222-2222-4222-8222-222222222222";

function setup(options: { role?: string; description?: string | null; url?: string | null } = {}) {
  const findFirst = vi.fn().mockResolvedValue(options.description === null ? null
    : { programmingExercise: { description: options.description ?? `<p>Map</p><img src="cove-asset:${shown}" alt="map.png">` } });
  const prisma = { material: { findFirst } } as unknown as PrismaService;
  const access = { requirePermission: vi.fn().mockResolvedValue({ userId: "u", academyId, role: options.role ?? "STUDENT" }) } as unknown as AcademyAccessService;
  const imageDataUrl = vi.fn().mockResolvedValue(options.url === undefined ? "data:image/png;base64,AAAA" : options.url);
  const service = new LearnService(prisma, {} as never, access, {} as never, {} as never, {} as never, undefined, { imageDataUrl } as unknown as ManualAssetsService);
  return { service, findFirst, imageDataUrl };
}

describe("LearnService.getExerciseImage", () => {
  it("returns a picture the problem's description shows to someone who may open it", async () => {
    const { service, imageDataUrl } = setup();
    await expect(service.getExerciseImage(identity, { academyId, materialId, assetId: shown.toUpperCase() }))
      .resolves.toEqual({ url: "data:image/png;base64,AAAA" });
    expect(imageDataUrl).toHaveBeenCalledWith(shown.toUpperCase());
  });

  it("refuses a picture the description does not show, even an existing one", async () => {
    const { service, imageDataUrl } = setup();
    await expect(service.getExerciseImage(identity, { academyId, materialId, assetId: unshown }))
      .rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE", status: 404 });
    expect(imageDataUrl).not.toHaveBeenCalled();
  });

  it("answers like a missing problem when the caller cannot open it", async () => {
    const { service } = setup({ description: null });
    await expect(service.getExerciseImage(identity, { academyId, materialId, assetId: shown }))
      .rejects.toMatchObject({ code: "EXERCISE_NOT_AVAILABLE", status: 404 });
  });

  it("allows previews only to reviewers, before reading anything", async () => {
    const student = setup();
    await expect(student.service.getExerciseImage(identity, { academyId, materialId, assetId: shown, preview: true }))
      .rejects.toMatchObject({ status: 403 });
    expect(student.findFirst).not.toHaveBeenCalled();

    const manager = setup({ role: "MANAGER" });
    await expect(manager.service.getExerciseImage(identity, { academyId, materialId, assetId: shown, preview: true }))
      .resolves.toEqual({ url: "data:image/png;base64,AAAA" });
  });

  it("refuses a referenced asset that is not a picture", async () => {
    const { service } = setup({ url: null });
    await expect(service.getExerciseImage(identity, { academyId, materialId, assetId: shown }))
      .rejects.toMatchObject({ status: 404 });
  });
});
