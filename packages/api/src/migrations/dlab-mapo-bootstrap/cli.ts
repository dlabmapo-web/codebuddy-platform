import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import { decideBootstrap, type DesiredBootstrapAccount, type ExistingBootstrapAccount } from "./decision.js";

const TARGET_PROJECT_REF = "sfesugoedobirmeqjcvp";
const ACADEMY_SLUG = "dlab-mapo";
const desiredAccounts = [
  { username: "mapo-teamlead", email: "mapo-teamlead@temporary.invalid", displayName: "Mapo Team Lead", role: "TEAM_LEAD" },
  { username: "mapo-teacher", email: "mapo-teacher@temporary.invalid", displayName: "Mapo Teacher", role: "TEACHER" },
] as const satisfies readonly DesiredBootstrapAccount[];

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url().refine((value) => value.includes(TARGET_PROJECT_REF)),
  SUPABASE_SECRET_KEY: z.string().min(1),
  MVP_MIGRATION_TARGET_DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//).refine((value) => value.includes(TARGET_PROJECT_REF)),
  DLAB_MAPO_BOOTSTRAP_ARTIFACT_DIR: z.string().min(1).default(".migration-artifacts/dlab-mapo-bootstrap"),
});

export function requireConfirmation(argv: string[]): void {
  const argumentsWithoutSeparator = argv.filter((argument) => argument !== "--");
  if (argumentsWithoutSeparator.length !== 1 || argumentsWithoutSeparator[0] !== `--confirm-academy=${ACADEMY_SLUG}`) {
    throw new Error(`This command requires exactly --confirm-academy=${ACADEMY_SLUG}.`);
  }
}

async function listAuthUsers(supabase: SupabaseClient): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const response = await supabase.auth.admin.listUsers({ page, perPage: 1_000 });
    if (response.error) throw new Error("Could not inspect Supabase Auth users.");
    users.push(...response.data.users);
    if (response.data.users.length < 1_000) return users;
  }
}

async function inspectState(pool: Pool, authUsers: AuthUser[]) {
  const academy = await pool.query<{ id: string }>(
    `select id from academies where slug = $1 and status = 'ACTIVE'`, [ACADEMY_SLUG],
  );
  if (academy.rowCount !== 1) throw new Error(`Expected exactly one active ${ACADEMY_SLUG} academy.`);
  const academyId = academy.rows[0]!.id;
  const managers = await pool.query<{ user_id: string }>(
    `select m.user_id from academy_memberships m join users u on u.id = m.user_id
      where m.academy_id = $1 and m.role = 'MANAGER' and m.status = 'ACTIVE' and u.status = 'ACTIVE'`, [academyId],
  );
  if (managers.rowCount !== 1) throw new Error("Expected exactly one active DLAB Mapo manager to act as audit actor.");

  const usernames = desiredAccounts.map(({ username }) => username);
  const emails = desiredAccounts.map(({ email }) => email);
  const desiredEmailSet = new Set<string>(emails);
  const coveRows = await pool.query<{
    id: string; auth_user_id: string | null; username: string | null; email: string | null; status: string;
    membership_academy_id: string | null; membership_role: string | null; membership_status: string | null;
  }>(
    `select u.id,u.auth_user_id,u.username,u.email,u.status,
            m.academy_id as membership_academy_id,m.role as membership_role,m.status as membership_status
       from users u left join academy_memberships m on m.user_id = u.id
      where u.username = any($1::text[]) or u.email = any($2::text[])`, [usernames, emails],
  );
  const authCandidates = authUsers.filter((user) => user.email && desiredEmailSet.has(user.email));
  const existing = new Map<string, ExistingBootstrapAccount>();
  for (const desired of desiredAccounts) {
    const coveMatches = coveRows.rows.filter((row) => row.username === desired.username || row.email === desired.email);
    const authMatches = authCandidates.filter((row) => row.email === desired.email);
    if (!coveMatches.length && !authMatches.length) continue;
    if (coveMatches.length !== 1 || authMatches.length !== 1) {
      existing.set(desired.username, emptyConflict());
      continue;
    }
    const cove = coveMatches[0]!;
    const auth = authMatches[0]!;
    existing.set(desired.username, {
      coveUserId: cove.id, coveAuthUserId: cove.auth_user_id, coveUsername: cove.username,
      coveEmail: cove.email, coveStatus: cove.status, authUserId: auth.id,
      authEmail: auth.email ?? null, membershipAcademyId: cove.membership_academy_id,
      membershipRole: cove.membership_role, membershipStatus: cove.membership_status,
    });
  }
  return { academyId, managerUserId: managers.rows[0]!.user_id, existing };
}

function emptyConflict(): ExistingBootstrapAccount {
  return { coveUserId: null, coveAuthUserId: null, coveUsername: null, coveEmail: null, coveStatus: null, authUserId: null, authEmail: null, membershipAcademyId: null, membershipRole: null, membershipStatus: null };
}

