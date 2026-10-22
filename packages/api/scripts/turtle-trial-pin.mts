import { randomBytes, randomInt, createHmac } from 'node:crypto';
import { Redis } from 'ioredis';

// Deliberate operator output. Never run this in CI or collect its stdout in logs.
if (process.argv[2] === '--activate-version') {
  const version = process.argv[3];
  if (!version || !/^[a-zA-Z0-9_-]{1,64}$/.test(version) || !process.env.REDIS_URL) throw new Error('Set REDIS_URL and provide the deployed PIN version.');
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  try { await redis.set('cove:turtle:v1:version', version); process.stdout.write('Trial PIN version activated. Old grants can no longer renew.\n'); }
  finally { redis.disconnect(); }
} else {
  const pin = randomInt(1000000).toString().padStart(6, '0');
  const pepper = randomBytes(32).toString('base64url');
  const digest = createHmac('sha256', pepper).update(pin).digest('hex');
  const version = 'trial-' + Date.now();
  process.stdout.write(`Teacher code (share privately): ${pin}\n\nAPI secret configuration:\nTURTLE_TRIAL_PIN_PEPPER=${pepper}\nTURTLE_TRIAL_PIN_DIGEST=${digest}\nTURTLE_TRIAL_PIN_VERSION=${version}\n\nDeploy these settings, then activate this version with --activate-version.\n`);
}
