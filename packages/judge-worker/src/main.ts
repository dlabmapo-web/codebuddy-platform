import { config } from "dotenv";

/**
 * The judge is a first-class workspace package and deployment target.
 *
 * Its implementation stays beside the API's queue producer and generated
 * Prisma client so queue names and database types cannot drift. The worker
 * package compiler follows this import into its own `dist`, producing a
 * self-contained process artifact without booting the Nest HTTP application.
 */
config({ path: "../api/.env", quiet: true });
await import("../../api/src/judge/judge.main.js");
