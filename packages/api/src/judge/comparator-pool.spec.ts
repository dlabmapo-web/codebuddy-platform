import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ComparatorPool } from "./comparator-pool.js";

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
