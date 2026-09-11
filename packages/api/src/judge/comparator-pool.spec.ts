import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ComparatorPool,
  type ComparatorWorker,
  type ComparisonResult,
} from "./comparator-pool.js";

/**
 * A stand-in interpreter, so the pool's lifecycle can be driven exactly: when
 * a thread becomes ready, dies, answers, or finishes stopping.
 */
class FakeWorker implements ComparatorWorker {
  static created: FakeWorker[] = [];
  isDead = false;
  disposed = false;
  stopped = false;
  private settleCompare: ((result: ComparisonResult) => void) | null = null;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private readonly ready = new Promise<void>((resolve, reject) => {
    this.readyResolve = resolve;
    this.readyReject = reject;
  });

  constructor(
    private readonly behaviour: {
      warm?: "ok" | "fail" | "manual";
      answer?: ComparisonResult | "hang" | "die";
      stopMs?: number;
      version?: string | null;
    } = {},
  ) {
    FakeWorker.created.push(this);
    this.ready.catch(() => undefined);
    const warm = behaviour.warm ?? "ok";
    if (warm === "ok") this.readyResolve();
    if (warm === "fail") this.readyReject(new Error("could not start"));
  }

  get version(): string | null {
    return this.behaviour.version === undefined ? "0.27.5" : this.behaviour.version;
  }

  becomeReady(): void {
    this.readyResolve();
  }

  warmUp(): Promise<void> {
    return this.ready;
  }

  compare(): Promise<ComparisonResult> {
    const answer = this.behaviour.answer ?? { kind: "match" };
    if (answer === "die") {
      this.isDead = true;
      return Promise.resolve({ kind: "timeout" });
    }
    if (answer === "hang") {
      return new Promise((resolve) => {
        this.settleCompare = resolve;
      });
    }
    return Promise.resolve(answer);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.isDead = true;
    this.readyReject(new Error("disposed"));
    this.settleCompare?.({ kind: "error", detail: "comparator disposed" });
    await new Promise((resolve) => setTimeout(resolve, this.behaviour.stopMs ?? 0));
    this.stopped = true;
  }
}

const settlesWithin = <T>(promise: Promise<T>, ms: number): Promise<T | "pending"> =>
  Promise.race([
    promise,
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
  ]);

/**
 * The differential matrix from §13 of the research spec.
 *
 * Expected values are derived from the Elice comparator observed in that
 * document, not from what a JavaScript implementation would produce — several
 * rows differ precisely there, and those are the interesting ones.
 */
