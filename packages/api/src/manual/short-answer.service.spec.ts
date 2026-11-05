import { describe, it, expect, vi } from "vitest";
import { ShortAnswerService } from "./short-answer.service.js";
function fixture() {
  const job = {
    evaluatorVersion: "short-answer-js-v1",
    submissionId: "attempt",
    definition: {
      version: 1,
      question: "Original prompt",
      gradingMode: "EXACT",
      expectedAnswer: "original",
      pattern: "",
      explanationEnabled: false,
      explanation: "",
    },
    submission: {
      answer: "original",
      maximumHundredths: 7500,
      materialId: "material",
      userId: "student",
      classId: "class",
    },
  };
  const db = {
    shortAnswerAssessment: {
      findMany: vi.fn().mockResolvedValue([job]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (operation) => operation(db));
  const points = { awardManualCompletion: vi.fn() };
  const service = new ShortAnswerService(
    db as never,
    { get: () => true } as never,
    points as never,
  );
  return { service, db, points, job };
}
describe("durable short-answer jobs", () => {
  it("grades the immutable definition and score snapshot, then projects completion", async () => {
    const { service, db, points } = fixture();
    await service.drain();
    expect(
      db.shortAnswerAssessment.updateMany.mock.calls[1][0].data,
    ).toMatchObject({
      status: "GRADED",
      verdict: "CORRECT",
      scoreHundredths: 7500,
      completed: true,
    });
    expect(points.awardManualCompletion).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        materialId: "material",
        userId: "student",
        classId: "class",
      }),
    );
    expect(db.shortAnswerAssessment.findMany.mock.calls[0][0].where.OR).toEqual(
      [
        expect.objectContaining({ status: "PENDING" }),
        expect.objectContaining({
          status: "EVALUATING",
          leaseUntil: expect.any(Object),
        }),
      ],
    );
  });
  it("does not score or award if another process owns the lease", async () => {
    const { service, db, points } = fixture();
    db.shortAnswerAssessment.updateMany.mockResolvedValue({ count: 0 });
    await service.drain();
    expect(points.awardManualCompletion).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("leaves infrastructure failures unscored and releases the lease for explicit retry", async () => {
    const { service, db, points } = fixture();
    vi.spyOn(service.evaluator, "evaluate").mockRejectedValue(
      new Error("Unavailable"),
    );
    await service.drain();
    expect(db.shortAnswerAssessment.updateMany.mock.calls[1][0].data).toEqual({
      status: "ERROR",
      leaseUntil: null,
    });
    expect(points.awardManualCompletion).not.toHaveBeenCalled();
  });
});

it("never reinterprets a snapshot from an unsupported evaluator version", async () => {
  const { service, db, points, job } = fixture();
  job.evaluatorVersion = "future-version";
  await service.drain();
  expect(db.shortAnswerAssessment.updateMany.mock.calls[1][0].data).toEqual({
    status: "ERROR",
    leaseUntil: null,
  });
  expect(points.awardManualCompletion).not.toHaveBeenCalled();
});

describe("short-answer wake-ups", () => {
  it("grades a newly queued answer immediately instead of waiting for the recovery tick", async () => {
    const { service, db } = fixture();
    db.shortAnswerAssessment.findMany.mockResolvedValueOnce([]);
    service.requestDrain();
    await vi.waitFor(() => expect(db.shortAnswerAssessment.findMany).toHaveBeenCalledOnce());
  });

  it("runs one more drain for work queued while a drain was running", async () => {
    const { service, db } = fixture();
    let release!: () => void;
    db.shortAnswerAssessment.findMany
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([]); }))
      .mockResolvedValue([]);
    service.requestDrain();
    await vi.waitFor(() => expect(db.shortAnswerAssessment.findMany).toHaveBeenCalledTimes(1));
    service.requestDrain(); // queued while the first drain is still reading
    release();
    await vi.waitFor(() => expect(db.shortAnswerAssessment.findMany).toHaveBeenCalledTimes(2));
  });

  it("keeps draining while batches come back full, then stops", async () => {
    const { service, db, job } = fixture();
    const batch = Array.from({ length: 4 }, (_, i) => ({ ...job, submissionId: `attempt-${i}` }));
    db.shortAnswerAssessment.findMany.mockResolvedValueOnce(batch).mockResolvedValueOnce([job]).mockResolvedValue([]);
    service.requestDrain();
    await vi.waitFor(() => expect(db.shortAnswerAssessment.findMany).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(db.shortAnswerAssessment.findMany).toHaveBeenCalledTimes(2);
  });
});
