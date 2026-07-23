-- CreateEnum
CREATE TYPE "OAuthOnboardingIntentStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "oauth_onboarding_intents" (
  "id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "academy_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "OAuthOnboardingIntentStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "consumed_by_auth_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "oauth_onboarding_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_onboarding_intents_token_hash_key"
ON "oauth_onboarding_intents"("token_hash");

CREATE INDEX "oauth_onboarding_intents_status_expires_at_idx"
ON "oauth_onboarding_intents"("status", "expires_at");

CREATE INDEX "oauth_onboarding_intents_academy_id_created_at_idx"
ON "oauth_onboarding_intents"("academy_id", "created_at");

-- AddForeignKey
ALTER TABLE "oauth_onboarding_intents"
ADD CONSTRAINT "oauth_onboarding_intents_academy_id_fkey"
FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
