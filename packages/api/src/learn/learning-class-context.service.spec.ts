import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import { LearningClassContextService } from "./learning-class-context.service.js";

const academyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const courseId = "30000000-0000-4000-8000-000000000003";
const classA = "40000000-0000-4000-8000-000000000004";
const classB = "50000000-0000-4000-8000-000000000005";

function service(classes: Array<{ id: string; name: string }>) {
  const prisma = {
    academyMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "60000000-0000-4000-8000-000000000006",
        classEnrollments: classes.map((item) => ({ class: item })),
      }),
    },
  } as unknown as PrismaService;
  return { prisma, service: new LearningClassContextService(prisma) };
}

describe("LearningClassContextService", () => {
  it("selects the only eligible delivery class automatically", async () => {
    const result = await service([{ id: classA, name: "Python A" }]).service.resolve({
      academyId,
      userId,
      courseId,
    });

    expect(result.classId).toBe(classA);
  });

  it("requires an explicit choice when two classes deliver the course", async () => {
    const result = await service([
      { id: classA, name: "Python A" },
      { id: classB, name: "Python B" },
    ]).service.resolve({ academyId, userId, courseId });

    expect(result.classId).toBeNull();
    expect(result.classes.map((item) => item.classId)).toEqual([classA, classB]);
  });

  it("accepts only a requested class from the verified eligible set", async () => {
    const context = service([{ id: classA, name: "Python A" }]);

    await expect(
      context.service.resolve({
        academyId,
        userId,
        courseId,
        requestedClassId: classB,
      }),
    ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
  });
});
