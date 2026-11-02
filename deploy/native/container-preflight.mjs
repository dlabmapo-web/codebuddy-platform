import { readFile } from 'node:fs/promises';
import { NsJailBackend } from '/opt/cove/worker/node_modules/@cove/grading-runtime/dist/index.js';
const path = process.argv[2];
if (!path)
    throw Error('Explicit immutable config path required; this image does not discover production configuration');
try {
    const config = JSON.parse(await readFile(path, 'utf8'));
    await new NsJailBackend(config).prepare();
    console.log(JSON.stringify({ gate: 'actual-native-image', status: 'PASS', descriptor: config.manifest.descriptor }));
}
catch (error) {
    console.error(JSON.stringify({ gate: 'actual-native-image', status: 'UNSUPPORTED_OR_FAILED', error: String(error) }));
    process.exitCode = 78;
}
