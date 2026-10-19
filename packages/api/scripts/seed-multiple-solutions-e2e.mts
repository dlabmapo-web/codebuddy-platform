import 'dotenv/config';
import { replaceExerciseSolutions } from '../src/content/exercise-solutions.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (
  new URL(process.env.SUPABASE_URL ?? '').hostname !==
  'lnrmxjxsjxymgphgatwn.supabase.co'
)
  throw new Error('Multiple solutions E2E fixture is development-only');
const database = new URL(process.env.DATABASE_URL ?? '');
if (!(database.hostname.includes('lnrmxjxsjxymgphgatwn') || database.username.includes('lnrmxjxsjxymgphgatwn'))) throw new Error('Unexpected development database');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = 'ee080000-0000-4000-8000-000000000001';
const moduleId = 'ee080000-0000-4000-8000-000000000010';
const lectureId = 'ee080000-0000-4000-8000-000000000020';
try {
  const author = await prisma.user.findUniqueOrThrow({
    where: { username: 'cove-teamlead' },
  });
  await prisma.course.upsert({
    where: { id: courseId },
    create: {
      id: courseId,
      academyId,
      title: 'E2E Multiple Solutions',
      createdByUserId: author.id,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.courseModule.upsert({
    where: { id: moduleId },
    create: {
      id: moduleId,
      courseId,
      externalKey: 'solutions-e2e-chapter',
      title: 'Solutions Chapter',
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.lecture.upsert({
    where: { id: lectureId },
    create: {
      id: lectureId,
      courseModuleId: moduleId,
      externalKey: 'solutions-e2e-' + lectureId,
      title: 'Solutions Lecture',
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.lecture.upsert({
    where: { id: 'ee080000-0000-4000-8000-000000000021' },
    create: {
      id: 'ee080000-0000-4000-8000-000000000021',
      courseModuleId: moduleId,
      externalKey: 'solutions-e2e-resource',
      title: 'Resource Only Lecture',
      position: 2,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.programmingExercise.updateMany({ where: { material: { lecture: { courseModule: { courseId } } } }, data: { referencePdfMaterialId: null } });
  await prisma.material.deleteMany({
    where: { type: 'PDF_DOCUMENT', lecture: { courseModule: { courseId } } },
  });
  const materialId = 'ee080000-0000-4000-8000-000000000030';
  await prisma.material.upsert({
    where: { id: materialId },
    create: {
      id: materialId,
      lectureId,
      title: 'Multiple solutions exercise',
      type: 'PROGRAMMING_EXERCISE',
      position: 1,
      isVisible: true,
      isRequired: true,
      programmingExercise: {
        create: {
          externalKey: 'solutions-e2e-exercise',
          difficulty: 'EASY',
          description: '<p>Print hello.</p>',
          starterCode: 'print("hello")',
          solutionCode: 'print("hello")',
          solutions: { create: [{ position: 0, title: null, code: 'print("hello")' }] },
          inputFormat: '',
          outputFormat: '',
          constraints: '',
        },
      },
    },
    update: { isVisible: true },
  });
  await prisma.courseModule.update({ where: { id: moduleId }, data: { externalKey: 'SOLUTIONS-CHAPTER' } });
  await prisma.lecture.update({ where: { id: lectureId }, data: { externalKey: 'SOLUTIONS-LECTURE' } });
  await prisma.lecture.update({ where: { id: 'ee080000-0000-4000-8000-000000000021' }, data: { externalKey: 'SOLUTIONS-RESOURCE' } });
  await prisma.programmingExercise.update({ where: { materialId }, data: { externalKey: 'SOLUTIONS-EXERCISE' } });
  await prisma.$transaction(tx => replaceExerciseSolutions(tx, materialId, [{ title: null, code: 'print("hello")' }]));
  await prisma.exerciseTestCase.upsert({
    where: { exerciseMaterialId_position: { exerciseMaterialId: materialId, position: 1 } },
    create: { exerciseMaterialId: materialId, position: 1, input: "", expectedOutput: "hello", visibility: "SAMPLE" }, update: {},
  });
  const classId = 'e0000000-0000-4000-8000-000000000040';
  await prisma.classCourse.upsert({
    where: { classId_courseId: { classId, courseId } },
    create: { classId, courseId, assignedByUserId: author.id },
    update: {},
  });
  console.log('Development Multiple solutions E2E course ready.');
} finally {
  await prisma.$disconnect();
}
