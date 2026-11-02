import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function validateLauncherLibraries(artifact) {
    const packages = JSON.parse(await readFile(artifact + '/rootfs/opt/cove/packages.json', 'utf8'));
    const expected = packages.launcherLibraries;
    if (!expected || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify((await readdir(artifact + '/launcher-lib')).sort()))
        throw Error('Launcher dependency set differs from measured rootfs manifest');
    for (const [name, digest] of Object.entries(expected))
        if (name.includes('/') || 'sha256:' + createHash('sha256').update(await readFile(artifact + '/launcher-lib/' + name)).digest('hex') !== digest)
            throw Error('Launcher library differs: ' + name);
}
