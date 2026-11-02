import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loopbackApplication } from './loopback-application.mjs';
const require = createRequire(new URL('../../packages/api/package.json', import.meta.url));
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');

test('real Nest proxy binds only loopback and reports actual listen completion', async () => {
    class FixtureModule {}
    Module({})(FixtureModule);
    const app = await NestFactory.create(FixtureModule, { logger: false, abortOnError: false });
    let listening = false;
    const fixture = loopbackApplication(app, () => { listening = true; });
    try {
        const server = await fixture.listen(0);
        assert.equal(server.address().address, '127.0.0.1');
        assert.equal(listening, true);
        assert.equal(fixture.getHttpServer(), server);
        assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/missing`)).status, 404);
    } finally { await app.close(); }
});
