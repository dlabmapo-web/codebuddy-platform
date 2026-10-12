import { Worker } from "node:worker_threads";
import type { ShortAnswerDefinition } from "@cove/shared";
const source = `const {parentPort, workerData} = require('node:worker_threads');
try { const expression = new RegExp(workerData.pattern); parentPort.postMessage({correct: expression.test(workerData.answer)}); }
catch { parentPort.postMessage({invalid: true}); }`;
export class MatchError extends Error {}
/** Bounds compilation and matching outside the API event loop, including previews. */
export class ShortAnswerEvaluator {
  private active = 0;
  private waiting: Array<() => void> = [];
  async evaluate(
    definition: ShortAnswerDefinition,
    answer: string,
  ): Promise<boolean> {
    if (answer.length > 10000 || definition.pattern.length > 2000)
      throw new MatchError("Input exceeds matching limits");
    if (definition.gradingMode === "EXACT")
      return answer === definition.expectedAnswer;
    if (definition.gradingMode !== "REGEX")
      throw new MatchError("Manual questions have no matching rule");
    if (this.active >= 4) {
      if (this.waiting.length >= 16)
        throw new MatchError("Matching is busy; retry");
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const worker = new Worker(source, {
          eval: true,
          workerData: { pattern: definition.pattern, answer },
          resourceLimits: { maxOldGenerationSizeMb: 32 },
        });
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error, correct?: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          void worker.terminate();
          if (error) reject(error);
          else resolve(Boolean(correct));
        };
        // Deadline starts when the worker is online; includes compilation and test.
        worker.once("online", () => {
          timer = setTimeout(
            () =>
              finish(
                new MatchError("Matching timed out; simplify the pattern"),
              ),
            100,
          );
        });
        const startup = setTimeout(
          () => finish(new MatchError("Matcher unavailable; retry")),
          5000,
        );
        worker.once("message", (result) => {
          clearTimeout(startup);
          finish(
            result.invalid
              ? new MatchError("Invalid regular expression")
              : undefined,
            result.correct,
          );
        });
        worker.once("error", () => {
          clearTimeout(startup);
          finish(new MatchError("Matcher unavailable; retry"));
        });
        worker.once("exit", () => {
          clearTimeout(startup);
          if (!settled) finish(new MatchError("Matcher unavailable; retry"));
        });
      });
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