describe("ComparatorPool", () => {
  const pool = new ComparatorPool(1);

  beforeAll(async () => {
    await pool.warmUp();
  }, 120_000);

  afterAll(async () => {
    await pool.dispose();
  });

  const compare = async (
    comparator: Parameters<typeof pool.compare>[0]["comparator"],
    actual: string,
    expected: string,
  ): Promise<string> =>
    (await pool.compare({ comparator, actual, expected })).kind;

  describe("STDOUT — same output", () => {
    const FORM_FEED = String.fromCharCode(12);
    const cases: Array<[string, string, string, string]> = [
      ["exact", "Hello", "Hello", "match"],
      ["trailing newline", "Hello\n", "Hello", "match"],
      ["per-line trailing spaces", "A  \nB\n", "A\nB", "match"],
      ["CRLF", "A\r\nB", "A\nB", "match"],
      ["lone CR", "A\rB", "A\nB", "match"],
      ["interior double space", "A  B", "A B", "no-match"],
      ["case differs", "hello", "Hello", "no-match"],
      ["leading whitespace", " Hello", "Hello", "no-match"],
      ["blank interior line", "A\n\nB", "A\nB", "no-match"],
      ["whitespace-only vs empty", "   \n  ", "", "match"],
      // Python's splitlines breaks on form feed; a JavaScript port that splits
      // on \n alone disagrees here, which is why the comparator is Python.
      ["form feed is a line break to Python", `A${FORM_FEED}B`, "A\nB", "match"],
    ];
    for (const [name, actual, expected, want] of cases) {
      it(`${name} → ${want}`, async () => {
        expect(await compare("STDOUT", actual, expected)).toBe(want);
      });
    }
  });

  describe("STDOUT_MATCH — contains", () => {
    it("matches a substring anywhere", async () => {
      expect(await compare("STDOUT_MATCH", "Welcome! Hello Alice", "Hello")).toBe("match");
    });

    it("matches a numeric substring, which is why it suits no strict answer", async () => {
      expect(await compare("STDOUT_MATCH", "500", "5")).toBe("match");
    });

    it("does not normalize, so an embedded newline is literal", async () => {
      expect(await compare("STDOUT_MATCH", "Hello", "Hello\n")).toBe("no-match");
    });

    it("finds empty text in anything", async () => {
      expect(await compare("STDOUT_MATCH", "anything", "")).toBe("match");
    });
  });

  describe("STDOUT_NOMATCH — does not contain", () => {
    it("is the negation", async () => {
      expect(await compare("STDOUT_NOMATCH", "Hello there", "Hello")).toBe("no-match");
      expect(await compare("STDOUT_NOMATCH", "Goodbye", "Hello")).toBe("match");
    });

    it("always fails on empty text, since everything contains it", async () => {
      // Worth pinning: an author who leaves this blank has written a case no
      // submission can ever pass.
      expect(await compare("STDOUT_NOMATCH", "anything", "")).toBe("no-match");
    });
  });

  describe("STDOUT_REGEX — search, not full match", () => {
    it("searches rather than anchoring", async () => {
      expect(await compare("STDOUT_REGEX", "ID: 123", "[0-9]+")).toBe("match");
    });

    it("honours explicit anchors", async () => {
      expect(await compare("STDOUT_REGEX", "STUDENT-123", "^STUDENT-[0-9]{3}$")).toBe("match");
      expect(await compare("STDOUT_REGEX", "X STUDENT-123", "^STUDENT-[0-9]{3}$")).toBe("no-match");
    });

    it("lets $ match before a final newline, as Python does", async () => {
      expect(await compare("STDOUT_REGEX", "42\n", "^42$")).toBe("match");
    });

    it("supports inline flags", async () => {
      expect(await compare("STDOUT_REGEX", "HELLO", "(?i)hello")).toBe("match");
    });

    it("supports lookarounds and backreferences", async () => {
      expect(await compare("STDOUT_REGEX", "abcabc", "(abc)\\1")).toBe("match");
      expect(await compare("STDOUT_REGEX", "price: 30", "(?<=: )30")).toBe("match");
    });

    it("treats an unusable pattern as a grader fault, not a wrong answer", async () => {
      expect(await compare("STDOUT_REGEX", "anything", "[unclosed")).toBe("invalid-pattern");
    });
  });

  describe("STDOUT_REGEX_NOMATCH", () => {
    it("is the negation of search", async () => {
      expect(await compare("STDOUT_REGEX_NOMATCH", "abc", "[0-9]+")).toBe("match");
      expect(await compare("STDOUT_REGEX_NOMATCH", "a1c", "[0-9]+")).toBe("no-match");
    });
  });

  describe("budget", () => {
    it("stops a catastrophically backtracking pattern", async () => {
      // Without a parent-owned deadline this pattern runs effectively forever
      // and holds the judge slot with it.
      const result = await pool.compare({
        comparator: "STDOUT_REGEX",
        actual: `${"a".repeat(40)}b`,
        expected: "(a+)+$",
        budgetMs: 200,
      });

      expect(result.kind).toBe("timeout");
    }, 30_000);

    it("keeps serving after a comparator was destroyed", async () => {
      expect(await compare("STDOUT", "recovered", "recovered")).toBe("match");
    }, 60_000);
  });

  describe("concurrency", () => {
    it("does not let overlapping comparisons corrupt each other", async () => {
      // The reported bug: round-robin without a lease put two comparisons on
      // one interpreter, and the second overwrote the first's settle handler,
      // so a matching pair came back as a timeout.
      const results = await Promise.all([
        pool.compare({ comparator: "STDOUT", actual: "same", expected: "same" }),
        pool.compare({ comparator: "STDOUT", actual: "same", expected: "same" }),
      ]);

      expect(results.map((result) => result.kind)).toEqual(["match", "match"]);
    }, 60_000);

    it("keeps many overlapping comparisons independent", async () => {
      const requests = Array.from({ length: 12 }, (_unused, index) =>
        pool.compare({
          comparator: "STDOUT",
          actual: `value-${index}`,
          expected: index % 2 === 0 ? `value-${index}` : "different",
        }),
      );
      const results = await Promise.all(requests);

      expect(results.map((result) => result.kind)).toEqual(
        Array.from({ length: 12 }, (_unused, index) =>
          index % 2 === 0 ? "match" : "no-match",
        ),
      );
    }, 90_000);

    it("does not kill a worker with a stale grace timer", async () => {
      // The second bug: a comparison that answered inside the grace window
      // left the hard-kill timer running, and it later destroyed a worker that
      // was busy with somebody else's work.
      const slowPool = new ComparatorPool(1);
      await slowPool.warmUp();
      try {
        // Budget short enough to arm the grace timer against work that then
        // completes normally.
        await slowPool.compare({
          comparator: "STDOUT",
          actual: "x".repeat(50_000),
          expected: "x".repeat(50_000),
          budgetMs: 1,
        });

        await new Promise((resolve) => setTimeout(resolve, 400));

        const after = await slowPool.compare({
          comparator: "STDOUT",
          actual: "still here",
          expected: "still here",
        });
        expect(after.kind).toBe("match");
      } finally {
        await slowPool.dispose();
      }
    }, 120_000);
  });

  describe("shutdown", () => {
    it("ends a comparison in progress instead of letting it run to its deadline", async () => {
      // The reported reproduction: `dispose` knew only idle threads, so it
      // returned at once while a leased comparison carried on until its own
      // timeout — here ten seconds of catastrophic backtracking.
      const busy = new ComparatorPool(1);
      await busy.warmUp();
      const running = busy.compare({
        comparator: "STDOUT_REGEX",
        actual: `${"a".repeat(40)}b`,
        expected: "(a+)+$",
        budgetMs: 10_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(busy.stats().leased).toBe(1);

      const startedAt = Date.now();
      await busy.dispose();

      expect(Date.now() - startedAt).toBeLessThan(3_000);
      // Settled by the time dispose returned, as a grader error: the output
      // was never judged, so it is neither a match nor a timeout.
      expect(await settlesWithin(running, 0)).toEqual(
        expect.objectContaining({ kind: "error" }),
      );
      expect(busy.stats()).toEqual(
        expect.objectContaining({ total: 0, idle: 0, leased: 0, starting: 0 }),
      );
    }, 60_000);

    it("stops a comparator that is still warming", async () => {
      const warming = new ComparatorPool(1);
      const warmUp = warming.warmUp().catch(() => undefined);

      await warming.dispose();

      expect(warming.stats()).toEqual(
        expect.objectContaining({ total: 0, starting: 0 }),
      );
      await warmUp;
    }, 60_000);

    it("returns only once every thread — idle, leased and warming — has stopped", async () => {
      FakeWorker.created = [];
      let made = 0;
      const pool = new ComparatorPool(2, {
        createWorker: () => {
          made += 1;
          // First: leased and hanging. Second: never finishes warming.
          return made === 1
            ? new FakeWorker({ answer: "hang", stopMs: 50 })
            : new FakeWorker({ warm: "manual", stopMs: 50 });
        },
      });
      const warmUp = pool.warmUp().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const leased = pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pool.stats()).toEqual(
        expect.objectContaining({ leased: 1, starting: 1 }),
      );

      await pool.dispose();

      expect(FakeWorker.created).toHaveLength(2);
      expect(FakeWorker.created.every((worker) => worker.stopped)).toBe(true);
      expect(await settlesWithin(leased, 0)).toEqual(
        expect.objectContaining({ kind: "error" }),
      );
      await warmUp;
    });
  });

  describe("replacement failure", () => {
    it("fails later callers at once rather than leaving them waiting", async () => {
      // The second half of the finding: a replacement that could not start
      // left no thread and nothing coming, and the next caller queued for
      // ever. The failure is now recorded and reported.
      let made = 0;
      const pool = new ComparatorPool(1, {
        spawnAttempts: 2,
        spawnRetryMs: 1,
        createWorker: () => {
          made += 1;
          return made === 1
            ? new FakeWorker({ answer: "die" })
            : new FakeWorker({ warm: "fail" });
        },
      });
      await pool.warmUp();

      // Kills the only thread; its replacement then fails every attempt.
      expect((await pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" })).kind)
        .toBe("timeout");
      // Queued while the replacement is still being attempted.
      const queued = pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });

      expect(await settlesWithin(queued, 1_000)).toEqual(
        expect.objectContaining({ kind: "error", detail: expect.stringContaining("could not start") }),
      );
      expect(pool.stats().failed).toBe(true);

      const later = pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });
      expect(await settlesWithin(later, 200)).toEqual(
        expect.objectContaining({ kind: "error" }),
      );
      await pool.dispose();
    });

    it("recovers once a comparator can start again", async () => {
      let healthy = false;
      const pool = new ComparatorPool(1, {
        spawnAttempts: 1,
        spawnRetryMs: 1,
        createWorker: () =>
          healthy ? new FakeWorker() : new FakeWorker({ warm: "fail" }),
      });
      await expect(pool.warmUp()).rejects.toThrow("could not start");

      healthy = true;
      // This caller is told the truth and starts a recovery in the background.
      expect((await pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" })).kind)
        .toBe("error");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((await pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" })).kind)
        .toBe("match");
      expect(pool.stats().failed).toBe(false);
      await pool.dispose();
    });

    it("never holds more threads than its size while recovering", async () => {
      const pool = new ComparatorPool(2, {
        spawnAttempts: 1,
        createWorker: () => new FakeWorker({ warm: "manual" }),
      });
      void pool.warmUp().catch(() => undefined);
      for (let index = 0; index < 5; index += 1) {
        void pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });
      }
      expect(pool.stats().total).toBeLessThanOrEqual(2);
      await pool.dispose();
    });
  });

  describe("the caller's deadline", () => {
    it("counts time spent queueing for an interpreter", async () => {
      // The finding: a comparison's budget started only once it had an
      // interpreter, so a caller queued behind others could run past the
      // submission's deadline and still have its case finalized.
      const pool = new ComparatorPool(1, {
        createWorker: () => new FakeWorker({ answer: "hang" }),
      });
      await pool.warmUp();
      const busy = pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });

      const startedAt = Date.now();
      const queued = await pool.compare({
        comparator: "STDOUT",
        actual: "a",
        expected: "a",
        deadlineAt: Date.now() + 50,
      });

      expect(queued).toEqual({ kind: "deadline" });
      expect(Date.now() - startedAt).toBeLessThan(500);
      // It left the queue: no interpreter will later be handed to it.
      expect(pool.stats().waiting).toBe(0);
      await pool.dispose();
      await busy;
    });

    it("refuses at once when the deadline has already passed", async () => {
      const pool = new ComparatorPool(1, {
        createWorker: () => new FakeWorker({ answer: "hang" }),
      });
      await pool.warmUp();
      const busy = pool.compare({ comparator: "STDOUT", actual: "a", expected: "a" });

      expect(
        await pool.compare({
          comparator: "STDOUT",
          actual: "a",
          expected: "a",
          deadlineAt: Date.now() - 1,
        }),
      ).toEqual({ kind: "deadline" });
      await pool.dispose();
      await busy;
    });

    it("reports a comparison cut short by the deadline as the deadline, not a slow pattern", async () => {
      const real = new ComparatorPool(1);
      await real.warmUp();
      try {
        const result = await real.compare({
          comparator: "STDOUT_REGEX",
          actual: `${"a".repeat(40)}b`,
          expected: "(a+)+$",
          budgetMs: 5_000,
          deadlineAt: Date.now() + 200,
        });
        expect(result).toEqual({ kind: "deadline" });
      } finally {
        await real.dispose();
      }
    }, 60_000);
  });

  describe("runtime version", () => {
    it("reports the version the interpreter itself announced", () => {
      // Read from Pyodide in the thread, not from configuration.
      expect(pool.version).toBe("pyodide-0.27.5");
    });

    it("refuses a replacement running a different runtime", async () => {
      let made = 0;
      const mixed = new ComparatorPool(1, {
        spawnAttempts: 1,
        createWorker: () => {
          made += 1;
          return made === 1
            ? new FakeWorker({ answer: "die", version: "0.27.5" })
            : new FakeWorker({ version: "0.28.0" });
        },
      });
      await mixed.warmUp();
      expect(mixed.version).toBe("pyodide-0.27.5");

      await mixed.compare({ comparator: "STDOUT", actual: "a", expected: "a" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mixed.stats()).toEqual(expect.objectContaining({ total: 0, failed: true }));
      expect(
        await mixed.compare({ comparator: "STDOUT", actual: "a", expected: "a" }),
      ).toEqual(expect.objectContaining({ kind: "error" }));
      expect(mixed.version).toBe("pyodide-0.27.5");
      await mixed.dispose();
    });

    it("refuses an interpreter that does not say what it is", async () => {
      const silent = new ComparatorPool(1, {
        spawnAttempts: 1,
        createWorker: () => new FakeWorker({ version: null }),
      });
      await expect(silent.warmUp()).rejects.toThrow("did not report its runtime version");
      await silent.dispose();
    });
  });

  describe("production build", () => {
    it("compiles the comparator thread into the judge worker bundle", async () => {
      // Loaded by path through `new Worker`, never imported, so TypeScript
      // cannot find it through the module graph. The runner had exactly this
      // gap; a built judge would have booted a pool whose thread file was
      // missing and failed every enhanced grade as a grader error.
      const { readFile } = await import("node:fs/promises");
      const config = await readFile(
        new URL("../../../judge-worker/tsconfig.json", import.meta.url),
        "utf8",
      );

      expect(config).toContain("comparator-thread.ts");
    });
  });

  describe("untrusted strings are data, not code", () => {
    it("treats a quote-laden expected output literally", async () => {
      const hostile = `", "kind": "match", "x": "`;
      expect(await compare("STDOUT", hostile, hostile)).toBe("match");
      expect(await compare("STDOUT", "different", hostile)).toBe("no-match");
    });

    it("treats Python source in the output as text", async () => {
      const hostile = "posix";
      expect(await compare("STDOUT", hostile, hostile)).toBe("match");
    });
  });
});
