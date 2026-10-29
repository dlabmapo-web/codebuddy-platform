import { DLAB_OS_BASE_URL } from '@cove/shared';
import { z } from "zod";

function usesProtocol(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrlSchema = z.string().refine(
  (value) => usesProtocol(value, ["http:", "https:"]),
  { message: "must be a valid HTTP or HTTPS URL" },
);

const httpsUrlSchema = z.string().refine(
  (value) => usesProtocol(value, ["https:"]),
  { message: "must be a valid HTTPS URL" },
);

const postgresUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        return usesProtocol(value, ["postgresql:", "postgres:"]);
      } catch {
        return false;
      }
    },
    { message: "must be a PostgreSQL connection URL" },
  );

export const apiEnvironmentSchema = z.object({
  DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: z.string().default('').transform(v => v.split(',').map(s => s.trim()).filter(Boolean)),
  DLAB_SSO_ENABLED: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  DLAB_OS_BASE_URL: z.literal(DLAB_OS_BASE_URL).default(DLAB_OS_BASE_URL),
  DLAB_SSO_ROLLOUT_MODE: z.enum(['allowlist', 'campus']).default('allowlist'),
  DLAB_CLIENT_ID: z.literal('cove').default('cove'),
  DLAB_CLIENT_SECRET: z.string().min(32).optional(),
  DLAB_INBOUND_SERVER_KEY: z.string().min(32).optional(),
  DLAB_REDIRECT_URI: httpUrlSchema.optional(),
  VIDEO_LESSONS_ENABLED:z.preprocess(v=>v === "true" || v === true,z.boolean()).default(false),
  VIDEO_MAX_UPLOAD_BYTES:z.coerce.number().int().min(1).max(5000000000).default(5000000000),
  VIDEO_COURSE_QUOTA_BYTES:z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(100000000000),
  MULTIPLE_CHOICE_ENABLED: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  SHORT_ANSWER_ENABLED:z.preprocess(v=>v === "true" || v === true,z.boolean()).default(false),
  GUI_ENABLED:z.preprocess(v=>v === "true" || v === true,z.boolean()).default(false),
  GUI_SERVICE_URL:httpUrlSchema.optional(),
  GUI_SERVICE_SECRET:z.string().min(32).optional(),
  GUI_PUBLIC_WS_URL:z.string().url().optional(),
  TURTLE_TRIAL_ENABLED: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  TURTLE_TRIAL_BROWSER_ENABLED: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: z.preprocess(v => v === '' ? undefined : v, httpUrlSchema.optional()),
  TURTLE_TRIAL_BROWSER_RUNTIME_ID: z.preprocess(v => v === '' ? undefined : v, z.string().regex(/^brython-\d+\.\d+\.\d+-[a-f0-9]{20}$/).optional()),
  TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS: z.string().default('').transform(v => v.split(',').map(x => x.trim()).filter(Boolean)).pipe(z.array(z.string().regex(/^brython-\d+\.\d+\.\d+-[a-f0-9]{20}$/)).max(16)),
  TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS: z.string().default('').transform(v => v.split(',').map(x => x.trim()).filter(Boolean)).pipe(z.array(z.uuid()).max(1000)),
  TURTLE_TRIAL_PIN_DIGEST: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  TURTLE_TRIAL_LEGACY_PIN_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  TURTLE_TRIAL_PIN_PEPPER: z.string().min(32).optional(),
  TURTLE_TRIAL_PIN_VERSION: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  TURTLE_TRIAL_SERVICE_URL: httpUrlSchema.optional(),
  TURTLE_TRIAL_SERVICE_SECRET: z.string().min(32).optional(),
  TURTLE_TRIAL_PUBLIC_WS_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  WEB_ORIGIN: httpUrlSchema,
  SUPABASE_URL: httpsUrlSchema,
  SUPABASE_SECRET_KEY: z.string().min(1),
  BFF_SHARED_SECRET: z.string().min(32).optional(),
  /**
   * The AES-256-GCM key protecting manager-issued student passwords, as 32
   * bytes of base64.
   *
   * Optional on purpose. A student has no email and therefore no self-service
   * recovery, so issuing a password must work on every deployment; without
   * this key it works and shows the password once, and nothing is stored to
   * read back later. Refusing to start would make a development environment
   * unable to reset a password at all, and refusing the operation would make
   * an unconfigured production one unable to recover a locked-out child.
   */
  /**
   * The Turnstile secret, for the one signup path Supabase cannot check.
   *
   * Optional so a development machine with no Turnstile keys still works. In
   * production its absence means the student signup endpoint has nothing in
   * front of it, which `superRefine` below refuses.
   */
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  STUDENT_CREDENTIAL_KEY: z
    .string()
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      { message: "must be 32 bytes of base64" },
    )
    .optional(),
  DATABASE_URL: postgresUrlSchema,
  DIRECT_URL: postgresUrlSchema,
  /**
   * Grading queue. Optional so the API still boots without it — reading and
   * solving keep working when grading is unavailable; only submitting fails.
   */
  REDIS_URL: z
    .string()
    .refine((value) => usesProtocol(value, ["redis:", "rediss:"]), {
      message: "must be a redis:// or rediss:// URL",
    })
    .optional(),
  /**
   * Live monitoring's Redis. Falls back to `REDIS_URL` so a single-instance
   * development setup needs no extra configuration, and stays separable so
   * production can keep presence off the grading queue's memory budget.
   */
  MONITORING_REDIS_URL: z
    .string()
    .refine((value) => usesProtocol(value, ["redis:", "rediss:"]), {
      message: "must be a redis:// or rediss:// URL",
    })
    .optional(),
  /** Bounded so an idle classroom cannot grow the delivery stream forever. */
  MONITORING_STREAM_MAX_LENGTH: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(1_000_000)
    .default(10_000),
  /** CPU-bound work, so this tracks cores rather than being set high. */
  JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  /** Disabled until the reviewed release manifest and broker generation are ready. */
  GRADING_NATIVE_ENABLED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  /** Loaded and frozen once; no hot reload or implicit development manifest. */
  GRADING_RUNTIME_MANIFEST_PATH: z.string().min(1).max(4096).refine(value => value.startsWith("/") && !value.includes("\0"), "must be an absolute manifest path").optional(),
  JUDGE_METRICS_SECRET: z.string().min(32).optional(),
  JUDGE_TRACE_TIMINGS: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  JUDGE_HEALTH_BIND: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  JUDGE_READINESS_GUARD: z.preprocess(v => v === "true" || v === true, z.boolean()).default(false),
  /**
   * How many repairs a maintenance re-grade runs at once.
   *
   * One by default, and low on purpose. The re-grade queue is separate from the
   * live one so a run cannot put a student behind it, but both workers share
   * the same interpreter pool — so this is how much of `JUDGE_CONCURRENCY` a
   * repair is allowed to occupy while it works.
   */
  REGRADE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  /**
   * Interpreters that compare output for weighted grading. They never run
   * submitted code and a comparison takes milliseconds, so one is enough for
   * most judges; each costs a warm Pyodide in the judge's own memory.
   */
  JUDGE_COMPARATOR_POOL_SIZE: z.coerce.number().int().min(1).max(8).default(1),
  /**
   * Where the judge reaches the student-code sandbox: a Unix socket shared
   * with a separate, network-less container (see `sandbox-server.ts`). Unset
   * means student code runs in child processes of the judge itself, which is
   * allowed only outside production.
   */
  JUDGE_SANDBOX_SOCKET: z.string().min(1).optional(),
  /** Pinned, and shared with the browser so run and submit agree. */
  PYODIDE_VERSION: z.string().default("0.27.5"),
  SUBMISSION_RATE_LIMIT: z.coerce.number().int().min(1).max(120).default(10),
  /**
   * Public sample checks: starting limits, not measured capacity. New checks
   * a student may start per minute (an idempotent retry costs nothing), and
   * checks an academy may have outstanding at once.
   */
  SAMPLE_CHECK_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(6),
  SAMPLE_CHECK_ACADEMY_OUTSTANDING: z.coerce.number().int().min(1).max(1_000).default(50),
  /**
   * Sample checks the judge runs at once. Background work — sample checks and
   * regrades together — can never take the slot reserved for submissions
   * (see `execution-capacity.ts`); this only caps samples within that.
   */
  SAMPLE_CHECK_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  /**
   * Invitation email. Both optional, and both required together: without them
   * the delivery seam resolves to the local sink, which records every state
   * transition and sends nothing. That is the right default for development and
   * a visible, honest failure mode for a deployment that forgot to configure a
   * provider — invitations are logged rather than silently dropped.
   */
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).max(200).optional(),
  /**
   * The shared secret a provider signs its webhooks with.
   *
   * Without it the webhook endpoint refuses every request rather than trusting
   * unsigned ones — §17. An unauthenticated delivery webhook lets anyone mark
   * any invitation delivered, which is a way to hide a failed invitation from
   * the manager who needs to chase it.
   */
  EMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * The organization every academy is created inside.
   *
   * One platform-owned organization rather than one per academy: an academy's
   * slug is unique per organization, so a single organization makes it
   * effectively global — which is what an operator assumes anyway — and a
   * franchise wanting several branches grouped later is then a re-point of
   * `organizationId` rather than a merge of throwaway rows.
   */
  PLATFORM_ORGANIZATION_SLUG: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug")
    .default("cove"),
  /**
   * The one-time first-admin bootstrap, per the authorization design §16.
   *
   * Both optional and both required together. Absent, the command refuses to
   * run — which is how it stays disabled in every environment that is not
   * being bootstrapped right now, including production after the fact.
   * `PLATFORM_BOOTSTRAP_ENV` must match the running `NODE_ENV`: it exists so a
   * `.env` copied from staging cannot promote anybody in production.
   */
  PLATFORM_BOOTSTRAP_ADMIN_EMAIL: z.string().min(3).max(200).optional(),
  PLATFORM_BOOTSTRAP_ENV: z
    .enum(["development", "test", "production"])
    .optional(),
}).superRefine((environment, context) => {
  if (environment.GRADING_NATIVE_ENABLED && !environment.GRADING_RUNTIME_MANIFEST_PATH)
    context.addIssue({ code: "custom", path: ["GRADING_RUNTIME_MANIFEST_PATH"], message: "is required when native grading is enabled" });
  if (environment.TURTLE_TRIAL_BROWSER_ENABLED || environment.TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED) {
    if (!environment.TURTLE_TRIAL_ENABLED || !environment.TURTLE_TRIAL_BROWSER_ENABLED) context.addIssue({ code: 'custom', path: ['TURTLE_TRIAL_BROWSER_ENABLED'], message: 'browser execution requires the trial and browser feature flags' });
    for (const key of ['TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN', 'TURTLE_TRIAL_BROWSER_RUNTIME_ID'] as const) if (!environment[key]) context.addIssue({ code: 'custom', path: [key], message: 'is required for browser execution' });
    const origin = environment.TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN;
    if (origin) {
      const runtime = new URL(origin), app = new URL(environment.WEB_ORIGIN);
      if (runtime.origin !== origin || runtime.hostname === app.hostname || (environment.NODE_ENV === 'production' && runtime.protocol !== 'https:')) context.addIssue({ code: 'custom', path: ['TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN'], message: 'must be a dedicated origin on a different hostname, using HTTPS in production' });
    }
  }
  if (environment.TURTLE_TRIAL_ENABLED) {
    for (const key of ['TURTLE_TRIAL_PIN_PEPPER', 'TURTLE_TRIAL_SERVICE_URL', 'TURTLE_TRIAL_SERVICE_SECRET', 'TURTLE_TRIAL_PUBLIC_WS_URL', 'REDIS_URL', 'BFF_SHARED_SECRET'] as const)
      if (!environment[key]) context.addIssue({ code: 'custom', path: [key], message: 'is required for turtle trial' });
    if (environment.TURTLE_TRIAL_LEGACY_PIN_ENABLED) for (const key of ['TURTLE_TRIAL_PIN_DIGEST', 'TURTLE_TRIAL_PIN_VERSION'] as const)
      if (!environment[key]) context.addIssue({ code: 'custom', path: [key], message: 'is required for legacy turtle trial PINs' });
    if (environment.TURTLE_TRIAL_SERVICE_URL === environment.GUI_SERVICE_URL)
      context.addIssue({ code: 'custom', path: ['TURTLE_TRIAL_SERVICE_URL'], message: 'must use a separate guest broker and Docker daemon' });
    if (environment.TURTLE_TRIAL_SERVICE_SECRET === environment.GUI_SERVICE_SECRET)
      context.addIssue({ code: 'custom', path: ['TURTLE_TRIAL_SERVICE_SECRET'], message: 'must be independent of the course runtime secret' });
    const ws = environment.TURTLE_TRIAL_PUBLIC_WS_URL;
    if (ws && (!usesProtocol(ws, environment.NODE_ENV === 'production' ? ['wss:'] : ['ws:', 'wss:']) ||
      (environment.NODE_ENV === 'production' && ws !== environment.WEB_ORIGIN.replace(/^https:/, 'wss:').replace(/\/$/, '') + '/turtle-display')))
      context.addIssue({ code: 'custom', path: ['TURTLE_TRIAL_PUBLIC_WS_URL'], message: 'must use the isolated turtle-display WebSocket gateway' });
  }
  if (environment.DLAB_SSO_ENABLED) {
    if (environment.DLAB_SSO_ROLLOUT_MODE === 'allowlist' && !environment.DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS.length) context.addIssue({ code: 'custom', path: ['DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS'], message: 'must be nonempty in allowlist mode' });
    for (const key of ['DLAB_CLIENT_SECRET', 'DLAB_INBOUND_SERVER_KEY', 'DLAB_REDIRECT_URI', 'BFF_SHARED_SECRET'] as const) {
      if (!environment[key]) context.addIssue({ code: 'custom', path: [key], message: 'is required when DLAB SSO is enabled' });
    }
    if (!environment.MONITORING_REDIS_URL && !environment.REDIS_URL) context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'is required for DLAB SSO' });
    if (environment.DLAB_INBOUND_SERVER_KEY && [environment.DLAB_CLIENT_SECRET, environment.BFF_SHARED_SECRET].includes(environment.DLAB_INBOUND_SERVER_KEY)) context.addIssue({ code: 'custom', path: ['DLAB_INBOUND_SERVER_KEY'], message: 'must be independent from client and BFF secrets' });
    const expected = environment.WEB_ORIGIN.replace(/\/$/, '') + '/sso/callback';
    if (environment.DLAB_REDIRECT_URI !== expected) context.addIssue({ code: 'custom', path: ['DLAB_REDIRECT_URI'], message: 'must match WEB_ORIGIN /sso/callback' });
  }

  if(environment.GUI_ENABLED){for(const key of ['GUI_SERVICE_URL','GUI_SERVICE_SECRET','GUI_PUBLIC_WS_URL'] as const)if(!environment[key])context.addIssue({code:'custom',path:[key],message:'is required when GUI_ENABLED'});if(environment.NODE_ENV==='production'&&environment.GUI_PUBLIC_WS_URL&&!environment.GUI_PUBLIC_WS_URL.startsWith('wss://'))context.addIssue({code:'custom',path:['GUI_PUBLIC_WS_URL'],message:'must use wss in production'});}

  if (environment.NODE_ENV === "production" && !environment.BFF_SHARED_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["BFF_SHARED_SECRET"],
      message: "is required in production",
    });
  }
  if (
    environment.NODE_ENV === "production" && !environment.TURNSTILE_SECRET_KEY
  ) {
    context.addIssue({
      code: "custom",
      path: ["TURNSTILE_SECRET_KEY"],
      message:
        "is required in production: student signup creates accounts through the service-role admin API, which bypasses Supabase's own captcha",
    });
  }
  if (environment.NODE_ENV === "production") {
    for (const key of ["EMAIL_API_KEY", "EMAIL_FROM", "EMAIL_WEBHOOK_SECRET"] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "is required in production",
        });
      }
    }
  }
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function validateEnvironment(
  configuration: Record<string, unknown>,
): ApiEnvironment {
  const result = apiEnvironmentSchema.safeParse(configuration);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => {
    const variable = issue.path.join(".") || "environment";
    return `${variable}: ${issue.message}`;
  });

  throw new Error(`Invalid API environment: ${issues.join("; ")}`);
}
