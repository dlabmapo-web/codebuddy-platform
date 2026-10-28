import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { turtleBrowserProfileId, turtleHelperVersion, type TurtleBrowserProfile } from '@cove/shared';
import type { TrialGrant } from './trial-store.js';

@Injectable()
export class TrialBrowserPolicy {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  available() { return this.config.get('TURTLE_TRIAL_BROWSER_ENABLED') === true && this.config.get('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED') === true; }
  issue(academyId?: string) {
    if (!this.available()) return undefined;
    const pilot = this.config.get<string[]>('TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS') ?? [];
    if (academyId ? !pilot.includes(academyId) : this.config.get('NODE_ENV') === 'production') return undefined;
    return { browserProfile: turtleBrowserProfileId, browserRuntimeId: this.config.get<string>('TURTLE_TRIAL_BROWSER_RUNTIME_ID')!, browserOrigin: this.config.get<string>('TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN')! };
  }
  profile(g: TrialGrant): TurtleBrowserProfile | undefined {
    const ids = [this.config.get<string>('TURTLE_TRIAL_BROWSER_RUNTIME_ID'), ...(this.config.get<string[]>('TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS') ?? [])];
    if (!this.available() || g.browserProfile !== turtleBrowserProfileId || !g.browserRuntimeId || !ids.includes(g.browserRuntimeId) || g.browserOrigin !== this.config.get('TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN')) return undefined;
    return { engine: 'browser', profile: turtleBrowserProfileId, protocol: 1, origin: g.browserOrigin!, runtimeId: g.browserRuntimeId, helperVersion: turtleHelperVersion };
  }
  require(g: TrialGrant) {
    const profile = this.profile(g);
    if (!profile) throw new ServiceUnavailableException('BROWSER_RUNTIME_UNAVAILABLE');
    return profile;
  }
}
