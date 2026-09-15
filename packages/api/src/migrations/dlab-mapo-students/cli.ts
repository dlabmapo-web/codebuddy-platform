import "dotenv/config";

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import {
  buildPlaceholderEmail,
  studentPasswordSchema,
  usernameSchema,
} from "@cove/shared";

import { planStudents, type DesiredStudent, type ExistingStudent } from "./plan.js";

/**
 * Creates the five placeholder student accounts for DLAB Mapo.
 *
 * Deliberately mirrors `AuthService.signUpStudent` rather than inventing a
 * second way to make a student: a confirmed Supabase identity against a
 * generated `no-email.cove.invalid` address, an ACTIVE Cove user carrying
 * `email_is_placeholder`, and a PENDING join request for the academy. The
 * accounts therefore arrive exactly where a self-signed-up student arrives —
 * in the manager's approval queue — and no class is chosen here.
 *
 * The identity is created before the Cove rows for the same reason it is
 * there: it is the only step that can fail for a reason Cove cannot see, and
 * an identity with no Cove row is the orphan state that leaves somebody
 * authenticated with nowhere to land. If the transaction fails, it is deleted.
 */
const TARGET_PROJECT_REF = "sfesugoedobirmeqjcvp";
const ACADEMY_SLUG = "dlab-mapo";

const desiredStudents: readonly DesiredStudent[] = Array.from({ length: 5 }, (_, index) => ({
  username: `student${index + 1}`,
  displayName: `Student${index + 1}`,
}));

/**
 * The password is read from the environment rather than written here.
 *
 * It is the live sign-in credential for five real accounts; committing it
 * would publish it to everyone with repository access and leave it in history
 * after any later change.
 */
const environmentSchema = z.object({
  SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => value.includes(TARGET_PROJECT_REF), {
      message: `SUPABASE_URL must point at the ${TARGET_PROJECT_REF} project.`,
    }),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//)
    .refine((value) => value.includes(TARGET_PROJECT_REF), {
      message: `DATABASE_URL must point at the ${TARGET_PROJECT_REF} project.`,
    }),
  DLAB_MAPO_STUDENT_PASSWORD: studentPasswordSchema,
});

export function requireConfirmation(argv: string[]): void {
  const args = argv.filter((argument) => argument !== "--");
  if (args.length !== 1 || args[0] !== `--confirm-academy=${ACADEMY_SLUG}`) {
    throw new Error(`This command requires exactly --confirm-academy=${ACADEMY_SLUG}.`);
  }
}

async function findAcademyId(pool: Pool): Promise<string> {
  const academy = await pool.query<{ id: string }>(
    `select id from academies where slug = $1 and status = 'ACTIVE'`,
    [ACADEMY_SLUG],
  );
  if (academy.rowCount !== 1) {
    throw new Error(`Expected exactly one active ${ACADEMY_SLUG} academy.`);
  }
  return academy.rows[0]!.id;
}

/**
 * Looks the desired names up by username, not by email.
 *
 * A student's address is a random uuid in a reserved domain, so unlike the
 * staff bootstrap there is no address to search Auth for; the username is the
 * only stable handle, and the Cove row is what carries it.
 */
async function inspectState(
  pool: Pool,
  supabase: SupabaseClient,
  academyId: string,
): Promise<Map<string, ExistingStudent>> {
  const usernames = desiredStudents.map((student) => student.username);
  const rows = await pool.query<{
    id: string;
    auth_user_id: string | null;
    username: string | null;
    status: string;
    email_is_placeholder: boolean;
    join_request_academy_id: string | null;
  }>(
    `select u.id, u.auth_user_id, u.username, u.status, u.email_is_placeholder,
            r.academy_id as join_request_academy_id
       from users u
       left join academy_join_requests r on r.user_id = u.id
      where u.username = any($1::text[])`,
    [usernames],
  );

  const existing = new Map<string, ExistingStudent>();
  for (const row of rows.rows) {
    if (!row.username) continue;
    const authUserId = row.auth_user_id
      ? ((await supabase.auth.admin.getUserById(row.auth_user_id)).data.user?.id ?? null)
      : null;
    existing.set(row.username, {
      coveUserId: row.id,
      coveAuthUserId: row.auth_user_id,
      coveUsername: row.username,
      coveStatus: row.status,
      coveEmailIsPlaceholder: row.email_is_placeholder,
      authUserId,
      joinRequestAcademyId: row.join_request_academy_id,
    });
  }
  return existing;
}

