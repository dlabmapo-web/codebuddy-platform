/**
 * Seeds a sample test (테스트) for localhost checks of the exam feature (QA S-06).
 *
 *   EXAM_COURSE_ID=<course uuid> [EXAM_TIME_LIMIT=10] pnpm exec tsx scripts/seed-exam.mts
 *
 * Adds "[중간 평가]" as the last lecture of the course's last module: two
 * multiple-choice, one short-answer and two Python problems, 20 points each,
 * published. Re-running replaces nothing: an existing seeded test is reported.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const courseId = process.env.EXAM_COURSE_ID;
if (!courseId) throw new Error("Set EXAM_COURSE_ID");
const timeLimit = Number(process.env.EXAM_TIME_LIMIT ?? 10);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }) });
const KEY = `seed-exam-${courseId}`;

async function main() {
  const existing = await db.lecture.findFirst({ where: { externalKey: KEY }, select: { id: true } });
  if (existing) {
    console.log(`already seeded: lecture ${existing.id}`);
    return;
  }
  const module = await db.courseModule.findFirstOrThrow({ where: { courseId }, orderBy: { position: "desc" } });
  const lastLecture = await db.lecture.findFirst({ where: { courseModuleId: module.id }, orderBy: { position: "desc" } });
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const option = () => randomUUID();
  const mc1 = [option(), option(), option(), option(), option()];
  const mc2 = [option(), option(), option(), option()];
  const lectureId = await db.$transaction(async (tx) => {
    const lecture = await tx.lecture.create({ data: {
      courseModuleId: module.id, externalKey: KEY, title: "[중간 평가]", position: (lastLecture?.position ?? 0) + 1,
      isVisible: true, kind: "TEST",
      test: { create: {
        timeLimitMinutes: timeLimit, summary: "지금까지 배운 개념으로 문제를 스스로 해결합니다.", testType: "SUMMATIVE",
        points: Object.fromEntries(ids.map((id) => [id, 2000])),
      } },
    } });
    const types = ["MULTIPLE_CHOICE", "MULTIPLE_CHOICE", "WRITTEN_RESPONSE", "PROGRAMMING_EXERCISE", "PROGRAMMING_EXERCISE"] as const;
    for (const [index, id] of ids.entries()) {
      await tx.material.create({ data: { id, lectureId: lecture.id, type: types[index]!, title: `[문제${index + 1}]`, position: index + 1, isVisible: true } });
    }
    await tx.manualMaterial.create({ data: { materialId: ids[0]!, files: {}, includeInScore: true, multipleChoice: {
      version: 1, question: "다음 중 자료형을 확인하는 함수를 고르세요.", problemDescription: "", selectionMode: "SINGLE",
      options: ["type()", "append()", "format()", "range()", "print()"].map((text, i) => ({ id: mc1[i], content: `<p>${text}</p>` })),
      correctOptionIds: [mc1[0]], shuffleOptions: false, explanationEnabled: false, explanation: "",
    } } });
    await tx.manualMaterial.create({ data: { materialId: ids[1]!, files: {}, includeInScore: true, multipleChoice: {
      version: 1, question: "리스트의 마지막에 값을 추가하는 메서드는 무엇인가요?", problemDescription: "", selectionMode: "SINGLE",
      options: ["insert()", "append()", "pop()", "sort()"].map((text, i) => ({ id: mc2[i], content: `<p>${text}</p>` })),
      correctOptionIds: [mc2[1]], shuffleOptions: false, explanationEnabled: false, explanation: "",
    } } });
    await tx.manualMaterial.create({ data: { materialId: ids[2]!, files: {}, includeInScore: true, shortAnswer: {
      version: 1, question: "3 * 4 의 결과를 숫자로 입력하세요.", gradingMode: "EXACT", expectedAnswer: "12", pattern: "",
      explanationEnabled: false, explanation: "",
    } } });
    const code = (materialId: string, description: string, input: string, output: string, hidden: Array<[string, string]>) =>
      tx.programmingExercise.create({ data: {
        materialId, externalKey: `${KEY}-${materialId}`, difficulty: "EASY", description, starterCode: "",
        solutionCode: "", inputFormat: input ? "정수 n이 주어집니다." : "", outputFormat: "결과를 출력합니다.", constraints: "",
        testCases: { create: [
          { position: 1, input, expectedOutput: output, visibility: "SAMPLE" },
          ...hidden.map(([i, o], index) => ({ position: index + 2, input: i, expectedOutput: o, visibility: "HIDDEN" as const })),
        ] },
      } });
    await code(ids[3]!, "<p>1번째 줄부터 n번째 줄까지, 각 줄마다 1부터 그 줄 번호까지의 숫자를 공백으로 구분해 출력하세요.</p>",
      "5", "1\n1 2\n1 2 3\n1 2 3 4\n1 2 3 4 5", [["3", "1\n1 2\n1 2 3"]]);
    await code(ids[4]!, "<p>정수 n을 입력받아 1부터 n까지의 합을 출력하세요.</p>", "10", "55", [["100", "5050"], ["1", "1"]]);
    await tx.course.update({ where: { id: courseId }, data: { contentRevision: { increment: 1 } } });
    return lecture.id;
  });
  console.log(`seeded test lecture ${lectureId} (${timeLimit} min)`);
}

main().finally(() => db.$disconnect());
