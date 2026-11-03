import { createServer, connect, isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

export function productionRedisAddress(containers) {
    const container = containers?.[0], labels = container?.Config?.Labels;
    const host = container?.NetworkSettings?.Networks?.['cove-production_backend']?.IPAddress;
    if (!Array.isArray(containers) || containers.length !== 1 || container.State?.Running !== true || labels?.['com.docker.compose.project'] !== 'cove-production' || labels?.['com.docker.compose.service'] !== 'redis' || isIP(host ?? '') !== 4 || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))
        throw Error('Owned running Redis on the private production backend network required');
    return { host, port: 6379 };
}
export async function startRedisProxy(resolveAddress, port = 0) {
    const sockets = new Set();
    const server = createServer(client => {
        sockets.add(client);
        client.on('close', () => sockets.delete(client));
        client.on('error', () => client.destroy());
        client.pause();
        void Promise.resolve().then(resolveAddress).then(address => {
            if (client.destroyed) return;
            const upstream = connect(address);
            sockets.add(upstream);
            const stop = () => { client.destroy(); upstream.destroy(); };
            upstream.on('close', () => { sockets.delete(upstream); if (!upstream.readableEnded) client.destroy(); });
            upstream.on('error', stop);
            client.on('close', () => upstream.destroy());
            client.pipe(upstream).pipe(client);
            client.resume();
        }).catch(() => client.destroy());
    });
    server.maxConnections = 32;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { port: server.address().port, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] !== '--production') throw Error('Explicit production mode required');
    const execute = promisify(execFile);
    const proxy = await startRedisProxy(async () => {
        const { stdout } = await execute('/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', 'inspect', 'cove-production-redis-1'], { timeout: 2000, maxBuffer: 65536, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent' } });
        return productionRedisAddress(JSON.parse(stdout));
    }, 16479);
    console.log('Native Redis forwarding bound to 127.0.0.1:16479');
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void proxy.close().then(() => process.exit(0)));
}
