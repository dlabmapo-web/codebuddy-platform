import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AppContract } from '@cove/shared';
import type { ContractRouterClient } from '@orpc/contract';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Run from packages/api with dotenv loaded. Generates sessions only for the fixed
// development fixture; no emails are sent and no application auth code is changed.
const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('Monitoring auth preparation is restricted to local development');
}
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const directory = resolve(process.env.E2E_AUTH_STATE_DIR ?? '../../e2e/.auth');
await mkdir(directory, { recursive: true, mode: 0o700 });
const studentCount = Number(process.env.E2E_MONITORING_STUDENTS ?? 5);
if (![5, 10, 15].includes(studentCount)) throw new Error('Use 5, 10 or 15 monitoring students');
for (const name of ['manager', 'teacher', ...Array.from({ length: studentCount }, (_, i) => `student${i + 2}`)]) {
  const email = `${name}@cove.test`;
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw new Error(`Could not prepare ${name}: ${link.error.code}`);
  const cookies = new Map<string, { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }>();
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...cookies.values()],
    setAll: (values) => { for (const { name: cookieName, value, options } of values) cookies.set(cookieName, {
      name: cookieName, value, domain: base.hostname, path: options.path ?? '/',
      expires: Math.floor(Date.now() / 1000) + (options.maxAge ?? 3600),
      httpOnly: options.httpOnly ?? false, secure: false, sameSite: 'Lax',
    }); },
  } });
  const result = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
  if (result.error) throw new Error(`Could not establish ${name}: ${result.error.code}`);
  const rpc: ContractRouterClient<AppContract> = createORPCClient(new RPCLink({
    url: 'http://localhost:4000/api/rpc',
    headers: { Authorization: `Bearer ${result.data.session!.access_token}`, 'X-Cove-Bff-Secret': process.env.BFF_SHARED_SECRET! },
  }));
  await rpc.studentSession.begin({});
  await writeFile(resolve(directory, `${email}.json`), JSON.stringify({ cookies: [...cookies.values()], origins: [] }), { mode: 0o600 });
  console.log(`Prepared local monitoring session: ${name}`);
}
