import { readFile, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [artifact, environmentPath] = process.argv.slice(2);
const st = await lstat(environmentPath);
if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) || st.uid !== process.getuid())
    throw Error('Owned private explicit worker environment JSON required');
const environment = JSON.parse(await readFile(environmentPath, 'utf8'));
if (environment.JUDGE_RUNTIME_FAMILY !== 'native')
    throw Error('Explicit native queue family required');
// Never inherit API, Supabase or production dotenv configuration.
const { bootstrapNativeWorker } = await import(pathToFileURL(artifact + '/worker/dist/src/judge/native-worker.js'));
await bootstrapNativeWorker(environment);
