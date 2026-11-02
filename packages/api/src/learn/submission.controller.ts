import { frozenNativeDescriptor } from "../judge/native-admission.js";
import {
  Controller,
  HttpStatus,
  Headers,
  Optional,
  Param,
  Query,
  Sse,
} from "@nestjs/common";
import {
  isTerminalStatus,
  submissionProgressEventSchema,
} from "@cove/shared";
import { Observable, ReplaySubject } from "rxjs";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { SubmissionService } from "./submission.service.js";

type StreamEvent = { type: string; data: string };

/** Comment frames keep proxies from closing an idle stream. */
const KEEP_ALIVE_MS = 15_000;
/** A verdict always arrives well inside this; it bounds a leaked connection. */
const MAX_STREAM_MS = 5 * 60_000;

/**
 * Live submission results.
 *
 * A plain controller rather than an oRPC procedure: SSE does not fit the
 * contract model, so enqueue, fetch, and list stay in oRPC and only the stream
 * lives here. Replaces v1's polling loop, which ran up to 400 status queries
 * per submission and still left the student waiting after the result existed.
 */
// `main.ts` sets a global `api` prefix, so this must not repeat it — the route
// resolved to `/api/api/submissions/...`, the stream 404'd on every submit, and
// the client fell back to its single delayed poll. Grading took under a second
// while students waited fifteen. `AppController` uses the same bare form.
@Controller("submissions")
export class SubmissionController {
  constructor(
    private readonly submissions: SubmissionService,
    private readonly prisma: PrismaService,
    private readonly auth: SupabaseAuthService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  @Sse(":submissionId/stream")
  async stream(
    @Param("submissionId") submissionId: string,
    @Query("academyId") academyId: string,
    // `EventSource` cannot set headers, so the browser proxies through the web
    // app, which forwards the bearer token.
    @Headers("authorization") authorization?: string,
  ): Promise<Observable<StreamEvent>> {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }

    const identity = await this.auth.verifyAccessToken(token);
    // Authorised before attaching: a subscriber must never receive events for
    // another student's submission.
    await this.submissions.assertOwnership(
      identity.authUserId,
      academyId,
      submissionId,
    );

    const routing = await this.prisma.submission.findUnique({ where: { id: submissionId }, select: { executionRuntimeSnapshot: true } });
    const descriptor = frozenNativeDescriptor(routing?.executionRuntimeSnapshot);
    const events = descriptor ? this.queue?.forRuntime(descriptor).events : this.queue?.events;

    // Replay one event so a verdict found by the initial database check cannot
    // race ahead of the Observable subscription.
    const subject = new ReplaySubject<StreamEvent>(1);
    const timers: NodeJS.Timeout[] = [];
    let closed = false;

    const finish = () => {
      if (closed) return;
      closed = true;
      timers.forEach(clearInterval);
      timers.forEach(clearTimeout);
      events?.off("progress", onProgress);
      events?.off("completed", onCompleted);
      events?.off("failed", onFailed);
      subject.complete();
    };

    let reading = false;
    let readAgain = false;
    const emitResult = async () => {
      if (closed) return;
      if (reading) { readAgain = true; return; }
      reading = true;
      try {
        do {
          readAgain = false;
          await this.submissions.assertOwnership(identity.authUserId, academyId, submissionId);
          const submission = await this.prisma.submission.findUnique({
            where: { id: submissionId }, select: { status: true, passedCount: true, totalCount: true },
          });
          if (closed || !submission) return;
          // Only durable committed state can terminate a stream.
          subject.next({ type: "result", data: JSON.stringify({ status: submission.status, passedCount: submission.passedCount, totalCount: submission.totalCount }) });
          if (isTerminalStatus(submission.status)) { finish(); return; }
        } while (readAgain && !closed);
      } catch {
        if (!closed) subject.next({ type: "error", data: JSON.stringify({ submissionId, reason: "JUDGE_UNAVAILABLE" }) });
        finish();
      } finally { reading = false; }
    };

    const onProgress = ({ jobId, data }: { jobId: string; data: unknown }) => {
      if (jobId !== submissionId) return;
      const progress = submissionProgressEventSchema.safeParse(data);
      if (!progress.success) return;
      // Parse through the public schema so extra worker fields can never turn
      // into a hidden-case disclosure.
      subject.next({
        type: "progress",
        data: JSON.stringify(progress.data),
      });
    };
    const onCompleted = ({ jobId }: { jobId: string }) => {
      if (jobId !== submissionId) return;
      void emitResult();
    };
    const onFailed = ({ jobId }: {
      jobId: string;
      failedReason: string;
    }) => {
      if (jobId !== submissionId) return;
      void emitResult();
    };

    events?.on("progress", onProgress);
    events?.on("completed", onCompleted);
    events?.on("failed", onFailed);

    // A submission graded before the stream opened would otherwise never emit.
    void emitResult();

    timers.push(
      setInterval(() => subject.next({ type: "ping", data: "" }), KEEP_ALIVE_MS),
    );
    timers.push(setTimeout(finish, MAX_STREAM_MS));
    timers.push(setInterval(() => void emitResult(), 2_000));

    return new Observable<StreamEvent>((subscriber) => {
      const subscription = subject.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        finish();
      };
    });
  }
}
