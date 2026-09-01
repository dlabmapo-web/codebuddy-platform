-- The platform people directory reads one role across every academy — "every
-- teacher on Cove" — which none of the existing indexes can serve: all five
-- lead with academy_id, because until now every read in the product was
-- already inside one academy.
--
-- Built plainly rather than CONCURRENTLY, matching every other index here.
-- CONCURRENTLY cannot run inside a transaction block, and the lock it avoids
-- is not one this table has: academy_memberships holds one row per person per
-- academy, so the build is milliseconds. Revisit if that stops being true.
CREATE INDEX "academy_memberships_role_status_idx"
    ON "academy_memberships"("role", "status");
