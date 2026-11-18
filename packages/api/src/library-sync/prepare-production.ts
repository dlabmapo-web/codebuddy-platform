/** Explicit deployment maintenance; no dotenv loading and no API bootstrap. */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { prepareLibrarySync } from './prepare.js';

const args = process.argv.slice(2);
if (args.some(arg => !['--check', '--enable-all-academies'].includes(arg)) || !process.env.DIRECT_URL)
  throw Error('Supply an explicit DIRECT_URL; supported options: --check --enable-all-academies.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 1 }) });
try {
  const result = await prepareLibrarySync(db, {
    checkOnly: args.includes('--check'),
    enableAllAcademies: args.includes('--enable-all-academies'),
  });
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
