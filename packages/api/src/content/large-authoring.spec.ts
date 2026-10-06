import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import { createProgrammingExerciseSchema, defaultEliceGradingProfile } from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("large authoring requests through the API RPC transport", () => {
  let server: Server;
  let url: string;
  const handler = new RPCHandler({
    save: os.input(createProgrammingExerciseSchema).handler(({ input }) => ({
      inputLength: input.testCases[0]!.input.length,
      outputLength: input.testCases[0]!.expectedOutput.length,
    })),
  });
  beforeAll(async () => {
    server = createServer((request, response) => {
      void handler.handle(request, response, { prefix: "/api/rpc" });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rpc/save`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const problem = (input: string, expectedOutput: string) => ({
    academyId: "20000000-0000-4000-8000-000000000001",
    courseId: "20000000-0000-4000-8000-000000000002",
    lectureId: "20000000-0000-4000-8000-000000000003",
    title: "Large grading test", difficulty: "EASY", description: "",
    inputFormat: "", outputFormat: "", constraints: "", starterCode: "",
    solutionCode: "print(1)", aiFeedbackEnabled: false, isVisible: false,
    grading: defaultEliceGradingProfile, hints: [],
    testCases: [{input, expectedOutput, visibility: "SAMPLE", comparator: "STDOUT",
      weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null}],
  });
  it("accepts a complete multi-megabyte problem payload", async () => {
    const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({json: problem("1".repeat(5_000_000), "0".repeat(3_500_000))})});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({json: {inputLength: 5_000_000, outputLength: 3_500_000}});
  }, 15_000);
  it("rejects an oversized case with a validation error", async () => {
    const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({json: problem("1".repeat(gradingDataLimits.testTextChars + 1), "0")})});
    expect(response.status).toBe(400);
  }, 15_000);
});
