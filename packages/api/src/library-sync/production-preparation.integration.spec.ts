import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it, describe } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { prepareLibrarySync } from './prepare.js';
import { deleteSyncFixture } from './sync-fixture-cleanup.js';

const url = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!url)('library deployment preparation (disposable PostgreSQL)', () => {
  const ids = { org: randomUUID(), user: randomUUID(), library: randomUUID(), academy: randomUUID(), archived: randomUUID(), master: randomUUID(), hidden: randomUUID() };
  let db: PrismaClient;
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await db.organization.create({ data: { id: ids.org, name: 'Deployment fixture', slug: ids.org } });
    await db.user.create({ data: { id: ids.user, authUserId: randomUUID() } });
    await db.academy.createMany({ data: [
      { id: ids.library, organizationId: ids.org, name: 'Library', slug: ids.library, kind: 'LIBRARY' },
      { id: ids.academy, organizationId: ids.org, name: 'Academy', slug: ids.academy, kind: 'ACADEMY' },
      { id: ids.archived, organizationId: ids.org, name: 'Archived', slug: ids.archived, kind: 'ACADEMY', status: 'ARCHIVED' },
    ] });
    await db.course.createMany({ data: [
      { id: ids.master, academyId: ids.library, title: 'Published master', isVisible: true, createdByUserId: ids.user },
      { id: ids.hidden, academyId: ids.library, title: 'Unpublished master', isVisible: false, createdByUserId: ids.user },
    ] });
  });
  afterAll(async () => { if (db) { await deleteSyncFixture(db, { organizationId: ids.org, userIds: [ids.user] }); await db.$disconnect(); } });

  it('checks without writes, snapshots only published masters, enables active academies, and is idempotent', async () => {
    expect(await prepareLibrarySync(db, { checkOnly: true, enableAllAcademies: true })).toMatchObject({ initialReleases: 1, enabledAcademies: 0 });
    expect(await db.libraryRelease.count()).toBe(0);
    expect(await db.academyFeatureFlag.count()).toBe(0);
    expect(await prepareLibrarySync(db, { enableAllAcademies: true })).toMatchObject({ initialReleases: 1, enabledAcademies: 1 });
    expect(await db.libraryRelease.findMany({ select: { libraryCourseId: true, number: true } })).toEqual([{ libraryCourseId: ids.master, number: 1 }]);
    expect(await db.academyFeatureFlag.findMany({ select: { academyId: true, isEnabled: true } })).toEqual([{ academyId: ids.academy, isEnabled: true }]);
    expect(await db.courseSyncState.count()).toBe(0);
    expect(await prepareLibrarySync(db, { enableAllAcademies: true })).toMatchObject({ initialReleases: 0, enabledAcademies: 0 });
  });

  it('stops before enablement when a published master has an unavailable PDF', async () => {
    await db.academyFeatureFlag.update({ where: { academyId_feature: { academyId: ids.academy, feature: 'LIBRARY_COURSE_SYNC' } }, data: { isEnabled: false } });
    const course = await db.course.create({ data: { academyId: ids.library, title: 'Unavailable PDF', isVisible: true, createdByUserId: ids.user } });
    const module = await db.courseModule.create({ data: { courseId: course.id, title: 'Module', externalKey: randomUUID(), position: 1 } });
    const lecture = await db.lecture.create({ data: { courseModuleId: module.id, title: 'Lecture', externalKey: randomUUID(), position: 1 } });
    const asset = await db.pdfAsset.create({ data: { academyId: ids.library, courseId: course.id, lectureId: lecture.id,
      uploaderUserId: ids.user, objectKey: randomUUID(), originalFilename: 'pending.pdf', byteSize: 10, checksumSha256: 'fixture', state: 'PENDING' } });
    await db.material.create({ data: { lectureId: lecture.id, type: 'PDF_DOCUMENT', title: 'Pending document', position: 1, pdfDocument: { create: { assetId: asset.id } } } });
    await expect(prepareLibrarySync(db, { enableAllAcademies: true })).rejects.toThrow('Cannot publish');
    expect(await db.libraryRelease.count({ where: { libraryCourseId: course.id } })).toBe(0);
    expect((await db.academyFeatureFlag.findUniqueOrThrow({ where: { academyId_feature: { academyId: ids.academy, feature: 'LIBRARY_COURSE_SYNC' } } })).isEnabled).toBe(false);
  });
});
