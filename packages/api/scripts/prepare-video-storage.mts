import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Development storage only");
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const existing = await client.storage.getBucket("course-videos");
if (existing.data) {
  if (existing.data.public) throw new Error("Video bucket must be private");
  console.log("Private development video bucket already exists.");
} else {
  const { error } = await client.storage.createBucket("course-videos", {
    public: false,
    fileSizeLimit: 50000000,
    allowedMimeTypes: [
      "application/octet-stream",
      "video/mp4",
      "video/mp2t",
      "application/vnd.apple.mpegurl",
      "text/vtt",
      "image/jpeg",
    ],
  });
  if (error)
    throw new Error("Could not create private development video bucket");
  console.log("Private development video bucket created with a 50 MB ceiling.");
}