async function insertStudent(
  client: PoolClient,
  academyId: string,
  student: DesiredStudent,
  authUserId: string,
  email: string,
): Promise<{ userId: string; joinRequestId: string }> {
  const userId = randomUUID();
  const joinRequestId = randomUUID();
  await client.query("begin");
  try {
    await client.query(
      `insert into users
         (id, auth_user_id, email, email_is_placeholder, username, display_name,
          preferred_locale, platform_role, status, created_at, updated_at)
       values ($1, $2, $3, true, $4, $5, 'ko', 'USER', 'ACTIVE', now(), now())`,
      [userId, authUserId, email, student.username, student.displayName],
    );
    // status and requested_kind are left to their defaults, PENDING and
    // STUDENT, exactly as signUpStudent leaves them.
    await client.query(
      `insert into academy_join_requests
         (id, academy_id, user_id, created_at, updated_at)
       values ($1, $2, $3, now(), now())`,
      [joinRequestId, academyId, userId],
    );
    await client.query("commit");
    return { userId, joinRequestId };
  } catch (caught) {
    await client.query("rollback");
    throw caught;
  }
}

async function main(): Promise<void> {
  requireConfirmation(process.argv.slice(2));
  const environment = environmentSchema.parse(process.env);
  for (const student of desiredStudents) usernameSchema.parse(student.username);

  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 2,
    application_name: "dlab-mapo-student-bootstrap",
  });
  const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const academyId = await findAcademyId(pool);
    const plan = planStudents(desiredStudents, await inspectState(pool, supabase, academyId), academyId);

    for (const entry of plan.entries) {
      if (entry.action === "conflict") {
        console.error(`${entry.username}: ${entry.reasons.join(" ")}`);
      }
    }
    if (plan.hasConflict) {
      throw new Error("Refusing to continue: a desired username is already held by an account this script did not create.");
    }
    if (!plan.toCreate.length) {
      console.log("All five DLAB Mapo student accounts already exist; no changes made.");
      return;
    }

    const created: Array<{ username: string; userId: string; joinRequestId: string }> = [];
    for (const student of plan.toCreate) {
      const email = buildPlaceholderEmail(randomUUID());
      const identity = await supabase.auth.admin.createUser({
        email,
        password: environment.DLAB_MAPO_STUDENT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          username: student.username,
          full_name: student.displayName,
          requested_academy_id: academyId,
          requested_kind: "STUDENT",
        },
      });
      if (identity.error || !identity.data.user) {
        const detail = identity.error?.code === "weak_password"
          ? " Supabase refused the password as too weak; choose a stronger DLAB_MAPO_STUDENT_PASSWORD."
          : ` ${identity.error?.message ?? ""}`;
        throw new Error(`Could not create the Supabase identity for ${student.username}.${detail}`);
      }

      const client = await pool.connect();
      try {
        created.push({ username: student.username, ...(await insertStudent(client, academyId, student, identity.data.user.id, email)) });
      } catch (caught) {
        await supabase.auth.admin.deleteUser(identity.data.user.id).catch(() => undefined);
        throw caught;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify({
      academySlug: ACADEMY_SLUG,
      academyId,
      created,
      skipped: plan.entries.filter((entry) => entry.action === "skip").map((entry) => entry.username),
      next: "Approve them in Academy → People, then assign them to a class.",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((caught) => {
    console.error(caught instanceof Error ? caught.message : "DLAB Mapo student bootstrap failed.");
    process.exitCode = 1;
  });
}
