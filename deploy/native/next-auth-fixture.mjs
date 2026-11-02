// Synthetic provider ONLY for isolated qualification boot; production imports none of this.
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
export function nextAuthFixture(nextOrigin) {
    const secret = randomBytes(32), sessions = new Map();
    const signed = claims => { const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), p = Buffer.from(JSON.stringify(claims)).toString('base64url'); return h + '.' + p + '.' + createHmac('sha256', secret).update(h + '.' + p).digest('base64url'); };
    const session = (student, origin) => { const now = Math.floor(Date.now() / 1000), user = { id: student.authId, aud: 'authenticated', role: 'authenticated', email: 'f' + student.id + '@fixture.invalid', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() }; const claims = { sub: user.id, session_id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: user.email, email_verified: true, app_metadata: user.app_metadata, user_metadata: {}, iat: now, exp: now + 3600, iss: origin + '/auth/v1' }; const access_token = signed(claims); const value = { access_token, refresh_token: randomUUID(), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user }; sessions.set(access_token, value); return value; };
    return {
        storageState(student, origin) { const value = session(student, origin); return { cookies: [{ name: 'i18next', value: 'en', domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: value.expires_at }, { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(value)).toString('base64url'), domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: value.expires_at }], origins: [] }; },
        async handle(request, response, url) { if (!url.pathname.startsWith('/auth/v1/'))
            return false; response.setHeader('Access-Control-Allow-Origin', nextOrigin); response.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version'); response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); if (request.method === 'OPTIONS') {
            response.writeHead(204).end();
            return true;
        } const token = request.headers.authorization?.replace(/^Bearer /, ''), saved = sessions.get(token); if (url.pathname === '/auth/v1/user' && saved) {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(saved.user));
            return true;
        } if (url.pathname === '/auth/v1/token') {
            let body = '';
            for await (const b of request) {
                body += b;
                if (body.length > 4096)
                    throw Error('Bounded fixture refresh');
            }
            const input = JSON.parse(body);
            const value = [...sessions.values()].find(s => s.refresh_token === input.refresh_token);
            if (value) {
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
                return true;
            }
        } response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"msg":"Invalid synthetic token"}'); return true; },
    };
}
