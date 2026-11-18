import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import { CourseService } from "../content/course.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { AcademyLibrarySyncService } from "./academy-sync.service.js";
import { publishRelease } from "./release-access.js";
import { lockCourseRow } from "./release.js";
import { LibrarySyncJobService } from "./sync-job.service.js";
import { deleteSyncFixture } from "./sync-fixture-cleanup.js";
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!databaseUrl)("published course review notifications (disposable PostgreSQL)", () => {
    const id = Object.fromEntries(['org', 'library', 'academy', 'other', 'admin', 'lead', 'manager', 'teacher', 'outsider', 'master', 'module', 'lecture', 'a', 'b'].map(key => [key, randomUUID()]));
    const auth = Object.fromEntries(['lead', 'manager', 'teacher', 'outsider'].map(key => [key, randomUUID()]));
    const identity = (key: string) => ({ authUserId: auth[key] } as SupabaseIdentity);
    const audit = new AuditService();
    const createClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: 'event', level: 'query' }] });
    let db: ReturnType<typeof createClient>, api: PrismaService, notices: NotificationsService, decisions: AcademyLibrarySyncService, jobs: LibrarySyncJobService;
    let copyId: string, copyA: string, copyB: string, statements = 0;
    const list = (who = 'lead') => notices.list(identity(who));
    const publish = () => db.$transaction(async (tx) => { await lockCourseRow(tx, id.master); return publishRelease(tx, audit, { libraryCourseId: id.master, note: '', actorUserId: id.admin, requireChanges: true }); }, { timeout: 60000 });
    const editMaster = async (body: string, second?: string) => {
        await db.explanationMaterial.update({ where: { materialId: id.a }, data: { body } });
        if (second)
            await db.explanationMaterial.update({ where: { materialId: id.b }, data: { body: second } });
        await db.course.update({ where: { id: id.master }, data: { contentRevision: { increment: 1 } } });
    };
    const resolve = async (action: 'ACCEPT_LIBRARY' | 'KEEP_ACADEMY') => {
        const pending = await decisions.updates(identity('lead'), { academyId: id.academy, courseId: copyId });
        const detail = await decisions.conflict(identity('lead'), { academyId: id.academy, conflictId: pending.conflicts[0].id });
        await decisions.resolve(identity('lead'), { academyId: id.academy, conflictId: detail.id, action, expectedOursHash: detail.expectedOursHash, expectedTheirsHash: detail.expectedTheirsHash, requestKey: randomUUID() });
    };
    beforeAll(async () => {
        db = createClient();
        db.$on('query', () => { statements++; });
        api = db as unknown as PrismaService;
        const access = new AcademyAccessService(api, new SupportGrantResolver(api));
        notices = new NotificationsService(api);
        decisions = new AcademyLibrarySyncService(api, access, audit, { revokeClass: vi.fn() } as never);
        jobs = new LibrarySyncJobService(api, new ConfigService({ LIBRARY_SYNC_ENABLED: true, LIBRARY_SYNC_CONCURRENCY: 1 }) as never, audit, { revokeClass: vi.fn() } as never);
        await db.organization.create({ data: { id: id.org, name: 'Review notices', slug: `notices-${id.org}` } });
        await db.user.createMany({ data: ['admin', 'lead', 'manager', 'teacher', 'outsider'].map(key => ({ id: id[key], authUserId: auth[key] ?? randomUUID(), status: 'ACTIVE' as const, platformRole: key === 'admin' ? 'ADMIN' as const : 'USER' as const })) });
        await db.academy.createMany({ data: ['library', 'academy', 'other'].map(key => ({ id: id[key], organizationId: id.org, name: key, slug: `${key}-${id[key]}`, kind: key === 'library' ? 'LIBRARY' as const : 'ACADEMY' as const })) });
        await db.academyMembership.createMany({ data: [
                { academyId: id.academy, userId: id.lead, role: 'TEAM_LEAD', status: 'ACTIVE' },
                { academyId: id.academy, userId: id.manager, role: 'TEACHER', status: 'ACTIVE' },
                { academyId: id.academy, userId: id.teacher, role: 'TEACHER', status: 'ACTIVE' },
                { academyId: id.other, userId: id.outsider, role: 'MANAGER', status: 'ACTIVE' },
            ] });
        const member = await db.academyMembership.findUniqueOrThrow({ where: { academyId_userId: { academyId: id.academy, userId: id.manager } } });
        await db.academyMembershipRole.create({ data: { membershipId: member.id, role: 'MANAGER' } });
        await db.academyFeatureFlag.create({ data: { academyId: id.academy, feature: 'LIBRARY_COURSE_SYNC', isEnabled: true } });
        await db.course.create({ data: { id: id.master, academyId: id.library, title: 'Publish a batch', isVisible: true, createdByUserId: id.admin } });
        await db.courseModule.create({ data: { id: id.module, courseId: id.master, externalKey: 'm1', title: 'Module', position: 1 } });
        await db.lecture.create({ data: { id: id.lecture, courseModuleId: id.module, externalKey: 'l1', title: 'Lecture', position: 1 } });
        await db.material.createMany({ data: [{ id: id.a, lectureId: id.lecture, type: 'EXPLANATION', title: 'Problem 10', position: 1 }, { id: id.b, lectureId: id.lecture, type: 'EXPLANATION', title: 'Problem 40', position: 2 }] });
        await db.explanationMaterial.createMany({ data: [{ materialId: id.a, body: '<p>Original A</p>' }, { materialId: id.b, body: '<p>Original B</p>' }] });
        await publish();
        copyId = (await new AcademyLibraryService(api, access, audit).adopt(identity('lead'), { academyId: id.academy, libraryCourseId: id.master, title: 'Academy copy' })).id;
        const links = await db.librarySyncLink.findMany({ where: { copyCourseId: copyId, nodeKey: { in: [id.a, id.b] } } });
        copyA = links.find(row => row.nodeKey === id.a)!.localId!;
        copyB = links.find(row => row.nodeKey === id.b)!.localId!;
    });
    afterAll(async () => { if (db) {
        await deleteSyncFixture(db, { organizationId: id.org, userIds: ['admin', 'lead', 'manager', 'teacher', 'outsider'].map(key => id[key]) });
        await db.$disconnect();
    } });
    it('keeps several saves private, then quietly merges independent fields and identical edits', async () => {
        await db.explanationMaterial.update({ where: { materialId: copyA }, data: { body: '<p>Academy A</p>' } });
        await db.explanationMaterial.update({ where: { materialId: copyB }, data: { body: '<p>Same B</p>' } });
        await db.explanationMaterial.update({ where: { materialId: id.a }, data: { sideBody: '<p>Admin side note</p>' } });
        await db.course.update({ where: { id: id.master }, data: { contentRevision: { increment: 1 } } });
        await db.explanationMaterial.update({ where: { materialId: id.b }, data: { body: '<p>Same B</p>' } });
        await db.course.update({ where: { id: id.master }, data: { contentRevision: { increment: 1 } } });
        await jobs.drain();
        expect((await list()).items).toEqual([]);
        expect((await db.explanationMaterial.findUniqueOrThrow({ where: { materialId: copyA } })).sideBody).toBeNull();
        await publish();
        await jobs.drain();
        expect((await list()).items).toEqual([]);
        expect(await db.explanationMaterial.findUniqueOrThrow({ where: { materialId: copyA } })).toMatchObject({ body: '<p>Academy A</p>', sideBody: '<p>Admin side note</p>' });
    });
    it('groups a publication by course, scopes roles and academies, and lists in three statements', async () => {
        await db.explanationMaterial.update({ where: { materialId: copyB }, data: { body: '<p>Academy B customized</p>' } });
        await editMaster('<p>Admin A</p>', '<p>Admin B</p>');
        await publish();
        await jobs.drain();
        const before = statements;
        const result = await list();
        const used = statements - before;
        expect(used).toBe(3);
        process.stdout.write(`notification list statements: ${used}\n`);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ id: copyId, kind: 'COURSE_CONTENT_REVIEW', course: { pendingCount: 2, reviewVersion: 1 } });
        expect((await list('manager')).unreadCount).toBe(1); // additional Manager role
        expect((await list('teacher')).items).toEqual([]);
        expect((await list('outsider')).items).toEqual([]);
        await expect(notices.acknowledge(identity('outsider'), copyId, 1)).rejects.toBeTruthy();
        await expect(notices.acknowledge(identity('teacher'), copyId, 1)).rejects.toBeTruthy();
    });
    it('server-renders the selected material comparison with one permission check', async () => {
        const access = new AcademyAccessService(api, new SupportGrantResolver(api));
        const authorize = vi.spyOn(access, 'requirePermission');
        const service = new AcademyLibrarySyncService(api, access, audit, { revokeClass: vi.fn() } as never);
        const before = statements;
        const result = await service.updates(identity('lead'), { academyId: id.academy, courseId: copyId, nodeKey: id.a });
        const used = statements - before;
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(result.detail).toMatchObject({ nodeKey: id.a, ours: { value: '<p>Academy A</p>' }, theirs: { value: '<p>Admin A</p>' } });
        expect(used).toBeLessThanOrEqual(12);
        process.stdout.write(`server-rendered material comparison statements: ${used}\n`);
        await expect(service.updates(identity('teacher'), { academyId: id.academy, courseId: copyId, nodeKey: id.a })).rejects.toBeTruthy();
    });

    it('reading is per person, leaves content untouched, and unrelated publications do not re-alert', async () => {
        await notices.acknowledge(identity('lead'), copyId, 1);
        expect((await list()).unreadCount).toBe(0);
        expect((await list('manager')).unreadCount).toBe(1);
        expect((await db.courseSyncState.findUniqueOrThrow({ where: { courseId: copyId } })).openConflictCount).toBe(2);
        expect((await db.explanationMaterial.findUniqueOrThrow({ where: { materialId: copyA } })).body).toBe('<p>Academy A</p>');
        await db.material.update({ where: { id: id.a }, data: { title: 'Admin changed title only' } });
        await db.course.update({ where: { id: id.master }, data: { contentRevision: { increment: 1 } } });
        await publish();
        await jobs.drain();
        expect((await list()).unreadCount).toBe(0);
        expect((await db.courseSyncState.findUniqueOrThrow({ where: { courseId: copyId } })).reviewVersion).toBe(1);
    });
    it('a later overlapping publication re-alerts once; a stale notification click cannot acknowledge it', async () => {
        await editMaster('<p>Admin A v2</p>');
        await publish();
        await jobs.drain();
        await notices.acknowledge(identity('lead'), copyId, 1);
        expect((await list()).unreadCount).toBe(1);
        expect((await list()).items[0]).toMatchObject({ course: { reviewVersion: 2 } });
        await notices.acknowledge(identity('lead'), copyId, 2);
        expect((await list()).unreadCount).toBe(0);
    });
    it('accepts only the chosen part, keeps the other pending, then clears all reviewers when resolved', async () => {
        await resolve('ACCEPT_LIBRARY');
        expect((await list('manager')).items[0]).toMatchObject({ course: { pendingCount: 1 } });
        await resolve('KEEP_ACADEMY');
        expect((await list()).items).toEqual([]);
        expect((await list('manager')).items).toEqual([]);
        const state = await db.courseSyncState.findUniqueOrThrow({ where: { courseId: copyId } });
        expect(state.reviewItems).toEqual([]);
    });
    it('projects affected rows without another outline query, and withdrawing a role removes access', async () => {
        await db.explanationMaterial.update({ where: { materialId: copyA }, data: { body: '<p>Academy A third edit</p>' } });
        await editMaster('<p>Admin A v3</p>', '<p>Admin B v3</p>');
        await publish();
        await jobs.drain();
        const access = new AcademyAccessService(api, new SupportGrantResolver(api));
        const tree = await new CourseService(api, access, audit, { revokeClass: vi.fn() } as never).getOutline(identity('lead'), { academyId: id.academy, courseId: copyId });
        expect(tree.course.provenance?.linked?.reviewItems).toEqual(expect.arrayContaining([expect.objectContaining({ nodeKey: id.a, localId: copyA, unitKey: 'explanation.body' })]));
        const membership = await db.academyMembership.findUniqueOrThrow({ where: { academyId_userId: { academyId: id.academy, userId: id.manager } } });
        await db.academyMembershipRole.deleteMany({ where: { membershipId: membership.id } });
        expect((await list('manager')).items).toEqual([]);
        await expect(notices.acknowledge(identity('manager'), copyId, 3)).rejects.toBeTruthy();
    });
});
