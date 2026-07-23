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
  DATABASE_URL: postgresUrlSchema,
  DIRECT_URL: postgresUrlSchema,
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && !environment.BFF_SHARED_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["BFF_SHARED_SECRET"],
      message: "is required in production",
    });
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
