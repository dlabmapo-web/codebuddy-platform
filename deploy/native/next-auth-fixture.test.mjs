import { createRequire } from 'node:module';
const require = createRequire(new URL('../../packages/web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { nextAuthFixture } from './next-auth-fixture.mjs';
test('synthetic sessions bind exact seeded auth identity and refuse forged credentials', async () => {
    const provider = nextAuthFixture('http://127.0.0.1:3409');
    const server = createServer((req, res) => void provider.handle(req, res, new URL(req.url, 'http://127.0.0.1')).then(handled => { if (!handled)
        res.writeHead(404).end(); }));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const origin = 'http://127.0.0.1:' + server.address().port, state = provider.storageState({ id: 'student-fixture', authId: '11111111-1111-4111-8111-111111111111' }, origin), cookie = state.cookies.find(c => c.name === 'sb-127-auth-token');
        assert.equal(cookie.name, 'sb-127-auth-token');
        const ssr = createServerClient(origin, 'fixture-public-key', { cookies: { getAll: () => state.cookies, setAll: () => { } } });
        const checked = await ssr.auth.getClaims();
        assert.equal(checked.error, null);
        assert.equal(checked.data.claims.sub, '11111111-1111-4111-8111-111111111111');
        const session = JSON.parse(Buffer.from(cookie.value.slice(7), 'base64url'));
        const valid = await fetch(origin + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + session.access_token } });
        assert.equal(valid.status, 200);
        assert.equal((await valid.json()).id, '11111111-1111-4111-8111-111111111111');
        assert.equal((await fetch(origin + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + session.access_token + 'forged' } })).status, 401);
        assert.equal((await fetch(origin + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) })).status, 200);
    }
    finally {
        server.closeAllConnections();
        await new Promise(r => server.close(r));
    }
});
