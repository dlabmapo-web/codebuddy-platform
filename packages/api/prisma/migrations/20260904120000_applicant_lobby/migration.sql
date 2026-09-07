-- The applicant lobby: somebody waiting for approval waits inside the academy
-- rather than on a card outside it, and is told the decision by a bell.
--
-- Both columns are additive and defaulted or nullable, so the image running
-- before this migration is still correct against the schema after it. That
-- matters here specifically: `deploy.sh` applies migrations ahead of the new
-- containers and a failed release puts the previous images back without
-- reversing them.

-- What a signup asked to be. A presentation hint that chooses which empty
-- navigation the lobby shows; never an authorization input. See the comment on
-- `JoinRequestKind` in schema.prisma.
CREATE TYPE "JoinRequestKind" AS ENUM ('STUDENT', 'STAFF');

ALTER TABLE "academy_join_requests"
    ADD COLUMN "requested_kind" "JoinRequestKind" NOT NULL DEFAULT 'STUDENT',
    ADD COLUMN "acknowledged_at" TIMESTAMPTZ(6);

-- No index is added. The bell reads "my own decisions", which
-- `academy_join_requests(user_id, status)` already serves — a person holds one
-- or two applications, ever.
