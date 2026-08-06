import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { developmentAcademy, developmentOrganization } from "./data/organizations.js";
import {
  developmentJoinedAt,
  developmentPassword,
  developmentUsers,
} from "./data/users.js";
import {
  assertDevelopmentSeedAllowed,
  assertNoCoveUserConflicts,
  synchronizeSupabaseUsers,
  validateSeedUsers,
} from "./seed-helpers.js";

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  assertDevelopmentSeedAllowed(environment.NODE_ENV);
  validateSeedUsers(developmentUsers);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const seedIds = developmentUsers.map((user) => user.id);
    const seedEmails = developmentUsers.map((user) => user.email);
    const seedUsernames = developmentUsers.map((user) => user.username);
    const existingBeforeAuth = await prisma.user.findMany({
      where: {
        OR: [
          { id: { in: seedIds } },
          { email: { in: seedEmails } },
          { username: { in: seedUsernames } },
        ],
      },
      select: { id: true, authUserId: true, email: true, username: true },
    });
    assertNoCoveUserConflicts(existingBeforeAuth, developmentUsers);

    console.log("🌱 Synchronizing Supabase Auth development users...");
    const authUserIds = await synchronizeSupabaseUsers(
      supabase.auth.admin,
      developmentUsers,
      developmentPassword,
    );

    const existingAfterAuth = await prisma.user.findMany({
      where: {
        OR: [
          { id: { in: seedIds } },
          { email: { in: seedEmails } },
          { username: { in: seedUsernames } },
          { authUserId: { in: [...authUserIds.values()] } },
        ],
      },
      select: { id: true, authUserId: true, email: true, username: true },
    });
    assertNoCoveUserConflicts(existingAfterAuth, developmentUsers, authUserIds);

    console.log("🌱 Upserting Cove development organization, academy, and users...");
    await prisma.$transaction(async (transaction) => {
      await transaction.organization.upsert({
        where: { id: developmentOrganization.id },
        update: {
          name: developmentOrganization.name,
          slug: developmentOrganization.slug,
          status: "ACTIVE",
        },
        create: { ...developmentOrganization, status: "ACTIVE" },
      });
      await transaction.academy.upsert({
        where: { id: developmentAcademy.id },
        update: {
          organizationId: developmentAcademy.organizationId,
          name: developmentAcademy.name,
          slug: developmentAcademy.slug,
          status: "ACTIVE",
        },
        create: { ...developmentAcademy, status: "ACTIVE" },
      });

      for (const seedUser of developmentUsers) {
        const authUserId = authUserIds.get(seedUser.id);
        if (!authUserId) {
          throw new Error(`Missing Supabase Auth identity for ${seedUser.email}.`);
        }
        const userData = {
          authUserId,
          email: seedUser.email,
          username: seedUser.username,
          displayName: seedUser.displayName,
          platformRole: seedUser.platformRole,
          status: "ACTIVE" as const,
        };
        await transaction.user.upsert({
          where: { id: seedUser.id },
          update: userData,
          create: { id: seedUser.id, ...userData },
        });

        if (seedUser.academyRole && seedUser.membershipId) {
          const membershipData = {
            academyId: developmentAcademy.id,
            userId: seedUser.id,
            role: seedUser.academyRole,
            status: "ACTIVE" as const,
            joinedAt: developmentJoinedAt,
            suspendedAt: null,
          };
          await transaction.academyMembership.upsert({
            where: {
              academyId_userId: {
                academyId: developmentAcademy.id,
                userId: seedUser.id,
              },
            },
            update: { id: seedUser.membershipId, ...membershipData },
            create: { id: seedUser.membershipId, ...membershipData },
          });
        }
      }
    });

    console.log("✅ Development authentication seed complete.");
    for (const user of developmentUsers) {
      console.log(`   - ${user.username} (${user.email})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Development seed failed.");
  process.exitCode = 1;
});
