import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { validateEnvironment } from "../config/env.schema.js";
import { PrismaClient } from "../generated/prisma/client.js";
import {
  decideBootstrap,
  describeBootstrapDecision,
  isBootstrapRefusal,
  normalizeBootstrapEmail,
  type BootstrapAccount,
} from "./bootstrap-admin.decision.js";

/**
 * Grants the first platform `ADMIN`, per §16 of the authorization design.
 *
 * A command and never an endpoint: there is no authenticated caller who could
 * be authorized to create the first authority. It promotes an account that
 * already exists and has already verified its email, so the trust chain ends
 * at Supabase rather than at whoever ran the script.
 *
 * Promoting a *second* admin is deliberately not this command's job. §16 asks
 * for a separately designed high-assurance process, and re-running a bootstrap
 * against a new address is the wrong shape for one.
 */
async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });

  try {
    const configuredEmail = environment.PLATFORM_BOOTSTRAP_ADMIN_EMAIL;
    let account: BootstrapAccount | null = null;
    let identityEmailVerified = false;

    // Only look anything up once the configuration itself is trustworthy. A
    // run pointed at the wrong environment must not touch that database at
    // all, not even to read.
    if (
      configuredEmail &&
      environment.PLATFORM_BOOTSTRAP_ENV === environment.NODE_ENV
    ) {
      account = await prisma.user.findUnique({
        where: { email: normalizeBootstrapEmail(configuredEmail) },
        select: {
          id: true,
          status: true,
          platformRole: true,
          authUserId: true,
        },
      });
      if (account?.authUserId) {
        const supabase = createClient(
          environment.SUPABASE_URL,
          environment.SUPABASE_SECRET_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { data } = await supabase.auth.admin.getUserById(
          account.authUserId,
        );
        identityEmailVerified = Boolean(data.user?.email_confirmed_at);
      }
    }

    const decision = decideBootstrap({
      configuredEmail,
      configuredEnvironment: environment.PLATFORM_BOOTSTRAP_ENV,
      runningEnvironment: environment.NODE_ENV,
      account,
      identityEmailVerified,
    });

    if (decision.kind === "promote") {
      await prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: decision.userId },
          data: { platformRole: "ADMIN" },
        });
        await transaction.auditLog.create({
          data: {
            // The promoted account is its own actor: nobody else in the system
            // holds the authority this record describes being created.
            actorUserId: decision.userId,
            academyId: null,
            action: "platform.admin.granted",
            targetType: "User",
            targetId: decision.userId,
            before: { platformRole: "USER" },
            after: { platformRole: "ADMIN" },
            reason: "bootstrap",
          },
        });
      });
    }

    console.log(describeBootstrapDecision(decision));
    if (isBootstrapRefusal(decision)) {
      process.exitCode = 1;
      return;
    }
    console.log(
      "Remove PLATFORM_BOOTSTRAP_ADMIN_EMAIL and PLATFORM_BOOTSTRAP_ENV to disable this command.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
