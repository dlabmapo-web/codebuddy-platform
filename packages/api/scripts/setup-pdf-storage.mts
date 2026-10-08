import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error('Supabase configuration required');
if (
  process.env.NODE_ENV === 'production' &&
  !process.argv.includes('--production')
)
  throw new Error('Production requires --production');
const client = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const options = {
  public: false,
  fileSizeLimit: 95_000_000,
  allowedMimeTypes: ['application/pdf'],
};
const existing = await client.storage.getBucket('course-documents');
let result = existing.data
  ? await client.storage.updateBucket('course-documents', options)
  : await client.storage.createBucket('course-documents', options);
if (
  result.error &&
  process.env.NODE_ENV !== 'production' &&
  new URL(url).hostname === 'lnrmxjxsjxymgphgatwn.supabase.co' &&
  process.argv.includes('--development-50mb')
) {
  options.fileSizeLimit = 50_000_000;
  result = existing.data
    ? await client.storage.updateBucket('course-documents', options)
    : await client.storage.createBucket('course-documents', options);
  console.log(
    'Development project storage ceiling is 50 MB; using 50 MB for localhost. Production must allow 95 MB.',
  );
}
if (result.error) throw new Error(result.error.message);
console.log('Private course-documents bucket configured for PDFs.');
