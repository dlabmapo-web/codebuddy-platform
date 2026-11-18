// Isolated browser acceptance. Production never imports this identity provider.
import "reflect-metadata";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { nextAuthFixture } from "../../../deploy/native/next-auth-fixture.mjs";
import { loopbackApplication } from "../../../deploy/native/loopback-application.mjs";

const directory = process.env.COVE_LIBRARY_SYNC_BUILD_DIR;
const tenProblems = process.env.COVE_LIBRARY_SYNC_SCENARIO === "ten-problems";
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !directory ||
  process.env.DOTENV_CONFIG_PATH !== "/dev/null" ||
  database.hostname !== "127.0.0.1" ||
  database.pathname !== "/cove_library_sync"
)
  throw Error("Explicit disposable sync database required");
const studio = "http://127.0.0.1:3342",
  providerOrigin = "http://127.0.0.1:4343";
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "4342",
  WEB_ORIGIN: studio,
  SUPABASE_URL: "https://sync-fixture.invalid",
  SUPABASE_SECRET_KEY: "local-sync-secret",
  BFF_SHARED_SECRET: "local-library-sync-browser-only-never-production",
  MONITORING_REDIS_URL: process.env.REDIS_URL,
  LIBRARY_SYNC_ENABLED: "true",
  DLAB_SSO_ENABLED: "false",
  GUI_ENABLED: "false",
  VIDEO_LESSONS_ENABLED: "false",
  MULTIPLE_CHOICE_ENABLED: "true",
});
const provider = nextAuthFixture(studio);
const server = createServer((req, res) => {
  const url = new URL(req.url, providerOrigin);
  void provider
    .handle(req, res, url)
    .then((found) => {
      if (!found) res.writeHead(404).end();
    })
    .catch(() => res.writeHead(500).end());
});
await new Promise((r) => server.listen(4343, "127.0.0.1", r));
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? input.toString()),
  );
  return realFetch(
    url.origin === "https://sync-fixture.invalid"
      ? providerOrigin + url.pathname + url.search
      : input,
    init,
  );
};
const load = (path) =>
  import(pathToFileURL(resolve(directory, "src", path)).href);
const { PrismaService } = await load("database/prisma.service.js");
const { AuditService } = await load("academies/audit.service.js");
const { AcademyAccessService } = await load(
  "authorization/academy-access.service.js",
);
const { SupportGrantResolver } = await load(
  "authorization/support-grant.resolver.js",
);
const { AcademyLibraryService } = await load(
  "content/library/academy-library.service.js",
);
const { publishRelease } = await load("library-sync/release-access.js");
const ids = Object.fromEntries(
  [
    "org",
    "library",
    "academy",
    "admin",
    "manager",
    "student",
    "master",
    "module",
    "lecture",
    "explanation",
    "exercise",
    "choice",
    "classId",
  ].map((k) => [k, randomUUID()]),
);
const identities = Object.fromEntries(
  ["admin", "manager", "student"].map((k) => [
    k,
    { id: ids[k], authId: randomUUID() },
  ]),
);
const auth = Object.fromEntries(
  Object.entries(identities).map(([k, u]) => [
    k,
    provider.storageState(u, providerOrigin),
  ]),
);
const slug = tenProblems
  ? "cove-development"
  : "sync-browser-" + ids.academy.slice(0, 8);
