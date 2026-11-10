// C/C++ in the regular localhost:3000 app, using its existing development DB.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/src/database/prisma.service.js';

const root = resolve(import.meta.dirname, '../../..');
const state = resolve(root, 'test-results/c-cpp-development');
const shared = resolve(state, 'shared');
const container = 'cove-native-development';
const owner = 'codebuddy-platform-c-cpp-development';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
if (!endpoint.startsWith('unix:///')) throw Error('A local Docker daemon is required');
function existing() {
  try { return JSON.parse(docker(['inspect', container]))[0]; } catch { return null; }
}
const previous = existing();
if (previous && previous.Config.Labels?.['cove.local-runtime'] !== owner) throw Error('Refusing to replace a container owned by another task');
if (process.argv.includes('--stop')) {
  if (previous) docker(['stop', '--time', '360', container]);
  console.log('Development native grader stopped. The practice course is preserved.');
  process.exit(0);
}
const apiDirectory = resolve(root, 'packages/api');
const localPath = resolve(apiDirectory, '.env.local');
let local = '';
try { local = await readFile(localPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = { ...dotenv.parse(await readFile(resolve(apiDirectory, '.env'))), ...dotenv.parse(local) };
// This is a development seed, never a production database discovery tool.
if (env.NODE_ENV === 'production' || new URL(env.SUPABASE_URL).hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co')
  throw Error('The configured Cove development Supabase project is required');
const redis = new URL(env.REDIS_URL);
if (!['127.0.0.1', 'localhost'].includes(redis.hostname) || redis.port !== '6380') throw Error('Expected the regular local development Redis on port 6380');
const network = Object.keys(JSON.parse(docker(['inspect', 'cove-redis']))[0].NetworkSettings.Networks)[0];
if (!network) throw Error('Development Redis must have a Docker network');
const image = docker(['image', 'inspect', '-f', '{{.Id}}', process.env.COVE_CPP_NATIVE_IMAGE ?? 'cove-native-node:cpp-local-verification']);
const academyId = '20000000-0000-4000-8000-000000000001';
const organizationId = '10000000-0000-4000-8000-000000000001';
const managerId = '30000000-0000-4000-8000-000000000002';
const teacherMembershipId = '40000000-0000-4000-8000-000000000004';
const studentMembershipId = '40000000-0000-4000-8000-000000000005';
// One course per language: a course's language is every coding problem's.
// (Earlier runs seeded c1000000-…-0001 mixing both; delete it from the course list.)
const ids = { class: 'c1000000-0000-4000-8000-000000000040' };
const courses = [
  { language: 'C', title: 'C Practice', course: 'c1000000-0000-4000-8000-000000000101', module: 'c1000000-0000-4000-8000-000000000110', lecture: 'c1000000-0000-4000-8000-000000000120',
    problems: [['c1000000-0000-4000-8000-000000000130', 4, 'C — Add two numbers']] },
  { language: 'CPP', title: 'C++ Practice', course: 'c1000000-0000-4000-8000-000000000201', module: 'c1000000-0000-4000-8000-000000000210', lecture: 'c1000000-0000-4000-8000-000000000220',
    problems: [['c1000000-0000-4000-8000-000000000230', 4, 'C++ — Add two numbers'], ['c1000000-0000-4000-8000-000000000231', 10, 'C++ — Ten test cases']] },
];
const sources = {
  C: '#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf("%d %d", &a, &b) != 2) return 1;\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
  CPP: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    if (!(cin >> a >> b)) return 1;\n    cout << a + b << "\\n";\n    return 0;\n}\n',
};
const examples = [[2, 3], [40, 2], [-7, 2], [0, 0], [9, -9], [100, 200], [-100, -200], [1000000000, 1000000000], [1, 0], [123, 456]];
const db = new PrismaService(new ConfigService({ DATABASE_URL: env.DATABASE_URL, DATABASE_POOL_MAX: 2 }));
try {
  const [academy, members, existing, klass] = await Promise.all([
    db.academy.findUnique({ where: { id: academyId }, select: { slug: true, organizationId: true } }),
    db.academyMembership.findMany({ where: { academyId, status: 'ACTIVE', id: { in: ['40000000-0000-4000-8000-000000000002', teacherMembershipId, studentMembershipId] } }, select: { id: true } }),
    db.course.findMany({ where: { id: { in: courses.map((entry) => entry.course) } }, select: { id: true, academyId: true } }),
    db.class.findUnique({ where: { id: ids.class }, select: { academyId: true } }),
  ]);
  if (academy?.slug !== 'development-academy' || academy.organizationId !== organizationId || members.length !== 3) throw Error('Expected the existing development academy and seeded manager/teacher/student');
  if (existing.some((course) => course.academyId !== academyId)) throw Error('Practice course ID belongs to another academy');
  if (klass && klass.academyId !== academyId) throw Error('Practice class ID belongs to another academy');
  for (const entry of courses) if (!existing.some((course) => course.id === entry.course)) await db.course.create({ data: {
    id: entry.course, academyId, createdByUserId: managerId, title: entry.title, language: entry.language, description: 'Try native ' + entry.title.split(' ')[0] + ': Run with input, Test, and Submit.', isVisible: true,
    modules: { create: { id: entry.module, externalKey: 'local-' + entry.language.toLowerCase(), title: entry.title.split(' ')[0] + ' Basics', position: 1, isVisible: true,
      lectures: { create: { id: entry.lecture, externalKey: 'local-' + entry.language.toLowerCase() + '-addition', title: 'Add two numbers', position: 1, isVisible: true,
        materials: { create: entry.problems.map(([id, count, title], index) => ({
          id, title, type: 'PROGRAMMING_EXERCISE', position: index + 1, isVisible: true,
          programmingExercise: { create: {
            externalKey: 'local-' + entry.language.toLowerCase() + '-' + (index + 1), language: entry.language, difficulty: 'EASY', description: '<p>Read two integers and print their sum.</p><p>The starter code is ready to run. Enter <code>40 2</code> in Program input and press Run to print <code>42</code>. Test run checks the examples; Submit checks every case.</p>',
            inputFormat: 'Two integers separated by a space.', outputFormat: 'Their sum on one line.', constraints: '-1,000,000,000 ≤ a, b ≤ 1,000,000,000',
            starterCode: sources[entry.language], solutionCode: sources[entry.language], solutions: { create: { position: 1, code: sources[entry.language] } },
            timeLimitMs: 1000, memoryLimitMb: 128, gradingMode: 'ELICE_STDIO', gradingSemanticVersion: 'elice-v1', continuationPolicy: 'CONTINUE_WITHIN_BUDGET', exitStatusPolicy: 'FAIL_ON_RUNTIME_ERROR', totalTimeLimitMs: 60000, comparatorTimeLimitMs: 100, materialMaximumHundredths: 10000, materialScorePolicy: 'PROPORTIONAL',
            testCases: { create: examples.slice(0, count).map(([a, b], i) => ({ position: i + 1, input: `${a} ${b}\n`, expectedOutput: String(a + b), visibility: i < 2 ? 'SAMPLE' : 'HIDDEN', weight: 1 })) },
          } },
        })) },
      } },
    } },
  } });
  await db.class.upsert({ where: { id: ids.class }, create: { id: ids.class, academyId, createdByUserId: managerId, teacherMembershipId, name: 'C/C++ Practice Class' }, update: {} });
  await db.classCourse.createMany({ data: courses.map((entry) => ({ classId: ids.class, courseId: entry.course, assignedByUserId: managerId })), skipDuplicates: true });
  await db.classEnrollment.createMany({ data: [{ classId: ids.class, membershipId: studentMembershipId, enrolledByUserId: managerId }], skipDuplicates: true });
} finally { await db.$disconnect(); }
await mkdir(shared, { recursive: true, mode: 0o700 });
const manifest = resolve(shared, 'manifest.json');
if (previous) { if (previous.State.Running) docker(['stop', '--time', '360', container]); docker(['rm', container]); }
await rm(manifest, { force: true });
redis.hostname = 'cove-redis'; redis.port = '6379';
const workerEnv = resolve(state, 'worker.env');
const values = { DATABASE_URL: env.DATABASE_URL, REDIS_URL: redis.href, NATIVE_DATABASE_POOL_MAX: '2', NATIVE_COMPARATOR_POOL_SIZE: '1', NATIVE_ELIGIBILITY: JSON.stringify([{ organizationId, academyId, contexts: ['live', 'preview'], kinds: ['official', 'staff-practice', 'sample', 'regrade', 'run'], maxCaseTimeLimitMs: 60000, languages: ['C', 'CPP'] }]) };
if (Object.values(values).some(value => /[\r\n]/.test(value))) throw Error('Invalid multiline worker configuration');
await writeFile(workerEnv, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
try {
  docker(['run', '-d', '--name', container, '--label', `cove.local-runtime=${owner}`, '--network', network,
    '--cgroupns=private', '--read-only', '--security-opt', 'no-new-privileges:true', '--security-opt', 'apparmor=unconfined', '--security-opt', 'seccomp=unconfined',
    '--cap-drop', 'ALL', ...['SYS_ADMIN', 'SYS_PTRACE', 'SETUID', 'SETGID', 'SYS_RESOURCE', 'DAC_OVERRIDE', 'CHOWN', 'SETPCAP'].flatMap(cap => ['--cap-add', cap]),
    '--cpus', '2', '--memory', '2560m', '--memory-swap', '2560m', '--pids-limit', '256',
    '--tmpfs', '/run/cove-native:rw,nosuid,nodev,noexec,size=64m,mode=0700', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m',
    '--tmpfs', '/var/lib/cove-native/artifacts:rw,nosuid,nodev,exec,size=256m,mode=0700', '--tmpfs', '/var/lib/cove-native/staging:rw,nosuid,nodev,noexec,size=192m,mode=0700',
    '--mount', `type=bind,src=${shared},dst=/run/cove-native-shared`, '--env-file', workerEnv, '--entrypoint', '/bin/sh', image, '/opt/cove/tools/container-node.sh', 'serve']);
} finally { await rm(workerEnv, { force: true }); }
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  if (!existing()?.State.Running) throw Error('Development grader stopped; inspect docker logs cove-native-development');
  try {
    await readFile(manifest);
    docker(['exec', container, '/opt/cove/node', '-e', "fetch('http://127.0.0.1:4102/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]);
    ready = true; break;
  } catch { await delay(1000); }
}
if (!ready) throw Error('Development grader readiness timed out');
const settings = { NATIVE_GRADING_ENABLED: 'true', NATIVE_GRADING_BRIDGE_ACK: 'filtered-compatibility-workers-v1', NATIVE_GRADING_MANIFEST: manifest };
local = local.split('\n').filter(line => line !== '# Native C/C++ for the regular development app (local Docker only).' && !Object.keys(settings).some(key => line.trimStart().startsWith(key + '='))).join('\n').trimEnd();
await writeFile(localPath, `${local}\n\n# Native C/C++ for the regular development app (local Docker only).\n${Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
const courseUrls = courses.map((entry) => `http://localhost:3000/academy/development-academy/learn/courses/${entry.course}`);
await writeFile(resolve(state, 'course.json'), JSON.stringify({ ids, courses, courseUrls, manifest, container }, null, 2));
console.log('C Practice and C++ Practice are ready in Cove Development Academy.');
for (const url of courseUrls) console.log(url);
console.log('Native grader: cove-native-development. Restart the regular API to load its new local settings.');
