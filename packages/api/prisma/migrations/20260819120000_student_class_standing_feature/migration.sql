-- Class standing is a per-academy opt-in, not a platform default.
-- See §9.7 of the student academy overview design.
ALTER TYPE "AcademyFeature" ADD VALUE IF NOT EXISTS 'STUDENT_CLASS_STANDING';
