-- AlterTable
ALTER TABLE "content_import_sessions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "media_assets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "staff_academy_profiles" ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "teaching_languages" DROP DEFAULT;

-- AlterTable
ALTER TABLE "student_academy_profiles" ALTER COLUMN "coding_interests" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "student_class_course_learning_days_class_id_local_date_membersh" RENAME TO "student_class_course_learning_days_class_id_local_date_memb_idx";

-- RenameIndex
ALTER INDEX "student_class_course_learning_days_membership_id_class_id_local" RENAME TO "student_class_course_learning_days_membership_id_class_id_l_idx";

-- RenameIndex
ALTER INDEX "student_course_learning_days_membership_id_course_id_local_date" RENAME TO "student_course_learning_days_membership_id_course_id_local__idx";
