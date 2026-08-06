-- Sign-in username. One nullable column and its unique index.
--
-- Nullable because an OAuth account never passes through the signup form and
-- signs in through its provider, and because accounts that predate this column
-- keep signing in with their email until they claim a name.
--
-- The check constraint repeats `usernameSchema` from @cove/shared. It is not
-- redundant: the column is written from a Supabase user_metadata claim, which
-- is client-writable, so the database is the last place that can refuse a name
-- that never passed application validation.

ALTER TABLE "users" ADD COLUMN "username" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9][a-z0-9_.-]{3,28}[a-z0-9]$');

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
