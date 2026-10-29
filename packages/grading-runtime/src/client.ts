import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import {
  brokerRequestSchema,
  decodeBrokerResponse,
  runtimeDescriptorIdentity,
  type BrokerRequest,
  type BrokerResponse,
} from "@cove/shared";
import { frame, FrameDecoder } from "./protocol.js";
import { invariant } from "./errors.js";
export type ClientRequest = BrokerRequest extends infer R
  ? R extends BrokerRequest
    ? Omit<R, "protocol" | "requestId">
    : never
  : never;
/** Trusted client. Transport loss is uncertainty, never automatic re-execution. */
export class BrokerClient {
  constructor(
    readonly socketPath: string,
    readonly timeoutMs = 120000,
  ) {}
  request(input: ClientRequest, signal?: AbortSignal): Promise<BrokerResponse> {
    const request = brokerRequestSchema.parse({
      ...input,
      protocol: 1,
      requestId: randomUUID(),
    });
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      let done = false;
      const finish = (error?: Error, response?: BrokerResponse) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        socket.destroy();
        error ? reject(error) : resolve(response!);
      };
      const abort = () =>
        finish(new Error("Broker transport cancelled; reconcile receipt"));
      const timer = setTimeout(
        () => finish(new Error("Broker timeout; reconcile receipt")),
        this.timeoutMs,
      );
      const decoder = new FrameDecoder((raw) => {
        try {
          const response = decodeBrokerResponse(raw);
          invariant(
            response.requestId === request.requestId,
            "Response request mismatch",
          );
          if (
            request.type !== "health" &&
            response.type !== "error" &&
            response.type !== "health"
          ) {
            const bound =
              response.type === "receipt" ? response.receipt : response;
            invariant(
              runtimeDescriptorIdentity(bound.runtime) ===
                runtimeDescriptorIdentity(request.runtime),
              "Response runtime mismatch",
            );
            invariant(
              Object.keys(request.context).every(
                (k) =>
                  bound.context[k as keyof typeof bound.context] ===
                  request.context[k as keyof typeof request.context],
              ),
              "Response context mismatch",
            );
            if (response.type !== "receipt")
              invariant(
                bound.brokerGeneration === request.brokerGeneration,
                "Response broker generation mismatch",
              );
            if ("reservationId" in request)
              invariant(
                bound.reservationId === request.reservationId,
                "Response reservation mismatch",
              );
          }
          finish(undefined, response);
        } catch (e) {
          finish(e as Error);
        }
      });
      socket.on("connect", () => socket.write(frame(request)));
      socket.on("data", (chunk) => {
        try {
          decoder.push(chunk);
        } catch (e) {
          finish(e as Error);
        }
      });
      socket.on("error", (e) => finish(e));
      socket.on("end", () => {
        if (!done) finish(new Error("Broker disconnected; reconcile receipt"));
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}