let copyId, explanationId, exerciseId;
const create = NestFactory.create.bind(NestFactory);
NestFactory.create = async (...args) => {
  const app = await create(...args);
  const db = app.get(PrismaService);
  const audit = new AuditService();
  await db.organization.create({
    data: { id: ids.org, name: "Sync browser", slug },
  });
  await db.user.createMany({
    data: Object.entries(identities).map(([k, u]) => ({
      id: u.id,
      authUserId: u.authId,
      status: "ACTIVE",
      platformRole: k === "admin" ? "ADMIN" : "USER",
      username: k + u.id.slice(0, 8),
      displayName: k,
      email: k + "@fixture.invalid",
    })),
  });
  await db.academy.createMany({
    data: [
      {
        id: ids.library,
        organizationId: ids.org,
        kind: "LIBRARY",
        name: "Library",
        slug: "lib-" + slug,
      },
      {
        id: ids.academy,
        organizationId: ids.org,
        name: tenProblems ? "Cove Development" : "Sync academy",
        slug,
      },
    ],
  });
  await db.academyMembership.createMany({
    data: [
      {
        academyId: ids.academy,
        userId: ids.manager,
        role: "TEAM_LEAD",
        status: "ACTIVE",
      },
      {
        academyId: ids.academy,
        userId: ids.student,
        role: "STUDENT",
        status: "ACTIVE",
      },
    ],
  });
  await db.academyFeatureFlag.create({
    data: {
      academyId: ids.academy,
      feature: "LIBRARY_COURSE_SYNC",
      isEnabled: true,
    },
  });
  // The detailed scenario creates every course/material and makes every
  // authoring change through authenticated product APIs. Only identities,
  // organization, library and the academy are provisioned here.
  if (tenProblems)
    return loopbackApplication(app, async () => {
      await writeFile(
        resolve(directory, "browser.json"),
        JSON.stringify({ ids, slug, auth }),
        { mode: 0o600 },
      );
      console.log("Cove Development ten-problem scenario ready");
    });
  await db.course.create({
    data: {
      id: ids.master,
      academyId: ids.library,
      title: "Sync acceptance",
      description: "Library browser acceptance",
      isVisible: true,
      createdByUserId: ids.admin,
    },
  });
  await db.courseModule.create({
    data: {
      id: ids.module,
      courseId: ids.master,
      externalKey: "m",
      title: "Module",
      position: 1,
      isVisible: true,
    },
  });
  await db.lecture.create({
    data: {
      id: ids.lecture,
      courseModuleId: ids.module,
      externalKey: "l",
      title: "Lecture",
      position: 1,
      isVisible: true,
    },
  });
  await db.material.create({
    data: {
      id: ids.explanation,
      lectureId: ids.lecture,
      type: "EXPLANATION",
      title: "Explanation",
      position: 1,
      isVisible: true,
      explanationMaterial: { create: { body: "<p>Original library text</p>" } },
    },
  });
  await db.material.create({
    data: {
      id: ids.exercise,
      lectureId: ids.lecture,
      type: "PROGRAMMING_EXERCISE",
      title: "Solved problem",
      position: 2,
      isVisible: true,
      programmingExercise: {
        create: {
          externalKey: "p",
          difficulty: "EASY",
          description: "<p>Add</p>",
          testCases: {
            create: [
              {
                position: 1,
                input: "1",
                expectedOutput: "2",
                visibility: "SAMPLE",
              },
            ],
          },
        },
      },
    },
  });
  await db.material.create({
    data: {
      id: ids.choice, lectureId: ids.lecture, type: "MULTIPLE_CHOICE", title: "Quiz options", position: 3, isVisible: true,
      manualMaterial: { create: { files: {}, multipleChoice: {
        version: 1, question: "What is double 4?", selectionMode: "SINGLE", problemDescription: "",
        options: [4, 8, 16].map((value, index) => ({ id: `${ids.choice.slice(0, -1)}${index}`, content: `<p>${value}</p>` })),
        correctOptionIds: [`${ids.choice.slice(0, -1)}1`], shuffleOptions: false, explanationEnabled: false, explanation: "",
      } } },
    },
  });
  await db.$transaction((tx) =>
    publishRelease(tx, audit, {
      libraryCourseId: ids.master,
      note: "First",
      actorUserId: ids.admin,
      requireChanges: false,
    }),
  );
  const access = new AcademyAccessService(db, new SupportGrantResolver(db));
  copyId = (
    await new AcademyLibraryService(db, access, audit).adopt(
      { authUserId: identities.manager.authId },
      {
        academyId: ids.academy,
        libraryCourseId: ids.master,
        title: "Sync acceptance",
      },
    )
  ).id;
  const links = await db.librarySyncLink.findMany({
    where: { copyCourseId: copyId },
  });
  explanationId = links.find((l) => l.nodeKey === ids.explanation).localId;
  exerciseId = links.find((l) => l.nodeKey === ids.exercise).localId;
  await db.exerciseTestCase.updateMany({
    where: { exerciseMaterialId: exerciseId },
    data: { input: "4", expectedOutput: "8" },
  });
  await db.explanationMaterial.update({
    where: { materialId: explanationId },
    data: { body: "<p>Academy custom text</p>", revision: { increment: 1 } },
  });
  await db.class.create({
    data: {
      id: ids.classId,
      academyId: ids.academy,
      name: "Sync class",
      createdByUserId: ids.manager,
    },
  });
  await db.classCourse.create({
    data: {
      classId: ids.classId,
      courseId: copyId,
      assignedByUserId: ids.manager,
    },
  });
  const membership = await db.academyMembership.findUniqueOrThrow({
    where: {
      academyId_userId: { academyId: ids.academy, userId: ids.student },
    },
  });
  await db.classEnrollment.create({
    data: {
      classId: ids.classId,
      membershipId: membership.id,
      enrolledByUserId: ids.manager,
    },
  });
  await db.studentExerciseProgress.create({
    data: {
      userId: ids.student,
      materialId: exerciseId,
      status: "SOLVED",
      gradingRevision: 1,
      attemptCount: 1,
      bestPassed: 1,
      bestScore: 100,
      firstSolvedAt: new Date(),
    },
  });
  await db.explanationMaterial.update({
    where: { materialId: ids.explanation },
    data: { body: "<p>Corrected library text</p>", revision: { increment: 1 } },
  });
  await db.exerciseTestCase.updateMany({
    where: { exerciseMaterialId: ids.exercise },
    data: { input: "6", expectedOutput: "12" },
  });
  await db.course.update({
    where: { id: ids.master },
    data: { contentRevision: { increment: 1 } },
  });
  return loopbackApplication(app, async () => {
    const cookie = auth.student.cookies.find(
      (c) => c.name === "sb-127-auth-token",
    );
    const token = JSON.parse(
      Buffer.from(cookie.value.slice(7), "base64url").toString(),
    ).access_token;
    const begin = await fetch(
      "http://127.0.0.1:4342/api/rpc/studentSession/begin",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "X-Cove-Bff-Secret": process.env.BFF_SHARED_SECRET,
        },
        body: JSON.stringify({ json: {} }),
      },
    );
    if (!begin.ok) throw Error("Student lease failed: " + (await begin.text()));
    await writeFile(
      resolve(directory, "browser.json"),
      JSON.stringify({ ids, slug, auth, copyId, explanationId, exerciseId }),
      { mode: 0o600 },
    );
    console.log("Library sync acceptance ready");
  });
};
process.chdir(directory);
await load("main.js");
