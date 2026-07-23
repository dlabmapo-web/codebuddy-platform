import { HttpStatus, Injectable } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";

type RateWindow = { count: number; resetsAt: number };

@Injectable()
export class RateLimitService {
  private readonly windows = new Map<string, RateWindow>();

  assert(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || current.resetsAt <= now) {
      this.windows.set(key, { count: 1, resetsAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw new AppException("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
  }
}
