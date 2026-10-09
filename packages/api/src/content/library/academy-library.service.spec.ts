import { describe, expect, it, vi } from 'vitest';

import { AcademyLibraryService } from './academy-library.service.js';

const branchId = '20000000-0000-4000-8000-000000000001';
const libraryId = '30000000-0000-4000-8000-000000000001';
const masterId = '40000000-0000-4000-8000-000000000001';
const identity = { authUserId: 'lead' } as never;

/** One master with a module, a lecture, a problem, a test case and a hint. */
const master = {
  id: masterId,
  title: 'Python Level 1',
  description: 'The foundation course.',
  contentRevision: 5,
  modules: [
    {
      externalKey: 'm1',
      title: 'Variables',
      description: 'names and values',
      position: 1,
      isVisible: false,
      lectures: [
        {
          externalKey: 'l1',
          title: 'Assignment',
          description: '',
          position: 1,
          isVisible: false,
          materials: [
            {
              type: 'PROGRAMMING_EXERCISE',
              title: 'Sum 1..N',
              position: 1,
              isRequired: true,
              isVisible: false,
              programmingExercise: {
                externalKey: 'p1',
                legacyProblemNo: 412,
                difficulty: 'EASY',
                description: '<p>Add them up.</p>',
                inputFormat: 'one integer',
                outputFormat: 'one integer',
                constraints: '1 <= n <= 100',
                starterCode: 'n = int(input())',
                solutionCode: 'print(sum(range(1, n + 1)))',
                language: 'PYTHON',
                timeLimitMs: 3000,
                memoryLimitMb: 256,
                aiFeedbackEnabled: true,
                gradingRevision: 9,
                testCases: [
                  {
                    position: 1,
                    input: '3',
                    expectedOutput: '6',
                    visibility: 'SAMPLE',
                  },
                ],
                hints: [
                  { position: 1, content: 'Try a loop.', triggerExpression: null },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

function build(source=master) {
  const created: Record<string, unknown[]> = {
    courseModule: [],
    lecture: [],
    material: [],
    programmingExercise: [],
    manualMaterial: [],
    exerciseTestCase: [],
    exerciseHint: [],
  };
  let courseData: Record<string, unknown> = {};

  const tx = {
    course: {
      create: vi.fn(({ data }) => {
        courseData = data;
        return Promise.resolve({ id: data.id });
      }),
    },
    ...Object.fromEntries(
      Object.keys(created).map((model) => [
        model,
        {
          createMany: vi.fn(({ data }) => {
            created[model]!.push(...data);
            return Promise.resolve({ count: data.length });
          }),
        },
      ]),
    ),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };

  const prisma = {
    academy: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ organizationId: 'org-1', kind: 'ACADEMY' }),
      findFirst: vi.fn().mockResolvedValue({ id: libraryId }),
    },
    course: {
      // The adoptable-master check, then the title clash check.
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(where.title ? null : { id: masterId }),
      ),
      findUniqueOrThrow: vi.fn(({ include }) =>
        Promise.resolve(
          include && 'modules' in include && 'orderBy' in (include.modules as object)
            ? source
            : {
                id: 'new-course',
                academyId: branchId,
                title: 'Python Level 1',
                description: master.description,
                isVisible: false,
                contentRevision: 1,
                baselineRevision: 1,
                sourceContentRevision: 5,
                sourceCourse: {
                  id: masterId,
                  title: master.title,
                  contentRevision: 5,
                  retiredAt: null,
                },
                createdAt: new Date('2026-09-03T00:00:00.000Z'),
                updatedAt: new Date('2026-09-03T00:00:00.000Z'),
                modules: [],
              },
        ),
      ),
    },
    $transaction: vi.fn((run: (t: unknown) => unknown) => run(tx)),
  } as never;

  const service = new AcademyLibraryService(
    prisma,
    { requirePermission: vi.fn().mockResolvedValue({ userId: 'lead-1' }) } as never,
    { write: vi.fn().mockResolvedValue({}) } as never,
  );

  return { service, created, courseValue: () => courseData };
}

describe('AcademyLibraryService.adopt', () => {
  it('carries every level of the master across', async () => {
    const { service, created } = build();

    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });

    expect(created.courseModule).toHaveLength(1);
    expect(created.lecture).toHaveLength(1);
    expect(created.material).toHaveLength(1);
    expect(created.programmingExercise).toHaveLength(1);
    expect(created.exerciseTestCase).toHaveLength(1);
    expect(created.exerciseHint).toHaveLength(1);
  });

  /**
   * Keys are unique per course, and this is a new course, so they cannot
   * collide. Preserving them is what lets the branch round-trip its copy
   * through the Excel importer exactly as it could a course it wrote by hand.
   */
  it('preserves the import keys rather than regenerating them', async () => {
    const { service, created } = build();
    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });
    expect(created.courseModule[0]).toMatchObject({ externalKey: 'm1' });
    expect(created.lecture[0]).toMatchObject({ externalKey: 'l1' });
    expect(created.programmingExercise[0]).toMatchObject({ externalKey: 'p1' });
  });

  it('copies the whole problem, its cases and its hints', async () => {
    const { service, created } = build();
    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });
    expect(created.programmingExercise[0]).toMatchObject({
      difficulty: 'EASY',
      solutionCode: 'print(sum(range(1, n + 1)))',
      timeLimitMs: 3000,
      aiFeedbackEnabled: true,
    });
    expect(created.exerciseTestCase[0]).toMatchObject({
      input: '3',
      expectedOutput: '6',
      visibility: 'SAMPLE',
    });
    expect(created.exerciseHint[0]).toMatchObject({ content: 'Try a loop.' });
  });

  /** Two fields that identify the master's own history, not the copy's. */
  it('leaves the legacy problem number and grading revision behind', async () => {
    const { service, created } = build();
    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });
    expect(created.programmingExercise[0]).not.toHaveProperty('legacyProblemNo');
    expect(created.programmingExercise[0]).not.toHaveProperty('gradingRevision');
  });

  /**
   * The bug this rule exists to prevent: head office never toggles a row in the
   * library — nothing there is read by a student — so a copy that inherited
   * those flags arrived complete and able to teach nothing, and its Team Lead
   * had several hundred toggles between them and a working course.
   */
  it('lands the whole tree visible, whatever the master says', async () => {
    const { service, created } = build();

    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });

    expect(created.courseModule[0]).toMatchObject({ isVisible: true });
    expect(created.lecture[0]).toMatchObject({ isVisible: true });
    expect(created.material[0]).toMatchObject({ isVisible: true });
  });

  it('lands hidden, stamped with the revision it was taken at', async () => {
    const { service, courseValue } = build();
    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Gangnam Python 1',
    });
    expect(courseValue()).toMatchObject({
      academyId: branchId,
      title: 'Gangnam Python 1',
      isVisible: false,
      contentRevision: 1,
      baselineRevision: 1,
      sourceCourseId: masterId,
      sourceContentRevision: 5,
    });
  });

  /**
   * `contentRevision === baselineRevision` is what makes the copy read as
   * untouched. If the two ever differed at hand-off, every copy on the
   * platform would show as customized the moment it arrived.
   */
  it('starts level with its own baseline, so a fresh copy is not customized', async () => {
    const { service, courseValue } = build();
    await service.adopt(identity, {
      academyId: branchId,
      libraryCourseId: masterId,
      title: 'Python Level 1',
    });
    const data = courseValue() as { contentRevision: number; baselineRevision: number };
    expect(data.contentRevision).toBe(data.baselineRevision);
  });
});

