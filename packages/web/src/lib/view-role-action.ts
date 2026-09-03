'use server';

import { cookies } from 'next/headers';
import { academyRoleSchema } from '@cove/shared';
import { z } from 'zod';

import { encodeViewRole, viewRoleCookieName } from '@/lib/academy-view-role';

const inputSchema = z.object({
  academyId: z.uuid(),
  role: academyRoleSchema,
});

/**
 * Remembers which of their roles a member is working as.
 *
 * Lives in `lib` rather than beside a route because the control that calls it
 * is the shared header avatar menu, on every studio page.
 *
 * Deliberately writes whatever well-formed role it is given, without checking
 * that the caller holds it. That is not an oversight: the cookie grants
 * nothing, every API call authorizes against the roles in the database, and
 * the shell re-validates the value against the member's actual set on every
 * render — an unheld role falls back to their primary one. Verifying here
 * would add a round trip to a preference and protect nothing.
 */
export async function setViewRoleAction(
  academyId: string,
  role: string,
): Promise<void> {
  const input = inputSchema.safeParse({ academyId, role });
  if (!input.success) return;

  (await cookies()).set(
    viewRoleCookieName,
    encodeViewRole(input.data.academyId, input.data.role),
    {
      // Not `httpOnly`: it carries no authority, and a client component
      // reading it back saves a render.
      httpOnly: false,
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  );
}
