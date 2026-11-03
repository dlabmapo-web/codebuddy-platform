import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { productionRedisAddress, startRedisProxy } from './redis-proxy.mjs';

test('Redis proxy preserves bytes and resolves a replacement upstream on reconnect', async () => {
    const make = async prefix => {
        const server = createServer(socket => { socket.on('error', () => {}); socket.on('data', data => socket.end(Buffer.concat([Buffer.from(prefix), data]))); });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        return server;
    };
    const first = await make('one:'), second = await make('two:');
    let target = first;
    const proxy = await startRedisProxy(async () => ({ host: '127.0.0.1', port: target.address().port }));
    const exchange = (body = 'PING\r\n') => new Promise((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port: proxy.port });
        const chunks = [];
        socket.setTimeout(2000, () => socket.destroy(Error('Test transport deadline')));
        socket.on('error', reject); socket.on('data', bytes => chunks.push(bytes));
        socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
        socket.on('connect', () => socket.write(body));
    });
    try {
        assert.equal(await exchange(), 'one:PING\r\n');
        target = second;
        assert.equal(await exchange(), 'two:PING\r\n');
    } finally { await proxy.close(); await Promise.all([first, second].map(server => new Promise(resolve => server.close(resolve)))); }
});
test('Redis proxy refuses public, stopped and foreign Docker targets', () => {
    const row = { State: { Running: true }, Config: { Labels: { 'com.docker.compose.project': 'cove-production', 'com.docker.compose.service': 'redis' } }, NetworkSettings: { Networks: { 'cove-production_backend': { IPAddress: '172.18.0.2' } } } };
    assert.deepEqual(productionRedisAddress([row]), { host: '172.18.0.2', port: 6379 });
    for (const altered of [{ ...row, State: { Running: false } }, { ...row, Config: { Labels: {} } }, { ...row, NetworkSettings: { Networks: { 'cove-production_backend': { IPAddress: '8.8.8.8' } } } }])
        assert.throws(() => productionRedisAddress([altered]), /private production/);
});
