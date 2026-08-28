/**
 * Switch every feature on for academies created before there was a setting.
 *
 * The four per-academy features shipped default-off as rollout gates that
 * nothing could write, so academies created in that window hold no rows and
 * read as off everywhere. New academies now get the whole product at
 * creation; this brings the existing ones to the same place.
 *
 * Only ever adds. An academy whose manager has already switched something off
 * keeps that decision — `skipDuplicates` means an existing row, of either
 * value, is left exactly as it is.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { academyFeatureNames } from "@cove/shared";

import { PrismaClient } from "../../src/generated/prisma/client.js";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const academies = await prisma.academy.findMany({ select: { id: true, slug: true } });
let created = 0;

for (const academy of academies) {
  const result = await prisma.academyFeatureFlag.createMany({
    data: academyFeatureNames.map((feature) => ({
      academyId: academy.id,
      feature,
      isEnabled: true,
    })),
    skipDuplicates: true,
  });
  if (result.count > 0) {
    console.log(`  ${academy.slug}: ${result.count} feature(s) switched on`);
  }
  created += result.count;
}

console.log(`${academies.length} academies checked, ${created} rows written.`);
await prisma.$disconnect();
