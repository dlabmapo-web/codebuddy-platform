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
  /** Pinned, and shared with the browser so run and submit agree. */
  PYODIDE_VERSION: z.string().default("0.27.5"),
  SUBMISSION_RATE_LIMIT: z.coerce.number().int().min(1).max(120).default(10),
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
