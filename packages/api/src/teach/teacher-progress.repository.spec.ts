import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";

function createRepository() {
  const findFirst = vi.fn(async () => null);
  const prisma = {
    submission: { findFirst },
  } as unknown as PrismaService;

  return {
    findFirst,
    repository: new TeacherProgressRepository(prisma),
  };
}

describe("TeacherProgressRepository.findSubmissionForReview", () => {
  it("selects only a counted final attempt in the authorized scope", async () => {
    const { findFirst, repository } = createRepository();

    await repository.findSubmissionForReview({
      userId: "student-user",
      materialIds: ["exercise-a", "exercise-b"],
      submissionId: "submission-a",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "submission-a",
          userId: "student-user",
          materialId: { in: ["exercise-a", "exercise-b"] },
          status: { in: ["PASSED", "FAILED"] },
        },
      }),
    );
  });

  it("does not query when the class has no reviewable exercises", async () => {
    const { findFirst, repository } = createRepository();

    await expect(
      repository.findSubmissionForReview({
        userId: "student-user",
        materialIds: [],
        submissionId: "submission-a",
      }),
    ).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
