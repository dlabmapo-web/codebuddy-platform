// Local integration fixture only: never used by the production image command.
if (process.env.NODE_ENV === 'production') throw new Error('Local fixture cannot run in production');
const warm = process.env.TURTLE_LOCAL_WARM === '1';
Object.assign(process.env, {
  NODE_ENV: 'test', GUI_INSTANCE_ID: 'fixture-trial',
  GUI_SERVICE_SECRET: 'local-trial-runtime-secret-never-production',
  GUI_RUNTIME_IMAGE: 'cove-turtle-trial:dev', GUI_TRIAL_ONLY: 'true',
  GUI_ALLOWED_ORIGINS: 'http://127.0.0.1:3067,http://localhost:3000,http://127.0.0.1:3000', GUI_PORT: '4017',
  GUI_SESSION_CAPACITY: warm ? '1' : '2', GUI_BIND_ADDRESS: '127.0.0.1',
  GUI_WARM_STANDBY: warm ? '1' : '0', GUI_WARM_LOCAL_FIXTURE: warm ? '1' : '0',
  GUI_METRICS_SECRET: 'local-trial-metrics-secret-never-production',
});
await import('../src/server.mjs');
