/** Explicit per-master maintenance work unit; never loads .env or chooses a database implicitly. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { AuditService } from "../academies/audit.service.js";
import { lockCourseRow } from "./release.js";
import { latestOrInitialRelease } from "./release-access.js";

const courseId = process.argv[2];
const url = process.env.DIRECT_URL;
if (!url || !courseId || !/^[0-9a-f-]{36}$/i.test(courseId))
  throw Error("Supply an explicit DIRECT_URL and one library course UUID.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  const release = await db.$transaction(
    async (tx) => {
      await lockCourseRow(tx, courseId);
      const master = await tx.course.findFirst({
        where: {
          id: courseId,
          isVisible: true,
          retiredAt: null,
          academy: { kind: "LIBRARY" },
        },
        select: { id: true },
      });
      if (!master)
        throw Error("A published, unretired library master is required.");
      return latestOrInitialRelease(tx, courseId, new AuditService());
    },
    { timeout: 60_000 },
  );
  process.stdout.write(
    `Library release ${release.number} is ready. No feature flags were enabled.\n`,
  );
} finally {
  await db.$disconnect();
}
