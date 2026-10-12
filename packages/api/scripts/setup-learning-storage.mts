import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--production"))
  throw new Error("Learning storage rollout requires explicit --production");
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret)
  throw new Error("Server-side Supabase configuration required");
const client = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const buckets = [
  { name: "course-documents", limit: 95_000_000, mime: ["application/pdf"] },
];
if (
  [
    "GUI_ENABLED",
    "SHORT_ANSWER_ENABLED",
    "MULTIPLE_CHOICE_ENABLED",
    "VIDEO_LESSONS_ENABLED",
  ].some((key) => process.env[key] === "true")
)
  buckets.push({
    name: "turtle-assets",
    limit: 5_242_880,
    mime: [
      "image/gif",
      "image/png",
      "image/jpeg",
      "text/plain",
      "application/json",
    ],
  });
if (process.env.VIDEO_LESSONS_ENABLED === "true") {
  const limit = Number(process.env.VIDEO_MAX_UPLOAD_BYTES ?? 5_000_000_000);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5_000_000_000)
    throw new Error(
      "VIDEO_MAX_UPLOAD_BYTES must be between 1 and 5,000,000,000",
    );
  buckets.push({
    name: "course-videos",
    limit,
    mime: [
      "application/octet-stream",
      "video/mp4",
      "video/mp2t",
      "application/vnd.apple.mpegurl",
      "text/vtt",
      "image/jpeg",
    ],
  });
}
for (const { name, limit, mime } of buckets) {
  const { data, error: lookupError } = await client.storage.getBucket(name);
  if (lookupError && lookupError.statusCode !== "404")
    throw new Error(
      `${name}: could not inspect private storage (${lookupError.statusCode ?? "unknown"})`,
    );
  if (data?.public)
    throw new Error(`${name}: refusing to adopt a public bucket`);
  const options = {
    public: false,
    fileSizeLimit: limit,
    allowedMimeTypes: mime,
  };
  const { error } = data
    ? await client.storage.updateBucket(name, options)
    : await client.storage.createBucket(name, options);
  if (error)
    throw new Error(
      `${name}: storage setup failed (${error.statusCode ?? "unknown"}); verify the project global upload ceiling and server permissions`,
    );
  console.log(`${name}: private storage configured, ${limit} byte ceiling`);
}