describe('manual material adoption',()=>{
 it('remaps choice identities and keys while preserving private content and excluding history',async()=>{
  const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
  const definition={version:1,question:'Original choice',selectionMode:'SINGLE',options:ids.map((id,i)=>({id,content:`Original ${i}`})),correctOptionIds:[ids[1]],shuffleOptions:true,explanationEnabled:true,explanation:'PRIVATE_EXPLANATION'};
  const manual={revision:7,description:'',files:{},assets:[],solutionAssets:[],multipleChoice:definition,shortAnswer:null,modelAnswer:'',includeInScore:true,submitEnabled:true,maximumHundredths:10000};
  const source={...master,modules:[{...master.modules[0],lectures:[{...master.modules[0].lectures[0],materials:[{title:'Choice',type:'MULTIPLE_CHOICE',position:1,isRequired:true,isVisible:true,manualMaterial:manual}]}]}]} as unknown as typeof master;
  const {service,created}=build(source);
  await service.adopt(identity,{academyId:branchId,libraryCourseId:masterId,title:'Choice copy'});
  const copy=created.manualMaterial[0] as {multipleChoice:typeof definition;revision:number};
  expect(copy.revision).toBe(1);
  expect(copy.multipleChoice.options.map(o=>o.id)).not.toEqual(ids);
  expect(copy.multipleChoice.correctOptionIds).toEqual([copy.multipleChoice.options[1].id]);
  expect(copy.multipleChoice.explanation).toBe('PRIVATE_EXPLANATION');
  expect(created.material[0]).toMatchObject({type:'MULTIPLE_CHOICE',isVisible:false});
  expect(copy).not.toHaveProperty('submissions');expect(copy).not.toHaveProperty('drafts');
 });
 it('copies private author configuration and immutable assets into fresh materials without student history',async()=>{
  const manual={revision:7,runtimeVersion:'approved-image',description:'Draw a circle',entryPoint:'main.py',files:{'main.py':'import turtle'},solutionFiles:{'main.py':'PRIVATE'},assets:[{assetId:'asset',name:'shape.gif',byteSize:43}],solutionAssets:[],modelAnswer:'PRIVATE_ANSWER',includeInScore:true,submitEnabled:true,maximumHundredths:10000};
  const source={...master,modules:[{...master.modules[0],lectures:[{...master.modules[0].lectures[0],materials:[{title:'Turtle',type:'TURTLE_EXERCISE',position:1,isRequired:true,isVisible:true,manualMaterial:manual}]}]}]} as unknown as typeof master;
  const {service,created}=build(source);await service.adopt(identity,{academyId:branchId,libraryCourseId:masterId,title:'Turtle copy'});
  expect(created.manualMaterial).toHaveLength(1);expect(created.programmingExercise).toHaveLength(0);
  expect(created.manualMaterial[0]).toMatchObject({...manual,revision:1});
  expect(created.manualMaterial[0]).not.toHaveProperty('submissions');expect(created.manualMaterial[0]).not.toHaveProperty('drafts');
  expect(created.material[0]).toMatchObject({type:'TURTLE_EXERCISE',isVisible:true});expect(created.manualMaterial[0]).toHaveProperty('materialId');
 });
});
