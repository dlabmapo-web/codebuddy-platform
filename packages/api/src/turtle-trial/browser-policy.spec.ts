import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TrialBrowserPolicy } from './browser-policy.js';
import { turtleBrowserProfileId } from '@cove/shared';

describe('server-controlled browser pilot selection', () => {
  it('keeps existing/legacy grants on the server and selects only pilot academies in production', () => {
    const config = new ConfigService({ NODE_ENV: 'production', TURTLE_TRIAL_BROWSER_ENABLED: true, TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: true,
      TURTLE_TRIAL_BROWSER_RUNTIME_ID: 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa', TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: 'https://runtime.example', TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS: ['pilot'] });
    const policy = new TrialBrowserPolicy(config);
    expect(policy.issue()).toBeUndefined(); expect(policy.issue('other')).toBeUndefined(); expect(policy.issue('pilot')).toMatchObject({ browserProfile: turtleBrowserProfileId });
    expect(policy.profile({ hash: 'legacy', version: 'v1', expiresAt: Date.now() + 10000, active: '' })).toBeUndefined();
    config.set('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED', false); expect(policy.issue('pilot')).toBeUndefined();
  });
});
