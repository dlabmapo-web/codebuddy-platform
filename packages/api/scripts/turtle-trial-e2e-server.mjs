import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Redis } from 'ioredis';
import { TurtleTrialModule } from '../src/turtle-trial/trial.module.ts';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture cannot run in production');
const redisUrl = process.env.TURTLE_TRIAL_TEST_REDIS_URL;
if (!redisUrl || !['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname) || new URL(redisUrl).port !== '6397' || !['', '/'].includes(new URL(redisUrl).pathname))
  throw new Error('Dedicated local trial Redis on port 6397 is required');
const pepper = 'local-trial-pin-pepper-never-production';
const config = {
  TURTLE_TRIAL_ENABLED: true, REDIS_URL: redisUrl,
  TURTLE_TRIAL_LEGACY_PIN_ENABLED: true,
  TURTLE_TRIAL_PIN_PEPPER: pepper, TURTLE_TRIAL_PIN_VERSION: 'e2e-v1',
  TURTLE_TRIAL_PIN_DIGEST: createHmac('sha256', pepper).update('012345').digest('hex'),
  BFF_SHARED_SECRET: 'local-trial-bff-secret-never-production',
  TURTLE_TRIAL_SERVICE_URL: 'http://127.0.0.1:4017',
  TURTLE_TRIAL_SERVICE_SECRET: 'local-trial-runtime-secret-never-production',
  TURTLE_TRIAL_PUBLIC_WS_URL: 'ws://127.0.0.1:4017',
};
const redis = new Redis(redisUrl);
await redis.set('cove:turtle:v1:version', 'e2e-v1'); redis.disconnect();
class LocalTrialApp {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => config] }), TurtleTrialModule] })(LocalTrialApp);
const app = await NestFactory.create(LocalTrialApp, { logger: ['error'] });
app.setGlobalPrefix('api');
app.use('/api/turtle-trial', (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
app.getHttpAdapter().get('/api/health', (_req, res) => res.json({ ready: true }));
await app.listen(4037, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void app.close().then(() => process.exit(0)));
