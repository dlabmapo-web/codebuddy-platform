// Runs with the API image's existing ioredis dependency; needs no Nest boot or
// database. Never prints keys, credentials, PINs, hashes, source or output.
import { pathToFileURL } from 'node:url';
const prefix = 'cove:turtle:v1:';
const marker = prefix + 'browser:draining';
const retire = `
if redis.call('HGET',KEYS[2],'engine')~='browser' then return 0 end
local profile=cjson.decode(redis.call('HGET',KEYS[2],'profile') or '{}')
if profile.profile~='cove-browser-turtle-v1' then return -1 end
if redis.call('HGET',KEYS[2],'settled')~='1' and redis.call('EXISTS',KEYS[1])==1 then
 local start=tonumber(redis.call('HGET',KEYS[2],'reservedAt') or '0')
 local lease=tonumber(redis.call('HGET',KEYS[2],'leaseUntil') or '0')
 local deadline=tonumber(redis.call('HGET',KEYS[2],'deadline') or '0')
 local charged=math.max(0,math.min(120,math.ceil((math.min(tonumber(ARGV[2]),lease,deadline)-start)/1000)))
 redis.call('HINCRBY',KEYS[1],'used',-(120-charged))
end
if redis.call('HGET',KEYS[1],'active')==ARGV[1] then redis.call('HSET',KEYS[1],'active','') end
redis.call('DEL',KEYS[2],KEYS[3])
return 1`;
const revokeGrant = `
if redis.call('HGET',KEYS[1],'browserProfile')~='cove-browser-turtle-v1' then return 0 end
local active=redis.call('HGET',KEYS[1],'active') or ''
if active~='' then
 redis.call('HDEL',KEYS[1],'browserProfile','browserRuntimeId','browserOrigin')
 return 1
end
redis.call('DEL',KEYS[1])
return 2`;
export async function drainBrowserAdmissions(redis, { resume = false, maxKeys = 50000, maxMs = 90000 } = {}) {
  if (resume) { await redis.del(marker); return { resumed: true }; }
  await redis.set(marker, '1'); // Persistent kill switch; reservation/renew Lua checks it atomically.
  const began = Date.now(); let scanned = 0, retired = 0, grants = 0, revoked = 0;
  const scan = async (pattern, visit) => {
    let cursor = '0';
    do {
      if (Date.now() - began > maxMs) throw new Error('Browser drain bound exceeded');
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200); cursor = next;
      for (const key of keys) {
        if (++scanned > maxKeys || Date.now() - began > maxMs) throw new Error('Browser drain bound exceeded');
        await visit(key);
      }
    } while (cursor !== '0');
  };
  await scan(prefix + 'run:*', async key => {
    const record = await redis.hgetall(key); if (record.engine !== 'browser') return;
    const match = key.match(/^cove:turtle:v1:run:([a-f0-9]{64}):([a-f0-9-]{36})$/);
    if (!match || !/^[a-f0-9-]{36}$/.test(record.id ?? '')) throw new Error('Unknown browser record');
    const result = Number(await redis.eval(retire, 3, prefix + 'grant:' + match[1], key, prefix + 'session:' + record.id, match[2], Date.now()));
    if (result < 0) throw new Error('Unknown browser profile'); retired += result;
  });
  await scan(prefix + 'grant:*', async key => {
    const profile = await redis.hget(key, 'browserProfile'); if (!profile) return;
    if (profile !== 'cove-browser-turtle-v1') throw new Error('Unknown browser grant profile');
    // Browser records are already drained. Preserve an active native fallback
    // grant, but require a new PIN session for inactive/browser-only grants.
    // An older web/API must not silently reuse their browser-only expectation.
    const result = Number(await redis.eval(revokeGrant, 1, key));
    if (result) grants++; if (result === 2) revoked++;
  });
  return { retired, grants, revoked, scanned };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resume = process.argv.includes('--resume');
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: turtle-browser-drain.mjs [--resume]');
  } else if (args.length > 1 || args.some(arg => arg !== '--resume')) {
    console.error('Usage: turtle-browser-drain.mjs [--resume]'); process.exitCode = 1;
  } else if (!process.env.REDIS_URL || (resume && (process.env.TURTLE_TRIAL_BROWSER_ENABLED !== 'true' || process.env.TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED !== 'true'))) {
    console.error('Browser drain configuration unavailable'); process.exitCode = 1;
  } else {
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true, connectTimeout: 5000, commandTimeout: 5000 });
    redis.on('error', () => {});
    try { await redis.connect(); console.log(JSON.stringify(await drainBrowserAdmissions(redis, { resume }))); }
    catch { console.error('Browser drain failed; keep the current API and browser admission disabled.'); process.exitCode = 1; }
    finally { redis.disconnect(); }
  }
}
