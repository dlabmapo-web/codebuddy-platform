import { validateLauncherLibraries } from './validate-artifacts.mjs';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateDeployment } from './deployment-contract.mjs';
const [configPath, planPath] = process.argv.slice(2);
if (!configPath || !planPath)
    throw Error('Explicit config and deployment intent required');
await validateLauncherLibraries(dirname(JSON.parse(await readFile(configPath, 'utf8')).nsjailPath));
validateDeployment(JSON.parse(await readFile(planPath, 'utf8')), JSON.parse(await readFile(configPath, 'utf8')));
