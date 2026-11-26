import { z } from "zod";

export type AiEffort = "none" | "low" | "medium" | "high";
/** OpenAI's processing tier: `fast` answers sooner and costs twice as much. */
export type AiServiceTier = "default" | "fast";

/** What a call cost in tokens, and the tier OpenAI billed them at (absent: default). */
export type AiUsage = { inputTokens: number; outputTokens: number; serviceTier?: AiServiceTier };

export type AiModelRequest = {
  model: string;
  effort: AiEffort;
  serviceTier: AiServiceTier;
  instructions: string;
  content: string;
  /** A strict JSON schema: every object closed and every property required. */
  schema: { name: string; schema: Record<string, unknown> };
  maxOutputTokens: number;
};

export type AiModelAnswer = AiUsage & {
  /** The model's JSON, parsed but not yet validated by the caller. */
  json: unknown;
  model: string;
};

/** What went wrong, for a stored failure code and a log. Never carries text. */
export type AiModelFailure = "TIMEOUT" | "PROVIDER" | "MALFORMED";

export class AiModelError extends Error {
  constructor(
    readonly code: AiModelFailure,
    readonly detail: string,
    /** A paid but unusable answer is still paid for. */
    readonly usage: AiUsage = { inputTokens: 0, outputTokens: 0 },
  ) {
    super(`${code}: ${detail}`);
  }
}

/** The one way the API reaches a model, so another provider is one class. */
export abstract class AiModelClient {
  abstract readonly available: boolean;
  abstract complete(request: AiModelRequest, signal: AbortSignal): Promise<AiModelAnswer>;
}

const responseSchema = z.object({
  status: z.string(),
  model: z.string().optional(),
  service_tier: z.string().nullish(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()).optional(),
  }).loose()),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }).loose(),
}).loose();

/**
 * OpenAI's Responses API, over `fetch`.
 *
 * `store: false` on every call. No retry: one click is at most one paid call.
 * An error names a status and nothing from the body, which may echo a prompt.
 * The tier billed is the one OpenAI reports: a `fast` request it moved to
 * `default` costs the normal price; one it does not report is counted as asked.
 */
export class OpenAiModelClient extends AiModelClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly request: typeof fetch = fetch,
    private readonly endpoint = "https://api.openai.com/v1/responses",
  ) {
    super();
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(input: AiModelRequest, signal: AbortSignal): Promise<AiModelAnswer> {
    if (!this.apiKey) throw new AiModelError("PROVIDER", "no key");
    let response: Response;
    let body: unknown;
    try {
      response = await this.request(this.endpoint, {
        method: "POST",
        signal,
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          instructions: input.instructions,
          input: input.content,
          max_output_tokens: input.maxOutputTokens,
          reasoning: { effort: input.effort },
          service_tier: input.serviceTier,
          store: false,
          text: { format: { type: "json_schema", strict: true, name: input.schema.name, schema: input.schema.schema } },
        }),
      });
      if (!response.ok) throw new AiModelError("PROVIDER", `status ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof AiModelError) throw error;
      if (signal.aborted) throw new AiModelError("TIMEOUT", "no answer in time");
      throw new AiModelError("PROVIDER", error instanceof SyntaxError ? "unreadable body" : "unreachable");
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new AiModelError("MALFORMED", "unexpected shape");
    const billed = parsed.data.service_tier ?? input.serviceTier;
    const usage: AiUsage = {
      inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens,
      // Fast mode was called priority before July 2026; both cost the same.
      serviceTier: billed === "fast" || billed === "priority" ? "fast" : "default",
    };
    if (parsed.data.status !== "completed") throw new AiModelError("MALFORMED", `status ${parsed.data.status.slice(0, 20)}`, usage);
    const text = parsed.data.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .map((part) => (part.type === "output_text" ? part.text ?? "" : ""))
      .join("");
    try {
      return { json: JSON.parse(text), ...usage, model: parsed.data.model ?? input.model };
    } catch {
      throw new AiModelError("MALFORMED", "not JSON", usage);
    }
  }
}

/** For tests and local demos. Answers from a function; makes no request. */
export class FakeModelClient extends AiModelClient {
  readonly available = true;
  readonly requests: AiModelRequest[] = [];
  constructor(private readonly answer: (request: AiModelRequest, signal: AbortSignal) => unknown) {
    super();
  }
  async complete(request: AiModelRequest, signal: AbortSignal): Promise<AiModelAnswer> {
    this.requests.push(request);
    const json = await this.answer(request, signal);
    return { json, inputTokens: 100, outputTokens: 20, model: request.model };
  }
}

/** Runs `action` with a deadline the client sees as an abort. */
export async function withDeadline<T>(ms: number, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AiModelError("TIMEOUT", "no answer in time"));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
