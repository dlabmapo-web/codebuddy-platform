import type { SupabaseClient, User } from "@supabase/supabase-js";
import { usernameSchema } from "@cove/shared";

import type { DevelopmentUser } from "./data/users.js";

type SupabaseAdmin = SupabaseClient["auth"]["admin"];

export type CoveUserIdentity = {
  id: string;
  authUserId: string | null;
  email: string | null;
  username: string | null;
};

const authUsersPerPage = 1_000;

export function assertDevelopmentSeedAllowed(nodeEnvironment: string): void {
  if (nodeEnvironment === "production") {
    throw new Error("Development seed is disabled when NODE_ENV=production.");
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateSeedUsers(users: readonly DevelopmentUser[]): void {
  const emails = new Set<string>();
  const usernames = new Set<string>();
  const ids = new Set<string>();
  const membershipIds = new Set<string>();

  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (emails.has(email)) throw new Error(`Duplicate seed email: ${email}`);
    if (ids.has(user.id)) throw new Error(`Duplicate seed user ID: ${user.id}`);
    // The same rule the signup form applies, so a seed name that could never
    // be typed into the real form fails here rather than at the unique index.
    if (!usernameSchema.safeParse(user.username).success) {
      throw new Error(`Invalid seed username: ${user.username}`);
    }
    if (usernames.has(user.username)) {
      throw new Error(`Duplicate seed username: ${user.username}`);
    }
    usernames.add(user.username);
    if (user.academyRole === null && user.membershipId !== null) {
      throw new Error(`Seed user ${email} has a membership ID without an academy role.`);
    }
    if (user.academyRole !== null && user.membershipId === null) {
      throw new Error(`Seed user ${email} has an academy role without a membership ID.`);
    }
    if (user.membershipId !== null) {
      if (membershipIds.has(user.membershipId)) {
        throw new Error(`Duplicate seed membership ID: ${user.membershipId}`);
      }
      membershipIds.add(user.membershipId);
    }
    emails.add(email);
    ids.add(user.id);
  }
}

export function assertNoCoveUserConflicts(
  existingUsers: readonly CoveUserIdentity[],
  seedUsers: readonly DevelopmentUser[],
  authUserIds: ReadonlyMap<string, string> = new Map(),
): void {
  const seedByEmail = new Map(
    seedUsers.map((user) => [normalizeEmail(user.email), user]),
  );
  const seedById = new Map(seedUsers.map((user) => [user.id, user]));
  const seedByUsername = new Map(
    seedUsers.map((user) => [user.username, user]),
  );
  const seedByAuthId = new Map(
    seedUsers.flatMap((user) => {
      const authUserId = authUserIds.get(user.id);
      return authUserId ? [[authUserId, user] as const] : [];
    }),
  );

  for (const existing of existingUsers) {
    const email = existing.email ? normalizeEmail(existing.email) : null;
    const emailOwner = email ? seedByEmail.get(email) : undefined;
    if (emailOwner && emailOwner.id !== existing.id) {
      throw new Error(`Cove email conflict for ${email}.`);
    }

    // Caught here rather than at the unique index, so the failure names the
    // account somebody already took instead of surfacing a raw P2002.
    const usernameOwner = existing.username
      ? seedByUsername.get(existing.username)
      : undefined;
    if (usernameOwner && usernameOwner.id !== existing.id) {
      throw new Error(`Cove username conflict for ${existing.username}.`);
    }

    const idOwner = seedById.get(existing.id);
    if (idOwner && email && normalizeEmail(idOwner.email) !== email) {
      throw new Error(`Cove seed ID conflict for ${idOwner.email}.`);
    }

    const authOwner = existing.authUserId
      ? seedByAuthId.get(existing.authUserId)
      : undefined;
    if (authOwner && authOwner.id !== existing.id) {
      throw new Error(`Cove Auth identity conflict for ${authOwner.email}.`);
    }
  }
}

export async function synchronizeSupabaseUsers(
  admin: SupabaseAdmin,
  seedUsers: readonly DevelopmentUser[],
  password: string,
): Promise<Map<string, string>> {
  const existingUsers = await listAllSupabaseUsers(admin);
  const usersByEmail = new Map<string, User>();

  for (const user of existingUsers) {
    if (!user.email) continue;
    const email = normalizeEmail(user.email);
    if (usersByEmail.has(email)) {
      throw new Error(`Multiple Supabase Auth users found for ${email}.`);
    }
    usersByEmail.set(email, user);
  }

  const authUserIds = new Map<string, string>();
  for (const seedUser of seedUsers) {
    const email = normalizeEmail(seedUser.email);
    const attributes = {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: seedUser.displayName,
        // Kept in step with the Cove row so a seeded identity that ever goes
        // through `bootstrap` claims the same name the seed wrote.
        username: seedUser.username,
        cove_development_seed: true,
      },
    };
    const existing = usersByEmail.get(email);
    const response = existing
      ? await admin.updateUserById(existing.id, attributes)
      : await admin.createUser(attributes);

    if (response.error || !response.data.user) {
      const operation = existing ? "update" : "create";
      throw new Error(`Unable to ${operation} Supabase Auth user ${email}.`);
    }

    authUserIds.set(seedUser.id, response.data.user.id);
  }

  return authUserIds;
}

async function listAllSupabaseUsers(admin: SupabaseAdmin): Promise<User[]> {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const response = await admin.listUsers({ page, perPage: authUsersPerPage });
    if (response.error) {
      throw new Error("Unable to list Supabase Auth users.");
    }
    users.push(...response.data.users);
    if (response.data.users.length < authUsersPerPage) break;
    page += 1;
  }

  return users;
}
