import type {
  ExecutionEngine,
  ExecutionRequest,
  ExecutionResult,
} from "./execution-engine.js";

/**
 * The sandbox accepts at most 300 s per case; the largest authored case limit,
 * 60 s, still fits at this scale.
 */
export const MAX_JUDGE_TIME_SCALE = 5;

/**
 * Runs an engine in native-Python time.
 *
 * Time limits are authored for native CPython — the speed Elice grades at,
 * where most problems and their limits come from. Pyodide runs the same
 * program about 2.5× slower, so a solution Elice accepts would time out here.
 * The inner engine is given the authored limit × scale and its runtimes are
 * reported ÷ scale, so verdicts, budgets, penalty thresholds and displayed
 * times all stay in authored units. An engine that runs native CPython needs
 * no wrapper.
 */
export class TimeScaledEngine implements ExecutionEngine {
  constructor(
    private readonly inner: ExecutionEngine,
    readonly timeScale: number,
  ) {
    if (!Number.isFinite(timeScale) || timeScale < 1 || timeScale > MAX_JUDGE_TIME_SCALE) {
      throw new RangeError(`time scale must be between 1 and ${MAX_JUDGE_TIME_SCALE}`);
    }
  }

  get version(): string {
    return this.inner.version;
  }

  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const result = await this.inner.run({
      ...request,
      timeLimitMs: Math.ceil(request.timeLimitMs * this.timeScale),
    });
    return { ...result, runtimeMs: Math.round(result.runtimeMs / this.timeScale) };
  }

  get compile() {
    return this.inner.compile?.bind(this.inner);
  }

  get release() {
    return this.inner.release?.bind(this.inner);
  }

  dispose(): Promise<void> {
    return this.inner.dispose();
  }
}

/** An engine's scale; 1 for one that runs at native speed. */
export function timeScaleOf(engine: ExecutionEngine): number {
  return engine.timeScale ?? 1;
}

