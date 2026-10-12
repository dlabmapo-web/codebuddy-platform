import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Local setup is development-only");
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const options = {
  public: false,
  fileSizeLimit: 5242880,
  allowedMimeTypes: [
    "image/gif",
    "image/png",
    "image/jpeg",
    "text/plain",
    "application/json",
  ],
};
const existing = await client.storage.getBucket("turtle-assets");
const result = existing.data
  ? await client.storage.updateBucket("turtle-assets", options)
  : await client.storage.createBucket("turtle-assets", options);
if (result.error) throw new Error("Could not configure private turtle storage");
console.log("Development turtle storage configured: private, 5 MiB per asset.");
