import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { TurtleBrowserStart } from '@cove/shared';
import { TrialService } from './trial.service.js';
import { TrialStore } from './trial-store.js';
import { TrialBrowserRuns } from './browser-runs.js';

@Injectable()
export class TrialBrowserService {
  constructor(@Inject(TrialService) private readonly trial: TrialService, @Inject(TrialStore) private readonly store: TrialStore,
    @Inject(TrialBrowserRuns) private readonly runs: TrialBrowserRuns) {}
  async start(token: string, input: TurtleBrowserStart) {
    const g = await this.trial.grant(token); const unlock = await this.store.lock(g);
    try {
      // Lua rechecks actual grant/active state atomically. Revalidate authority
      // after reservation before replying, without a third academy DB read.
      const run = await this.runs.start(g, input);
      try { await this.trial.grant(token); } catch (error) { await this.runs.end(g, input.requestKey, true); throw error; }
      return run;
    } finally { await unlock().catch(() => {}); }
  }
  async request(token: string, id: string, action: 'renew' | 'stop') {
    const g = await this.trial.grant(token);
    await this.store.limit([['browser-session:' + g.hash, 180, 60000]]);
    const key = await this.runs.owned(g, id);
    if (action === 'stop') { await this.runs.end(g, key); return {}; }
    const run = await this.runs.renew(g, id);
    try { await this.trial.grant(token); } catch (error) { await this.runs.end(g, key, true); throw error; }
    return run;
  }
  async recover(token: string, key: string) {
    const g = await this.trial.grant(token);
    await this.store.limit([['browser-session:' + g.hash, 180, 60000]]);
    const run = await this.runs.recover(g, key);
    if (!run) throw new HttpException('RUN_NOT_FOUND', 404);
    return run;
  }
}
