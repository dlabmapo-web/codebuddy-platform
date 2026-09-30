-- Public sample checks judged by the server (rollout gate).
--
-- Additive: a new feature name only. No row is written, and a feature without
-- a row reads as off, so every existing academy keeps today's behaviour until
-- a manager or operator switches it on.
ALTER TYPE "AcademyFeature" ADD VALUE 'SERVER_SAMPLE_CHECKS';
