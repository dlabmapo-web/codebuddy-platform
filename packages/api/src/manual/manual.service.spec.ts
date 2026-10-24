import { describe, it, expect, vi } from "vitest";
import { ManualService } from "./manual.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { AuditService } from "../academies/audit.service.js";
import type { GuiClientService } from "./gui-client.service.js";
import type { ManualAssetsService } from "./manual-assets.service.js";
import type { PointAwardService } from "../points/point-award.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
const identity = { authUserId: "auth-student" } as SupabaseIdentity;
const target = { academyId: "academy", materialId: "material" };
function fixture() {
  const config = {
    files: { "main.py": "print(1)" },
    solutionFiles: { "main.py": "PRIVATE" },
    modelAnswer: "PRIVATE_MODEL_ANSWER",
    assets: [],
    revision: 1,
    runtimeVersion: "image-v1",
  };
  const row = {
    id: "material",
    lectureId: "lecture",
    isVisible: true,
    type: "TURTLE_EXERCISE",
    title: "Turtle",
    manualMaterial: config,
    lecture: { courseModule: { course: { id: "course", title: "Course" } } },
  };
  const actor = { role: "STUDENT", userId: "student" };
  const db = {
    material: { findFirst: vi.fn().mockResolvedValue(row) },
    course: { findUnique: vi.fn().mockResolvedValue({ modules: [] }) },
    class: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "class" }),
    },
    manualMaterial: { findUnique: vi.fn().mockResolvedValue(null) },
    manualDraft: { findUnique: vi.fn().mockResolvedValue(null) },
    manualSubmission: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "intruder" }) },
    $transaction: vi.fn(),
  };
  const access = { requirePermission: vi.fn().mockResolvedValue(actor) },
    audit = { write: vi.fn() },
    gui = { request: vi.fn() },
    assets = { bytes: vi.fn() },
    points = { awardManualCompletion: vi.fn() };
  const service = new ManualService(
    db as unknown as PrismaService,
    access as unknown as AcademyAccessService,
    audit as unknown as AuditService,
    gui as unknown as GuiClientService,
    assets as unknown as ManualAssetsService,
    points as unknown as PointAwardService,
    {
      enabled: () => true,
      assertEnabled: () => {},
      evaluator: { evaluate: vi.fn() },
    } as never,
    { enabled: () => true, assertEnabled: () => {} } as never,
  );
  return { service, db, access, audit, gui, points, row, config };
}
describe("manual assessment boundaries", () => {
  it.each(['platform', 'support'])('does not grant personal participation to %s inspection', async (via) => {
    const { service, access, config } = fixture();
    Object.assign(config, { submitEnabled: true });
    access.requirePermission.mockResolvedValue({ role: 'STUDENT', roles: ['STUDENT'], userId: 'inspector', via } as never);
    expect((await service.workspace(identity, target)).participation).toMatchObject({ mode: 'inspection', canSubmit: false, reason: 'INSPECTION' });
    await expect(service.submit(identity, { ...target, classId: 'class', files: {}, answer: '', revision: 0, contentRevision: 1, requestKey: 'key' })).rejects.toThrow();
  });
  it('reads the latest owned class attempt independently of the bounded history', async () => {
    const { service, db } = fixture();
    db.class.findMany.mockResolvedValue([{ id: 'class', name: 'Delivery' }]);
    db.manualSubmission.findFirst.mockResolvedValue({ id: 'latest', userId: 'student', classId: 'class', files: {}, answer: '',
      createdAt: new Date('2026-10-23T00:00:00Z'), maximumHundredths: 2550, includeInScore: true,
      reviewVersion: 0, reviews: [], shortAnswerAssessment: null, multipleChoiceAssessment: null });
    const result = await service.workspace(identity, target);
    expect(result.latestSubmission).toMatchObject({ submissionId: 'latest', status: 'AWAITING_REVIEW', scoreHundredths: null });
    expect(db.manualSubmission.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { materialId: 'material', userId: 'student', classId: 'class' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
  });
  it.each([
    ['TEACHER', ['TEACHER'], false],
    ['TEAM_LEAD', ['TEAM_LEAD', 'TEACHER'], true],
    ['MANAGER', ['MANAGER', 'TEAM_LEAD', 'TEACHER'], true],
  ])('returns held-role assessment actions and the authorized class scope for %s', async (role, roles, canAuthor) => {
    const { service, db, access } = fixture();
    access.requirePermission.mockResolvedValue({ role, roles, userId: 'staff', via: 'membership' } as never);
    db.class.findMany.mockResolvedValue([{ id: 'assigned', name: 'Assigned class' }] as never);
    const result = await service.workspace(identity, target);
    expect(result.staff).toEqual({ canAuthor, canViewSolutions: true, canTutor: true, lectureId: 'lecture', classes: [{ classId: 'assigned', name: 'Assigned class' }] });
    const where = db.class.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain(role === 'TEACHER' ? 'assistantTeachers' : role);
    expect(JSON.stringify(where)).toContain('staff');
    expect(JSON.stringify(where)).toContain('course');
    expect(result.config.modelAnswer).toBe('');
    expect((await service.workspace(identity, target, true)).config.modelAnswer).toBe('PRIVATE_MODEL_ANSWER');
  });
  it('keeps platform inspection read-only without an authoring grant', async () => {
    const { service, access, db } = fixture();
    access.requirePermission.mockImplementation(async (_auth, _academy, permission) => {
      if (permission === 'curriculum.manage') throw new Error('Read-only inspection');
      return { role: 'MANAGER', roles: ['MANAGER', 'TEAM_LEAD', 'TEACHER'], userId: 'operator', via: 'platform' } as never;
    });
    expect((await service.workspace(identity, target)).staff).toMatchObject({ canAuthor: false, canViewSolutions: true, canTutor: false, classes: [] });
    expect(db.class.findMany).not.toHaveBeenCalled();
  });
  it.each(['MANAGER', 'TEAM_LEAD'])('hides student actions and grants %s tutoring without a Teacher grant', async role => {
    const { service, db, access } = fixture();
    expect((await service.workspace(identity, target)).staff).toBeUndefined();
    access.requirePermission.mockResolvedValue({ role, roles: [role], userId: 'staff', via: 'membership' } as never);
    db.class.findMany.mockClear();
    expect((await service.workspace(identity, target)).staff).toMatchObject({ canAuthor: true, canTutor: true, classes: [] });
    expect(db.class.findMany).toHaveBeenCalled();
  });
  it.each(['MANAGER', 'TEAM_LEAD', 'TEACHER'])('checks the current class scope for %s written/quiz review', async role => {
    const { service, db, access } = fixture();
    access.requirePermission.mockResolvedValue({ role, roles: [role, 'TEACHER'], userId: 'staff', via: 'membership' } as never);
    db.class.findFirst.mockResolvedValue({ id: 'class', courseAssignments: [] } as never);
    await service.classMaterials(identity, { academyId: 'academy', classId: 'class' });
    const where = db.class.findFirst.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain('staff');
    expect(JSON.stringify(where)).toContain(role === 'TEACHER' ? 'assistantTeachers' : role);
    db.class.findFirst.mockResolvedValue(null as never);
    await expect(service.classMaterials(identity, { academyId: 'academy', classId: 'unassigned' })).rejects.toThrow();
  });
  it.each(['MANAGER', 'TEAM_LEAD'])('allows %s to review without a separate teaching grant', async role => {
    const { service, access, db } = fixture();
    db.class.findFirst.mockResolvedValue({ id: 'class', courseAssignments: [] } as never);
    access.requirePermission.mockResolvedValue({ role, roles: [role], userId: 'staff', via: 'membership' } as never);
    await expect(service.classMaterials(identity, { academyId: 'academy', classId: 'class' })).resolves.toBeDefined();
  });
  it("projects only public attempt fields and omits private solutions for learners", async () => {
    const { service, db } = fixture();
    db.manualSubmission.findMany.mockResolvedValue([
      {
        id: "submission",
        userId: "student",
        classId: "class",
        files: { "main.py": "print(2)" },
        answer: "",
        createdAt: new Date(),
        maximumHundredths: 10000,
        includeInScore: true,
        reviewVersion: 0,
        reviews: [],
        profile: { solutionFiles: { "main.py": "SECRET_PROFILE" } },
      },
    ]);
    const result = await service.workspace(identity, target);
    expect(result.config.solutionFiles).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("SECRET_PROFILE");
    expect(result.attempts[0]).not.toHaveProperty("profile");
  });
  it("applies all visibility ancestors and the assigned-course scope to direct URLs", async () => {
    const { service, db, access } = fixture();
    await service.workspace(identity, target);
    expect(access.requirePermission).toHaveBeenCalledWith(
      "auth-student",
      "academy",
      "curriculum.read",
    );
    const where = db.material.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("isVisible");
    expect(JSON.stringify(where)).toContain("enrollments");
    expect(where.type.in).toEqual([
      "TURTLE_EXERCISE",
      "WRITTEN_RESPONSE",
      "MULTIPLE_CHOICE",
    ]);
  });
  it("denies a guessed session id without cancelling its owner’s run", async () => {
    const { service, gui } = fixture();
    (service as unknown as { sessions: Map<string, unknown> }).sessions.set(
      "session",
      { target, userId: "owner", preview: false },
    );
    await expect(service.session(identity, "session")).rejects.toThrow();
    expect(gui.request).not.toHaveBeenCalled();
  });
  it("rejects stale reviews before publishing history, audit or awards", async () => {
    const { service, db, audit, points } = fixture();
    db.manualSubmission.findFirst.mockResolvedValue({
      id: "submission",
      materialId: "material",
      userId: "student",
      classId: "class",
      maximumHundredths: 10000,
    });
    db.manualSubmission.updateMany.mockResolvedValue({ count: 0 });
    db.$transaction.mockImplementation(async (callback) => callback(db));
    await expect(
      service.review(identity, {
        ...target,
        submissionId: "submission",
        expectedVersion: 0,
        scoreHundredths: 100,
        completed: true,
        feedback: "text",
      }),
    ).rejects.toThrow("Review changed");
    expect(audit.write).not.toHaveBeenCalled();
    expect(points.awardManualCompletion).not.toHaveBeenCalled();
  });
});

describe("short-answer privacy and draft policy", () => {
  it("redacts private definitions from the learner workspace", async () => {
    const { service, db, row } = fixture();
    db.material.findFirst.mockResolvedValue({
      ...row,
      type: "WRITTEN_RESPONSE",
      manualMaterial: {
        ...row.manualMaterial,
        shortAnswer: {
          version: 1,
          question: "Public question",
          gradingMode: "REGEX",
          expectedAnswer: "PRIVATE_LITERAL",
          pattern: "PRIVATE_PATTERN",
          explanationEnabled: true,
          explanation: "PRIVATE_EXPLANATION",
        },
      },
    } as never);
    const workspace = await service.workspace(identity, target);
    expect(workspace.config.shortAnswer?.question).toBe("Public question");
    expect(JSON.stringify(workspace)).not.toMatch(
      /PRIVATE_LITERAL|PRIVATE_PATTERN|PRIVATE_EXPLANATION|PRIVATE_MODEL_ANSWER/,
    );
  });
  it("rejects autosave requests for new short-answer definitions", async () => {
    const { service, db, row } = fixture();
    db.material.findFirst.mockResolvedValue({
      ...row,
      type: "WRITTEN_RESPONSE",
      manualMaterial: {
        ...row.manualMaterial,
        shortAnswer: {
          version: 1,
          question: "Public question",
          gradingMode: "MANUAL",
        },
      },
    } as never);
    await expect(
      service.draft(identity, {
        ...target,
        files: {},
        answer: "Unsent",
        revision: 0,
      }),
    ).rejects.toThrow("explicit Submit");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("keeps configuration readable while flagging disabled short-answer admission", async () => {
    const { service, db, row } = fixture();
    db.material.findFirst.mockResolvedValue({
      ...row,
      type: "WRITTEN_RESPONSE",
      manualMaterial: {
        ...row.manualMaterial,
        shortAnswer: {
          version: 1,
          question: "Public question",
          gradingMode: "MANUAL",
        },
      },
    } as never);
    const shortAnswers = (
      service as unknown as { shortAnswers: { enabled: () => boolean } }
    ).shortAnswers;
    vi.spyOn(shortAnswers, "enabled").mockReturnValue(false);
    const workspace = await service.workspace(identity, target);
    expect(workspace.submissionUnavailable).toBe(true);
    expect(workspace.config.submitEnabled).toBe(true);
  });
});

describe("multiple-choice read and admission boundaries", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];
  const definition = {
    version: 1,
    question: "Public choice",
    selectionMode: "SINGLE",
    options: ids.map((id, i) => ({ id, content: `Option ${i}` })),
    correctOptionIds: [ids[0]],
    explanationEnabled: true,
    explanation: "PRIVATE_CHOICE_EXPLANATION",
  };
  function choiceFixture() {
    const f = fixture();
    f.db.material.findFirst.mockResolvedValue({
      ...f.row,
      type: "MULTIPLE_CHOICE",
      manualMaterial: { ...f.config, multipleChoice: definition },
    } as never);
    return f;
  }
  it("keeps flag-off public reads private and marks admission unavailable", async () => {
    const { service, db } = choiceFixture();
    const choices = (
      service as unknown as { choices: { enabled: () => boolean } }
    ).choices;
    vi.spyOn(choices, "enabled").mockReturnValue(false);
    const workspace = await service.workspace(identity, target);
    expect(workspace.submissionUnavailable).toBe(true);
    expect(workspace.config.multipleChoice?.question).toBe("Public choice");
    expect(JSON.stringify(workspace)).not.toMatch(/correctOptionIds|PRIVATE/);
    expect(db.manualDraft.findUnique).not.toHaveBeenCalled();
  });
  it("rejects draft autosave without a database write", async () => {
    const { service, db } = choiceFixture();
    await expect(
      service.draft(identity, {
        ...target,
        files: {},
        answer: "",
        revision: 0,
      }),
    ).rejects.toThrow("explicit Submit");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