function temporaryPassword(): string {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

async function insertAccounts(
  client: PoolClient,
  academyId: string,
  managerUserId: string,
  created: Array<{ desired: DesiredBootstrapAccount; authUserId: string; password: string }>,
): Promise<Array<{ userId: string; membershipId: string; desired: DesiredBootstrapAccount; password: string; authUserId: string }>> {
  const records = created.map((account) => ({ ...account, userId: randomUUID(), membershipId: randomUUID() }));
  await client.query("begin");
  try {
    for (const record of records) {
      await client.query(
        `insert into users (id,auth_user_id,email,username,display_name,preferred_locale,platform_role,status,created_at,updated_at)
         values ($1,$2,$3,$4,$5,'ko','USER','ACTIVE',now(),now())`,
        [record.userId, record.authUserId, record.desired.email, record.desired.username, record.desired.displayName],
      );
      await client.query(
        `insert into academy_memberships
           (id,academy_id,user_id,role,status,invited_by_user_id,approved_by_user_id,joined_at,created_at,updated_at)
         values ($1,$2,$3,$4,'ACTIVE',$5,$5,now(),now(),now())`,
        [record.membershipId, academyId, record.userId, record.desired.role, managerUserId],
      );
      await client.query(
        `insert into staff_academy_profiles
           (membership_id,academy_id,bio,specialties,teaching_languages,academy_title,employee_number,created_at,updated_at)
         values ($1,$2,null,'{}'::text[],'{}'::text[],null,null,now(),now())`,
        [record.membershipId, academyId],
      );
      await client.query(
        `insert into audit_logs
           (id,actor_user_id,academy_id,action,target_type,target_id,before,after,reason,created_at)
         values ($1,$2,$3,'academy.membership.bootstrap','AcademyMembership',$4,null,$5::jsonb,'temporary-launch-bootstrap',now())`,
        [randomUUID(), managerUserId, academyId, record.membershipId, JSON.stringify({ role: record.desired.role, status: "ACTIVE", username: record.desired.username })],
      );
    }
    await client.query(`update academies set people_revision = people_revision + $1, updated_at = now() where id = $2`, [records.length, academyId]);
    await client.query("commit");
    return records;
  } catch (caught) {
    await client.query("rollback");
    throw caught;
  }
}

async function compensateAuth(supabase: SupabaseClient, ids: string[]): Promise<void> {
  const failures: string[] = [];
  for (const id of ids) {
    const response = await supabase.auth.admin.deleteUser(id);
    if (response.error) failures.push(id);
  }
  if (failures.length) throw new Error(`Database transaction failed and Auth compensation failed for: ${failures.join(", ")}`);
}

async function writeCredentials(
  directory: string,
  records: Array<{ desired: DesiredBootstrapAccount; password: string; authUserId: string; userId: string; membershipId: string }>,
): Promise<string> {
  const absolute = resolve(directory);
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  await chmod(absolute, 0o700);
  const path = resolve(absolute, `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-credentials.json`);
  await writeFile(path, `${JSON.stringify({ academySlug: ACADEMY_SLUG, createdAt: new Date().toISOString(), temporary: true, accounts: records.map((record) => ({ username: record.desired.username, email: record.desired.email, password: record.password, role: record.desired.role, authUserId: record.authUserId, userId: record.userId, membershipId: record.membershipId })) }, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function main(): Promise<void> {
  requireConfirmation(process.argv.slice(2));
  const environment = environmentSchema.parse(process.env);
  const pool = new Pool({ connectionString: environment.MVP_MIGRATION_TARGET_DATABASE_URL, max: 2, application_name: "dlab-mapo-temporary-staff-bootstrap" });
  const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const createdAuthIds: string[] = [];
  try {
    const state = await inspectState(pool, await listAuthUsers(supabase));
    const decision = decideBootstrap(desiredAccounts, state.existing, state.academyId);
    if (decision.kind === "already-complete") {
      console.log("DLAB Mapo temporary staff bootstrap is already complete; no changes made.");
      return;
    }
    if (decision.kind === "conflict") throw new Error(`Bootstrap conflict: ${decision.reasons.join(" ")}`);

    const created = [];
    for (const desired of desiredAccounts) {
      const password = temporaryPassword();
      const response = await supabase.auth.admin.createUser({
        email: desired.email, password, email_confirm: true,
        user_metadata: { username: desired.username, full_name: desired.displayName, temporary_launch_account: true },
      });
      if (response.error || !response.data.user) {
        await compensateAuth(supabase, createdAuthIds);
        throw new Error(`Could not create Supabase Auth identity for ${desired.username}.`);
      }
      createdAuthIds.push(response.data.user.id);
      created.push({ desired, password, authUserId: response.data.user.id });
    }

    const client = await pool.connect();
    let records;
    try { records = await insertAccounts(client, state.academyId, state.managerUserId, created); }
    catch (caught) { await compensateAuth(supabase, createdAuthIds); throw caught; }
    finally { client.release(); }

    const verified = await inspectState(pool, await listAuthUsers(supabase));
    const verification = decideBootstrap(desiredAccounts, verified.existing, verified.academyId);
    if (verification.kind !== "already-complete") throw new Error("Post-bootstrap verification failed; accounts were created but credentials were not written.");
    const credentialPath = await writeCredentials(environment.DLAB_MAPO_BOOTSTRAP_ARTIFACT_DIR, records);
    console.log(JSON.stringify({ academySlug: ACADEMY_SLUG, created: records.map((record) => ({ username: record.desired.username, role: record.desired.role })), credentialPath }, null, 2));
  } finally { await pool.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((caught) => {
    console.error(caught instanceof Error ? caught.message : "DLAB Mapo staff bootstrap failed.");
    process.exitCode = 1;
  });
}
