import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Prepare the idempotent identities and curriculum before any browser exists. */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return;

  await execFileAsync(
    'pnpm',
    ['--filter', '@cove/api', 'db:seed'],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
  );
  await execFileAsync(
    'pnpm',
    ['--filter', '@cove/api', 'db:seed:e2e'],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
  );
}
