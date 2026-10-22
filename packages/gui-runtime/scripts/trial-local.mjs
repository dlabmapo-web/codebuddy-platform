// Local integration fixture only: never used by the production image command.
if (process.env.NODE_ENV === 'production') throw new Error('Local fixture cannot run in production');
Object.assign(process.env, {
  GUI_SERVICE_SECRET: 'local-trial-runtime-secret-never-production',
  GUI_RUNTIME_IMAGE: 'cove-turtle-trial:dev', GUI_TRIAL_ONLY: 'true',
  GUI_ALLOWED_ORIGINS: 'http://127.0.0.1:3067', GUI_PORT: '4017',
  GUI_SESSION_CAPACITY: '2', GUI_BIND_ADDRESS: '127.0.0.1',
});
await import('../src/server.mjs');
