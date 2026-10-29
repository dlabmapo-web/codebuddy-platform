import {
  Controller,
  Headers,
  HttpStatus,
  Optional,
  Param,
  Query,
  Sse,
} from "@nestjs/common";
import { isTerminalStatus, submissionResultSchema } from "@cove/shared";
import { Observable, ReplaySubject } from "rxjs";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { StaffPracticeService } from "./staff-practice.service.js";

type StreamEvent = { type: string; data: string };

/** Personal staff practice uses its own queue and the same authorization as its result read. */
@Controller("practice-submissions")
export class PracticeSubmissionController {
  constructor(
    private readonly practice: StaffPracticeService,
    private readonly auth: SupabaseAuthService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  @Sse(":submissionId/stream")
  async stream(
    @Param("submissionId") submissionId: string,
    @Query("academyId") academyId: string,
    @Headers("authorization") authorization?: string,
  ): Promise<Observable<StreamEvent>> {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;
    if (!token)
      throw new AppException(
        "AUTHENTICATION_REQUIRED",
        HttpStatus.UNAUTHORIZED,
      );
    const identity = await this.auth.verifyAccessToken(token);
    // Reject before attaching. Each subsequent read repeats current membership,
    // material access, academy and owner checks; this identity is not an access grant.
    await this.practice.get(identity, { academyId, submissionId });
    const subject = new ReplaySubject<StreamEvent>(1);
    const events = this.queue?.practiceEvents;
    let closed = false;
    let reading = false;
    let readAgain = false;
    const timers: NodeJS.Timeout[] = [];
    const finish = () => {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      timers.forEach(clearInterval);
      events?.off("completed", onCompleted);
      events?.off("failed", onFailed);
      subject.complete();
    };
    const fail = () => {
      if (closed) return;
      subject.next({
        type: "error",
        data: JSON.stringify({ submissionId, reason: "PRACTICE_UNAVAILABLE" }),
      });
      finish();
    };
    const readResult = async () => {
      if (closed) return;
      if (reading) {
        readAgain = true;
        return;
      }
      reading = true;
      try {
        do {
          readAgain = false;
          const result = submissionResultSchema.parse(
            await this.practice.get(identity, { academyId, submissionId }),
          );
          if (closed) return;
          const publicResult = {
            ...result,
            cases: result.cases.map((item) =>
              item.isSample
                ? item
                : {
                    ...item,
                    input: null,
                    expectedOutput: null,
                    actualOutput: null,
                  },
            ),
          };
          subject.next({ type: "result", data: JSON.stringify(publicResult) });
          if (isTerminalStatus(result.status)) {
            finish();
            return;
          }
        } while (readAgain && !closed);
      } catch {
        fail();
      } finally {
        reading = false;
      }
    };
    const onCompleted = ({ jobId }: { jobId: string }) => {
      if (jobId === submissionId) void readResult();
    };
    // Retained failure events may belong to an earlier execution of this job.
    // Only the current authorized durable result determines its visible state.
    const onFailed = ({ jobId }: { jobId: string }) => {
      if (jobId === submissionId) void readResult();
    };
    events?.on("completed", onCompleted);
    events?.on("failed", onFailed);
    timers.push(
      setInterval(() => subject.next({ type: "ping", data: "" }), 15_000),
    );
    timers.push(setTimeout(finish, 5 * 60_000));
    // Subscribe before this read: completion in the authorization/attach gap is
    // observed here, and a completion during this read schedules another read.
    void readResult();
    return new Observable((subscriber) => {
      const subscription = subject.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        finish();
      };
    });
  }
}
