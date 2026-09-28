# Cove Studio v2 전체 데이터 사전

소스: `b095b679b0a9f9ed407aa8abd42c32bf413cca72`의 `packages/api/prisma/schema.prisma`. 관계 접근자는 Prisma 탐색 속성이며 물리 열이 아닙니다. SQL 마이그레이션은 추가 CHECK 제약과 부분 인덱스를 정의합니다.

## User

실제 테이블: `users`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| authUserId | String? | @unique @map("auth_user_id") @db.Uuid |
| email | String? | @unique |
| username | String? | @unique |
| displayName | String? | @map("display_name") |
| avatarUrl | String? | @map("avatar_url") |
| avatarAssetId | String? | @map("avatar_asset_id") @db.Uuid |
| contactPhone | String? | @map("contact_phone") |
| preferredLocale | String | @default("ko") @map("preferred_locale") |
| timezone | String? |  |
| emailIsPlaceholder | Boolean | @default(false) @map("email_is_placeholder") |
| platformRole | PlatformRole | @default(USER) @map("platform_role") |
| status | UserStatus | @default(PENDING_PROFILE) |
| legacyUserId | String? | @unique @map("legacy_user_id") |
| legacyUsername | String? | @unique @map("legacy_username") |
| legacyPasswordHash | String? | @map("legacy_password_hash") |
| migratedAt | DateTime? | @map("migrated_at") @db.Timestamptz(6) |
| lastSignInAt | DateTime? | @map("last_sign_in_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| memberships | AcademyMembership[] |  |
| issuedCredential | StudentIssuedCredential? | @relation("IssuedCredentialHolder") |
| credentialsIssued | StudentIssuedCredential[] | @relation("IssuedCredentialIssuer") |
| membershipRolesGranted | AcademyMembershipRole[] | @relation("MembershipRoleGranter") |
| invitationsCreated | AcademyInvitation[] | @relation("InvitationCreator") |
| invitationsAccepted | AcademyInvitation[] | @relation("InvitationAcceptor") |
| joinRequests | AcademyJoinRequest[] | @relation("JoinRequester") |
| joinRequestsReviewed | AcademyJoinRequest[] | @relation("JoinReviewer") |
| membershipInvitations | AcademyMembership[] | @relation("MembershipInviter") |
| membershipApprovals | AcademyMembership[] | @relation("MembershipApprover") |
| auditLogs | AuditLog[] | @relation("AuditActor") |
| coursesCreated | Course[] | @relation("CourseCreator") |
| classesCreated | Class[] | @relation("ClassCreator") |
| classCoursesAssigned | ClassCourse[] | @relation("ClassCourseAssigner") |
| classEnrollmentsMade | ClassEnrollment[] | @relation("ClassEnroller") |
| exerciseDrafts | ExerciseDraft[] |  |
| submissions | Submission[] |  |
| exerciseProgress | StudentExerciseProgress[] |  |
| solveSessions | ExerciseSolveSession[] |  |
| avatarAsset | MediaAsset? | @relation("UserAvatar", fields: [avatarAssetId], references: [id], onDelete: SetNull) |
| mediaUploaded | MediaAsset[] | @relation("MediaUploader") |
| peopleImports | PeopleImportSession[] | @relation("PeopleImportActor") |
| contentImports | ContentImportSession[] | @relation("ContentImportActor") |
| peopleBulkOperations | PeopleBulkOperation[] | @relation("PeopleBulkActor") |
| academiesCreated | Academy[] | @relation("AcademyCreator") |
| supportGrants | PlatformSupportGrant[] | @relation("SupportGrantAdmin") |
| supportGrantsRevoked | PlatformSupportGrant[] | @relation("SupportGrantRevoker") |
| operationRuns | PlatformOperationRun[] | @relation("OperationRunActor") |

제약: `@@index([status])`; `@@map("users")`

## MediaAsset

실제 테이블: `media_assets`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| bucket | String |  |
| objectKey | String | @unique @map("object_key") |
| purpose | MediaAssetPurpose |  |
| uploaderUserId | String | @map("uploader_user_id") @db.Uuid |
| contentType | String | @map("content_type") |
| sizeBytes | Int | @map("size_bytes") |
| width | Int |  |
| height | Int |  |
| checksumSha256 | String | @map("checksum_sha256") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| supersededAt | DateTime? | @map("superseded_at") @db.Timestamptz(6) |
| deletedAt | DateTime? | @map("deleted_at") @db.Timestamptz(6) |
| uploader | User | @relation("MediaUploader", fields: [uploaderUserId], references: [id], onDelete: Restrict) |
| userAvatars | User[] | @relation("UserAvatar") |
| memberAvatars | AcademyMemberProfile[] | @relation("AcademyMemberAvatar") |
| academyMedia | AcademyMedia[] | @relation("AcademyMedia") |

제약: `@@index([supersededAt, createdAt])`; `@@index([purpose, createdAt])`; `@@map("media_assets")`

## AcademyMemberProfile

실제 테이블: `academy_member_profiles`

| 필드 | 타입 | 정의 |
|---|---|---|
| membershipId | String | @id @map("membership_id") @db.Uuid |
| academyDisplayName | String? | @map("academy_display_name") |
| avatarAssetId | String? | @map("avatar_asset_id") @db.Uuid |
| contactPhone | String? | @map("contact_phone") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| avatarAsset | MediaAsset? | @relation("AcademyMemberAvatar", fields: [avatarAssetId], references: [id], onDelete: SetNull) |

제약: `@@map("academy_member_profiles")`

## StudentAcademyProfile

실제 테이블: `student_academy_profiles`

| 필드 | 타입 | 정의 |
|---|---|---|
| membershipId | String | @id @map("membership_id") @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| dateOfBirth | DateTime? | @map("date_of_birth") @db.Date |
| schoolName | String? | @map("school_name") |
| schoolGrade | String? | @map("school_grade") |
| guardianName | String? | @map("guardian_name") |
| guardianRelationship | GuardianRelationship? | @map("guardian_relationship") |
| guardianPhone | String? | @map("guardian_phone") |
| emergencyContactName | String? | @map("emergency_contact_name") |
| emergencyContactPhone | String? | @map("emergency_contact_phone") |
| codingInterests | String[] | @map("coding_interests") |
| learningGoal | String? | @map("learning_goal") |
| studentNumber | String? | @map("student_number") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |

제약: `@@unique([academyId, studentNumber])`; `@@map("student_academy_profiles")`

## StaffAcademyProfile

실제 테이블: `staff_academy_profiles`

| 필드 | 타입 | 정의 |
|---|---|---|
| membershipId | String | @id @map("membership_id") @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| bio | String? |  |
| specialties | String[] |  |
| teachingLanguages | String[] | @map("teaching_languages") |
| academyTitle | String? | @map("academy_title") |
| employeeNumber | String? | @map("employee_number") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |

제약: `@@unique([academyId, employeeNumber])`; `@@map("staff_academy_profiles")`

## Organization

실제 테이블: `organizations`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| name | String |  |
| slug | String | @unique |
| status | OrganizationStatus | @default(ACTIVE) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academies | Academy[] |  |

제약: `@@map("organizations")`

## Academy

실제 테이블: `academies`

| 필드 | 타입 | 정의 |
|---|---|---|
| helpRequests | StudentHelpRequest[] |  |
| id | String | @id @default(uuid()) @db.Uuid |
| organizationId | String | @map("organization_id") @db.Uuid |
| name | String |  |
| slug | String |  |
| status | AcademyStatus | @default(ACTIVE) |
| kind | AcademyKind | @default(ACADEMY) |
| addressLine1 | String? | @map("address_line1") |
| addressLine2 | String? | @map("address_line2") |
| locality | String? |  |
| region | String? |  |
| postalCode | String? | @map("postal_code") |
| countryCode | String? | @map("country_code") @db.Char(2) |
| contactPhone | String? | @map("contact_phone") |
| contactEmail | String? | @map("contact_email") |
| timeZone | String | @default("Asia/Seoul") @map("time_zone") |
| profileUpdatedAt | DateTime? | @map("profile_updated_at") @db.Timestamptz(6) |
| statusChangedAt | DateTime? | @map("status_changed_at") @db.Timestamptz(6) |
| createdByUserId | String? | @map("created_by_user_id") @db.Uuid |
| peopleRevision | Int | @default(0) @map("people_revision") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| organization | Organization | @relation(fields: [organizationId], references: [id], onDelete: Restrict) |
| createdBy | User? | @relation("AcademyCreator", fields: [createdByUserId], references: [id], onDelete: SetNull) |
| memberships | AcademyMembership[] |  |
| slugHistory | AcademySlugHistory[] |  |
| invitations | AcademyInvitation[] |  |
| joinRequests | AcademyJoinRequest[] |  |
| oauthOnboardingIntents | OAuthOnboardingIntent[] |  |
| auditLogs | AuditLog[] |  |
| courses | Course[] |  |
| classes | Class[] |  |
| featureFlags | AcademyFeatureFlag[] |  |
| monitoringVisits | TeacherMonitoringVisit[] |  |
| teacherFeedback | TeacherFeedback[] |  |
| learningDays | StudentCourseLearningDay[] |  |
| classLearningDays | StudentClassCourseLearningDay[] |  |
| media | AcademyMedia[] |  |
| importSessions | PeopleImportSession[] |  |
| contentImportSessions | ContentImportSession[] |  |
| bulkOperations | PeopleBulkOperation[] |  |
| pointAwards | PointAward[] |  |
| pointPolicy | AcademyPointPolicy? |  |
| supportGrants | PlatformSupportGrant[] |  |
| issuedCredentials | StudentIssuedCredential[] |  |
| operationRuns | PlatformOperationRun[] |  |

제약: `@@unique([organizationId, slug])`; `@@index([organizationId, status])`; `@@index([status, createdAt(sort: Desc)])`; `@@map("academies")`

## AcademyFeatureFlag

실제 테이블: `academy_feature_flags`

| 필드 | 타입 | 정의 |
|---|---|---|
| academyId | String | @map("academy_id") @db.Uuid |
| feature | AcademyFeature |  |
| isEnabled | Boolean | @default(false) @map("is_enabled") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |

제약: `@@id([academyId, feature])`; `@@map("academy_feature_flags")`

## OAuthOnboardingIntent

실제 테이블: `oauth_onboarding_intents`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| tokenHash | String | @unique @map("token_hash") |
| academyId | String | @map("academy_id") @db.Uuid |
| provider | String |  |
| status | OAuthOnboardingIntentStatus | @default(PENDING) |
| expiresAt | DateTime | @map("expires_at") @db.Timestamptz(6) |
| consumedAt | DateTime? | @map("consumed_at") @db.Timestamptz(6) |
| consumedByAuthUserId | String? | @map("consumed_by_auth_user_id") @db.Uuid |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |

제약: `@@index([status, expiresAt])`; `@@index([academyId, createdAt])`; `@@map("oauth_onboarding_intents")`

## AcademySlugHistory

실제 테이블: `academy_slug_history`

| 필드 | 타입 | 정의 |
|---|---|---|
| slug | String | @id |
| academyId | String | @map("academy_id") @db.Uuid |
| retiredAt | DateTime | @default(now()) @map("retired_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |

제약: `@@index([academyId])`; `@@map("academy_slug_history")`

## AcademyMembership

실제 테이블: `academy_memberships`

| 필드 | 타입 | 정의 |
|---|---|---|
| helpRequestsAsStudent | StudentHelpRequest[] | @relation("HelpRequestStudent") |
| helpRequestsAsTeacher | StudentHelpRequest[] | @relation("HelpRequestTeacher") |
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| role | AcademyRole |  |
| status | MembershipStatus | @default(INVITED) |
| invitedByUserId | String? | @map("invited_by_user_id") @db.Uuid |
| approvedByUserId | String? | @map("approved_by_user_id") @db.Uuid |
| joinedAt | DateTime? | @map("joined_at") @db.Timestamptz(6) |
| suspendedAt | DateTime? | @map("suspended_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| extraRoles | AcademyMembershipRole[] |  |
| invitedBy | User? | @relation("MembershipInviter", fields: [invitedByUserId], references: [id], onDelete: SetNull) |
| approvedBy | User? | @relation("MembershipApprover", fields: [approvedByUserId], references: [id], onDelete: SetNull) |
| classEnrollments | ClassEnrollment[] |  |
| assignedClasses | Class[] | @relation("ClassTeacher") |
| assistedClasses | ClassAssistantTeacher[] | @relation("ClassAssistantTeacher") |
| monitoringVisitsAsTeacher | TeacherMonitoringVisit[] | @relation("MonitoringVisitTeacher") |
| monitoringVisitsAsStudent | TeacherMonitoringVisit[] | @relation("MonitoringVisitStudent") |
| feedbackAuthored | TeacherFeedback[] | @relation("TeacherFeedbackAuthor") |
| feedbackReceived | TeacherFeedback[] | @relation("TeacherFeedbackRecipient") |
| learningDays | StudentCourseLearningDay[] |  |
| classLearningDays | StudentClassCourseLearningDay[] |  |
| pointAwards | PointAward[] |  |
| pointBalance | StudentPointBalance? |  |
| memberProfile | AcademyMemberProfile? |  |
| studentProfile | StudentAcademyProfile? |  |
| staffProfile | StaffAcademyProfile? |  |

제약: `@@unique([academyId, userId])`; `@@index([userId, status])`; `@@index([academyId, role, status])`; `@@index([academyId, updatedAt(sort: Desc), id], map: "academy_memberships_academy_updated_idx")`; `@@index([academyId, role, status, joinedAt], map: "academy_memberships_academy_joined_idx")`; `@@index([role, status], map: "academy_memberships_role_status_idx")`; `@@map("academy_memberships")`

## AcademyMembershipRole

실제 테이블: `academy_membership_roles`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| role | AcademyRole |  |
| grantedByUserId | String? | @map("granted_by_user_id") @db.Uuid |
| grantedAt | DateTime | @default(now()) @map("granted_at") @db.Timestamptz(6) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| grantedBy | User? | @relation("MembershipRoleGranter", fields: [grantedByUserId], references: [id], onDelete: SetNull) |

제약: `@@unique([membershipId, role])`; `@@index([membershipId])`; `@@map("academy_membership_roles")`

## StudentIssuedCredential

실제 테이블: `student_issued_credentials`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| userId | String | @unique @map("user_id") @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| ciphertext | Bytes |  |
| iv | Bytes |  |
| authTag | Bytes | @map("auth_tag") |
| keyVersion | Int | @default(1) @map("key_version") |
| visiblePrefix | String | @map("visible_prefix") |
| length | Int |  |
| issuedByUserId | String | @map("issued_by_user_id") @db.Uuid |
| issuedAt | DateTime | @default(now()) @map("issued_at") @db.Timestamptz(6) |
| revealCount | Int | @default(0) @map("reveal_count") |
| lastRevealedAt | DateTime? | @map("last_revealed_at") @db.Timestamptz(6) |
| user | User | @relation("IssuedCredentialHolder", fields: [userId], references: [id], onDelete: Cascade) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| issuedBy | User | @relation("IssuedCredentialIssuer", fields: [issuedByUserId], references: [id], onDelete: Restrict) |

제약: `@@index([academyId])`; `@@map("student_issued_credentials")`

## AcademyInvitation

실제 테이블: `academy_invitations`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| email | String |  |
| role | AcademyRole |  |
| tokenHash | String | @unique @map("token_hash") |
| displayNameHint | String? | @map("display_name_hint") |
| status | InvitationStatus | @default(PENDING) |
| expiresAt | DateTime | @map("expires_at") @db.Timestamptz(6) |
| invitedByUserId | String | @map("invited_by_user_id") @db.Uuid |
| acceptedByUserId | String? | @map("accepted_by_user_id") @db.Uuid |
| acceptedAt | DateTime? | @map("accepted_at") @db.Timestamptz(6) |
| revokedAt | DateTime? | @map("revoked_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| invitedBy | User | @relation("InvitationCreator", fields: [invitedByUserId], references: [id], onDelete: Restrict) |
| acceptedBy | User? | @relation("InvitationAcceptor", fields: [acceptedByUserId], references: [id], onDelete: SetNull) |
| deliveryAttempts | InvitationDeliveryAttempt[] |  |

제약: `@@index([academyId, email, status])`; `@@index([expiresAt, status])`; `@@map("academy_invitations")`

## AcademyMedia

실제 테이블: `academy_media`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| assetId | String | @map("asset_id") @db.Uuid |
| kind | AcademyMediaKind |  |
| position | Int | @default(0) |
| altText | String? | @map("alt_text") |
| isDecorative | Boolean | @default(false) @map("is_decorative") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| asset | MediaAsset | @relation("AcademyMedia", fields: [assetId], references: [id], onDelete: Restrict) |

제약: `@@index([academyId, kind, position])`; `@@map("academy_media")`

## PeopleImportSession

실제 테이블: `people_import_sessions`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| actorUserId | String | @map("actor_user_id") @db.Uuid |
| originalFilename | String | @map("original_filename") |
| checksumSha256 | String | @map("checksum_sha256") |
| status | PeopleImportStatus | @default(PREVIEW_READY) |
| totalRows | Int | @map("total_rows") |
| readyRows | Int | @map("ready_rows") |
| warningRows | Int | @map("warning_rows") |
| errorRows | Int | @map("error_rows") |
| preview | Json |  |
| capturedPeopleRevision | Int | @map("captured_people_revision") |
| expiresAt | DateTime | @map("expires_at") @db.Timestamptz(6) |
| idempotencyKey | String | @map("idempotency_key") |
| committedAt | DateTime? | @map("committed_at") @db.Timestamptz(6) |
| result | Json? |  |
| failureCode | String? | @map("failure_code") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| actor | User | @relation("PeopleImportActor", fields: [actorUserId], references: [id], onDelete: Restrict) |

제약: `@@unique([academyId, idempotencyKey])`; `@@index([academyId, status, createdAt])`; `@@index([expiresAt])`; `@@map("people_import_sessions")`

## ContentImportSession

실제 테이블: `content_import_sessions`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| actorUserId | String | @map("actor_user_id") @db.Uuid |
| originalFilename | String | @map("original_filename") |
| checksumSha256 | String | @map("checksum_sha256") |
| templateVersion | Int | @map("template_version") |
| status | ContentImportStatus | @default(PREVIEW_READY) |
| createCount | Int | @map("create_count") |
| updateCount | Int | @map("update_count") |
| unchangedCount | Int | @map("unchanged_count") |
| warningCount | Int | @map("warning_count") |
| conflictCount | Int | @map("conflict_count") |
| errorCount | Int | @map("error_count") |
| plan | Json |  |
| capturedContentRevision | Int | @map("captured_content_revision") |
| expiresAt | DateTime | @map("expires_at") @db.Timestamptz(6) |
| idempotencyKey | String | @map("idempotency_key") |
| committedAt | DateTime? | @map("committed_at") @db.Timestamptz(6) |
| result | Json? |  |
| failureCode | String? | @map("failure_code") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Cascade) |
| actor | User | @relation("ContentImportActor", fields: [actorUserId], references: [id], onDelete: Restrict) |

제약: `@@unique([courseId, idempotencyKey])`; `@@index([academyId, courseId, status, createdAt])`; `@@index([expiresAt])`; `@@map("content_import_sessions")`

## PeopleBulkOperation

실제 테이블: `people_bulk_operations`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| actorUserId | String | @map("actor_user_id") @db.Uuid |
| kind | PeopleBulkKind |  |
| selection | Json |  |
| requestedCount | Int | @map("requested_count") |
| succeededCount | Int | @default(0) @map("succeeded_count") |
| failedCount | Int | @default(0) @map("failed_count") |
| status | PeopleBulkStatus | @default(PENDING) |
| idempotencyKey | String | @map("idempotency_key") |
| result | Json? |  |
| failureCode | String? | @map("failure_code") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| actor | User | @relation("PeopleBulkActor", fields: [actorUserId], references: [id], onDelete: Restrict) |

제약: `@@unique([academyId, kind, idempotencyKey])`; `@@index([academyId, createdAt])`; `@@map("people_bulk_operations")`

## InvitationDeliveryAttempt

실제 테이블: `invitation_delivery_attempts`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| invitationId | String | @map("invitation_id") @db.Uuid |
| attemptNumber | Int | @map("attempt_number") |
| providerMessageId | String? | @map("provider_message_id") |
| state | InvitationDeliveryState | @default(QUEUED) |
| failureCode | String? | @map("failure_code") |
| queuedAt | DateTime | @default(now()) @map("queued_at") @db.Timestamptz(6) |
| sentAt | DateTime? | @map("sent_at") @db.Timestamptz(6) |
| deliveredAt | DateTime? | @map("delivered_at") @db.Timestamptz(6) |
| failedAt | DateTime? | @map("failed_at") @db.Timestamptz(6) |
| lastEventKey | String? | @unique @map("last_event_key") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| invitation | AcademyInvitation | @relation(fields: [invitationId], references: [id], onDelete: Cascade) |

제약: `@@unique([invitationId, attemptNumber])`; `@@index([state, queuedAt])`; `@@index([providerMessageId])`; `@@map("invitation_delivery_attempts")`

## AcademyJoinRequest

실제 테이블: `academy_join_requests`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| message | String? |  |
| status | JoinRequestStatus | @default(PENDING) |
| requestedKind | JoinRequestKind | @default(STUDENT) @map("requested_kind") |
| approvedRole | AcademyRole? | @map("approved_role") |
| acknowledgedAt | DateTime? | @map("acknowledged_at") @db.Timestamptz(6) |
| reviewedByUserId | String? | @map("reviewed_by_user_id") @db.Uuid |
| reviewedAt | DateTime? | @map("reviewed_at") @db.Timestamptz(6) |
| reviewReason | String? | @map("review_reason") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| user | User | @relation("JoinRequester", fields: [userId], references: [id], onDelete: Cascade) |
| reviewedBy | User? | @relation("JoinReviewer", fields: [reviewedByUserId], references: [id], onDelete: SetNull) |

제약: `@@index([academyId, status, createdAt])`; `@@index([userId, status])`; `@@map("academy_join_requests")`

## AuditLog

실제 테이블: `audit_logs`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| actorUserId | String? | @map("actor_user_id") @db.Uuid |
| academyId | String? | @map("academy_id") @db.Uuid |
| action | String |  |
| targetType | String | @map("target_type") |
| targetId | String? | @map("target_id") |
| before | Json? |  |
| after | Json? |  |
| requestId | String? | @map("request_id") |
| ipAddress | String? | @map("ip_address") |
| userAgent | String? | @map("user_agent") |
| reason | String? |  |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| supportGrantId | String? | @map("support_grant_id") @db.Uuid |
| actor | User? | @relation("AuditActor", fields: [actorUserId], references: [id], onDelete: SetNull) |
| academy | Academy? | @relation(fields: [academyId], references: [id], onDelete: SetNull) |
| supportGrant | PlatformSupportGrant? | @relation(fields: [supportGrantId], references: [id], onDelete: SetNull) |

제약: `@@index([supportGrantId, createdAt])`; `@@index([actorUserId, createdAt])`; `@@index([academyId, createdAt])`; `@@index([targetType, targetId])`; `@@map("audit_logs")`

## PlatformSupportGrant

실제 테이블: `platform_support_grants`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| adminUserId | String | @map("admin_user_id") @db.Uuid |
| assumedRole | AcademyRole | @map("assumed_role") |
| readOnly | Boolean | @default(true) @map("read_only") |
| allowMonitoring | Boolean | @default(false) @map("allow_monitoring") |
| reason | String |  |
| startsAt | DateTime | @default(now()) @map("starts_at") @db.Timestamptz(6) |
| expiresAt | DateTime | @map("expires_at") @db.Timestamptz(6) |
| revokedAt | DateTime? | @map("revoked_at") @db.Timestamptz(6) |
| revokedByUserId | String? | @map("revoked_by_user_id") @db.Uuid |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| admin | User | @relation("SupportGrantAdmin", fields: [adminUserId], references: [id], onDelete: Restrict) |
| revokedBy | User? | @relation("SupportGrantRevoker", fields: [revokedByUserId], references: [id], onDelete: SetNull) |
| auditLogs | AuditLog[] |  |

제약: `@@index([academyId, adminUserId, expiresAt])`; `@@index([adminUserId, createdAt(sort: Desc)])`; `@@map("platform_support_grants")`

## PlatformOperationRun

실제 테이블: `platform_operation_runs`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| operation | PlatformOperation |  |
| targetType | String | @map("target_type") |
| targetId | String | @map("target_id") |
| actorUserId | String | @map("actor_user_id") @db.Uuid |
| requestId | String? | @map("request_id") |
| supportGrantId | String? | @map("support_grant_id") @db.Uuid |
| status | PlatformOperationStatus | @default(PLANNING) |
| plannedCount | Int | @default(0) @map("planned_count") |
| studentCount | Int | @default(0) @map("student_count") |
| dispatchedCount | Int | @default(0) @map("dispatched_count") |
| completedCount | Int | @default(0) @map("completed_count") |
| failedCount | Int | @default(0) @map("failed_count") |
| failureReason | String? | @map("failure_reason") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| startedAt | DateTime? | @map("started_at") @db.Timestamptz(6) |
| finishedAt | DateTime? | @map("finished_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| actor | User | @relation("OperationRunActor", fields: [actorUserId], references: [id], onDelete: Restrict) |
| submissions | Submission[] |  |

제약: `@@index([academyId, createdAt(sort: Desc)])`; `@@index([createdAt(sort: Desc)])`; `@@map("platform_operation_runs")`

## Course

실제 테이블: `courses`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| title | String |  |
| description | String | @default("") |
| isVisible | Boolean | @default(false) @map("is_visible") |
| contentRevision | Int | @default(1) @map("content_revision") |
| sourceCourseId | String? | @map("source_course_id") @db.Uuid |
| sourceContentRevision | Int? | @map("source_content_revision") |
| baselineRevision | Int? | @map("baseline_revision") |
| retiredAt | DateTime? | @map("retired_at") @db.Timestamptz(6) |
| createdByUserId | String | @map("created_by_user_id") @db.Uuid |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Restrict) |
| createdBy | User | @relation("CourseCreator", fields: [createdByUserId], references: [id], onDelete: Restrict) |
| sourceCourse | Course? | @relation("CourseSource", fields: [sourceCourseId], references: [id], onDelete: Restrict) |
| copies | Course[] | @relation("CourseSource") |
| modules | CourseModule[] |  |
| exerciseDrafts | ExerciseDraft[] |  |
| submissions | Submission[] |  |
| classAssignments | ClassCourse[] |  |
| learningDays | StudentCourseLearningDay[] |  |
| classLearningDays | StudentClassCourseLearningDay[] |  |
| importSessions | ContentImportSession[] |  |

제약: `@@index([academyId, isVisible, updatedAt])`; `@@index([sourceCourseId])`; `@@map("courses")`

## Class

실제 테이블: `classes`

| 필드 | 타입 | 정의 |
|---|---|---|
| helpRequests | StudentHelpRequest[] |  |
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| name | String |  |
| description | String | @default("") |
| status | ClassStatus | @default(ACTIVE) |
| createdByUserId | String | @map("created_by_user_id") @db.Uuid |
| teacherMembershipId | String? | @map("teacher_membership_id") @db.Uuid |
| archivedAt | DateTime? | @map("archived_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Restrict) |
| createdBy | User | @relation("ClassCreator", fields: [createdByUserId], references: [id], onDelete: Restrict) |
| assignedTeacher | AcademyMembership? | @relation("ClassTeacher", fields: [teacherMembershipId], references: [id], onDelete: SetNull) |
| assistantTeachers | ClassAssistantTeacher[] |  |
| courseAssignments | ClassCourse[] |  |
| enrollments | ClassEnrollment[] |  |
| scheduleSlots | ClassScheduleSlot[] |  |
| monitoringVisits | TeacherMonitoringVisit[] |  |
| teacherFeedback | TeacherFeedback[] |  |
| submissions | Submission[] |  |
| solveSessions | ExerciseSolveSession[] |  |
| learningDays | StudentClassCourseLearningDay[] |  |
| pointAwards | PointAward[] |  |

제약: `@@index([academyId, status, updatedAt(sort: Desc)])`; `@@index([academyId, name])`; `@@index([teacherMembershipId, status])`; `@@map("classes")`

## ClassAssistantTeacher

실제 테이블: `class_assistant_teachers`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| teacher | AcademyMembership | @relation("ClassAssistantTeacher", fields: [membershipId], references: [id], onDelete: Cascade) |

제약: `@@unique([classId, membershipId])`; `@@index([membershipId])`; `@@map("class_assistant_teachers")`

## ClassCourse

실제 테이블: `class_courses`

| 필드 | 타입 | 정의 |
|---|---|---|
| classId | String | @map("class_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| assignedByUserId | String | @map("assigned_by_user_id") @db.Uuid |
| assignedAt | DateTime | @default(now()) @map("assigned_at") @db.Timestamptz(6) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Cascade) |
| assignedBy | User | @relation("ClassCourseAssigner", fields: [assignedByUserId], references: [id], onDelete: Restrict) |

제약: `@@id([classId, courseId])`; `@@index([courseId, classId])`; `@@map("class_courses")`

## ClassEnrollment

실제 테이블: `class_enrollments`

| 필드 | 타입 | 정의 |
|---|---|---|
| classId | String | @map("class_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| enrolledByUserId | String | @map("enrolled_by_user_id") @db.Uuid |
| enrolledAt | DateTime | @default(now()) @map("enrolled_at") @db.Timestamptz(6) |
| lastLearningSeenAt | DateTime? | @map("last_learning_seen_at") @db.Timestamptz(6) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| enrolledBy | User | @relation("ClassEnroller", fields: [enrolledByUserId], references: [id], onDelete: Restrict) |

제약: `@@id([classId, membershipId])`; `@@index([membershipId, classId])`; `@@map("class_enrollments")`

## CourseModule

실제 테이블: `course_modules`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| externalKey | String | @map("external_key") |
| title | String |  |
| description | String | @default("") |
| position | Int |  |
| isVisible | Boolean | @default(false) @map("is_visible") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Cascade) |
| lectures | Lecture[] |  |

제약: `@@unique([courseId, position])`; `@@unique([courseId, externalKey])`; `@@index([courseId])`; `@@map("course_modules")`

## Lecture

실제 테이블: `lectures`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| courseModuleId | String | @map("course_module_id") @db.Uuid |
| externalKey | String | @map("external_key") |
| title | String |  |
| description | String | @default("") |
| position | Int |  |
| isVisible | Boolean | @default(false) @map("is_visible") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| courseModule | CourseModule | @relation(fields: [courseModuleId], references: [id], onDelete: Cascade) |
| materials | Material[] |  |

제약: `@@unique([courseModuleId, position])`; `@@index([courseModuleId])`; `@@index([externalKey])`; `@@map("lectures")`

## Material

실제 테이블: `materials`

| 필드 | 타입 | 정의 |
|---|---|---|
| helpRequests | StudentHelpRequest[] |  |
| id | String | @id @default(uuid()) @db.Uuid |
| lectureId | String | @map("lecture_id") @db.Uuid |
| type | MaterialType |  |
| title | String |  |
| position | Int |  |
| isRequired | Boolean | @default(true) @map("is_required") |
| isVisible | Boolean | @default(false) @map("is_visible") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| lecture | Lecture | @relation(fields: [lectureId], references: [id], onDelete: Cascade) |
| programmingExercise | ProgrammingExercise? |  |
| drafts | ExerciseDraft[] |  |
| submissions | Submission[] |  |
| progress | StudentExerciseProgress[] |  |
| monitoringVisits | TeacherMonitoringVisit[] |  |
| teacherFeedback | TeacherFeedback[] |  |
| solveSessions | ExerciseSolveSession[] |  |

제약: `@@unique([lectureId, position])`; `@@index([lectureId])`; `@@map("materials")`

## ProgrammingExercise

실제 테이블: `programming_exercises`

| 필드 | 타입 | 정의 |
|---|---|---|
| materialId | String | @id @map("material_id") @db.Uuid |
| externalKey | String | @map("external_key") |
| legacyProblemNo | Int? | @map("legacy_problem_no") |
| difficulty | ExerciseDifficulty |  |
| description | String | @default("") |
| inputFormat | String | @default("") @map("input_format") |
| outputFormat | String | @default("") @map("output_format") |
| constraints | String | @default("") |
| starterCode | String | @default("") @map("starter_code") |
| solutionCode | String? | @map("solution_code") @db.Text |
| language | ExerciseLanguage | @default(PYTHON) |
| timeLimitMs | Int | @default(3000) @map("time_limit_ms") |
| memoryLimitMb | Int | @default(256) @map("memory_limit_mb") |
| aiFeedbackEnabled | Boolean | @default(false) @map("ai_feedback_enabled") |
| gradingRevision | Int | @default(1) @map("grading_revision") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| material | Material | @relation(fields: [materialId], references: [id], onDelete: Cascade) |
| testCases | ExerciseTestCase[] |  |
| hints | ExerciseHint[] |  |

제약: `@@index([externalKey])`; `@@index([legacyProblemNo])`; `@@map("programming_exercises")`

## ExerciseTestCase

실제 테이블: `exercise_test_cases`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| exerciseMaterialId | String | @map("exercise_material_id") @db.Uuid |
| position | Int |  |
| input | String |  |
| expectedOutput | String | @map("expected_output") |
| visibility | TestCaseVisibility |  |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| exercise | ProgrammingExercise | @relation(fields: [exerciseMaterialId], references: [materialId], onDelete: Cascade) |

제약: `@@unique([exerciseMaterialId, position])`; `@@map("exercise_test_cases")`

## ExerciseDraft

실제 테이블: `exercise_drafts`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| materialId | String? | @map("material_id") @db.Uuid |
| sourceMaterialId | String | @map("source_material_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| code | String |  |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| material | Material? | @relation(fields: [materialId], references: [id], onDelete: SetNull) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Restrict) |
| collaborationDocument | ExerciseCollaborationDocument? |  |

제약: `@@unique([userId, materialId])`; `@@index([userId, updatedAt(sort: Desc)])`; `@@map("exercise_drafts")`

## ExerciseCollaborationDocument

실제 테이블: `exercise_collaboration_documents`

| 필드 | 타입 | 정의 |
|---|---|---|
| draftId | String | @id @map("draft_id") @db.Uuid |
| yjsState | Bytes | @map("yjs_state") |
| snapshotVersion | BigInt | @default(0) @map("snapshot_version") |
| codeHash | String | @map("code_hash") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| draft | ExerciseDraft | @relation(fields: [draftId], references: [id], onDelete: Cascade) |

제약: `@@map("exercise_collaboration_documents")`

## Submission

실제 테이블: `submissions`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| materialId | String? | @map("material_id") @db.Uuid |
| sourceMaterialId | String | @map("source_material_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| classId | String? | @map("class_id") @db.Uuid |
| gradingRevision | Int | @map("grading_revision") |
| regradeRunId | String? | @map("regrade_run_id") @db.Uuid |
| language | ExerciseLanguage |  |
| timeLimitMs | Int | @map("time_limit_ms") |
| memoryLimitMb | Int | @map("memory_limit_mb") |
| code | String |  |
| status | SubmissionStatus | @default(QUEUED) |
| passedCount | Int | @default(0) @map("passed_count") |
| totalCount | Int | @map("total_count") |
| score | Int | @default(0) |
| runtimeMs | Int? | @map("runtime_ms") |
| engineVersion | String | @map("engine_version") |
| failureReason | String? | @map("failure_reason") |
| startedAt | DateTime | @default(now()) @map("started_at") @db.Timestamptz(6) |
| gradedAt | DateTime? | @map("graded_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| solveSessionId | String? | @map("solve_session_id") @db.Uuid |
| solveElapsedSec | Int? | @map("solve_elapsed_sec") |
| problemTitle | String | @map("problem_title") |
| courseTitle | String | @map("course_title") |
| moduleTitle | String | @map("module_title") |
| lectureTitle | String | @map("lecture_title") |
| modulePosition | Int | @map("module_position") |
| lecturePosition | Int | @map("lecture_position") |
| problemPosition | Int | @map("problem_position") |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| material | Material? | @relation(fields: [materialId], references: [id], onDelete: SetNull) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Restrict) |
| class | Class? | @relation(fields: [classId], references: [id], onDelete: SetNull) |
| solveSession | ExerciseSolveSession? | @relation(fields: [solveSessionId], references: [id], onDelete: SetNull) |
| regradeRun | PlatformOperationRun? | @relation(fields: [regradeRunId], references: [id], onDelete: SetNull) |
| gradingCases | SubmissionGradingCase[] |  |
| cases | SubmissionCase[] |  |

제약: `@@index([userId, materialId, createdAt(sort: Desc)])`; `@@index([status, createdAt])`; `@@index([userId, createdAt(sort: Desc), id(sort: Desc)])`; `@@index([materialId, userId, createdAt(sort: Desc)])`; `@@index([classId, userId, createdAt(sort: Desc)])`; `@@index([regradeRunId, status])`; `@@map("submissions")`

## ExerciseSolveSession

실제 테이블: `exercise_solve_sessions`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| materialId | String | @map("material_id") @db.Uuid |
| classId | String? | @map("class_id") @db.Uuid |
| startedAt | DateTime | @default(now()) @map("started_at") @db.Timestamptz(6) |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| material | Material | @relation(fields: [materialId], references: [id], onDelete: Cascade) |
| class | Class? | @relation(fields: [classId], references: [id], onDelete: SetNull) |
| submissions | Submission[] |  |

제약: `@@index([userId, materialId, startedAt(sort: Desc)])`; `@@map("exercise_solve_sessions")`

## SubmissionGradingCase

실제 테이블: `submission_grading_cases`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| submissionId | String | @map("submission_id") @db.Uuid |
| position | Int |  |
| input | String |  |
| expectedOutput | String | @map("expected_output") |
| isSample | Boolean | @map("is_sample") |
| submission | Submission | @relation(fields: [submissionId], references: [id], onDelete: Cascade) |

제약: `@@unique([submissionId, position])`; `@@map("submission_grading_cases")`

## SubmissionCase

실제 테이블: `submission_cases`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| submissionId | String | @map("submission_id") @db.Uuid |
| position | Int |  |
| isSample | Boolean | @map("is_sample") |
| outcome | CaseOutcome |  |
| runtimeMs | Int? | @map("runtime_ms") |
| actualOutput | String? | @map("actual_output") |
| submission | Submission | @relation(fields: [submissionId], references: [id], onDelete: Cascade) |

제약: `@@unique([submissionId, position])`; `@@map("submission_cases")`

## StudentExerciseProgress

실제 테이블: `student_exercise_progress`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| userId | String | @map("user_id") @db.Uuid |
| materialId | String | @map("material_id") @db.Uuid |
| status | ExerciseProgressStatus | @default(NOT_STARTED) |
| attemptCount | Int | @default(0) @map("attempt_count") |
| bestPassed | Int | @default(0) @map("best_passed") |
| bestScore | Int | @default(0) @map("best_score") |
| gradingRevision | Int | @default(1) @map("grading_revision") |
| firstSolvedAt | DateTime? | @map("first_solved_at") @db.Timestamptz(6) |
| lastAttemptAt | DateTime? | @map("last_attempt_at") @db.Timestamptz(6) |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| material | Material | @relation(fields: [materialId], references: [id], onDelete: Cascade) |

제약: `@@unique([userId, materialId])`; `@@index([userId, status])`; `@@index([materialId, status, userId])`; `@@map("student_exercise_progress")`

## TeacherMonitoringVisit

실제 테이블: `teacher_monitoring_visits`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| teacherMembershipId | String? | @map("teacher_membership_id") @db.Uuid |
| studentMembershipId | String? | @map("student_membership_id") @db.Uuid |
| teacherMembershipRef | String | @map("teacher_membership_ref") @db.Uuid |
| studentMembershipRef | String | @map("student_membership_ref") @db.Uuid |
| materialId | String? | @map("material_id") @db.Uuid |
| startedAt | DateTime | @default(now()) @map("started_at") @db.Timestamptz(6) |
| endedAt | DateTime? | @map("ended_at") @db.Timestamptz(6) |
| endReason | MonitoringVisitEndReason? | @map("end_reason") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Restrict) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Restrict) |
| teacherMembership | AcademyMembership? | @relation("MonitoringVisitTeacher", fields: [teacherMembershipId], references: [id], onDelete: SetNull) |
| studentMembership | AcademyMembership? | @relation("MonitoringVisitStudent", fields: [studentMembershipId], references: [id], onDelete: SetNull) |
| material | Material? | @relation(fields: [materialId], references: [id], onDelete: SetNull) |
| feedback | TeacherFeedback[] |  |

제약: `@@index([studentMembershipRef, startedAt(sort: Desc)])`; `@@index([teacherMembershipRef, startedAt(sort: Desc)])`; `@@index([classId, endedAt])`; `@@map("teacher_monitoring_visits")`

## TeacherFeedback

실제 테이블: `teacher_feedback`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| teacherMembershipId | String? | @map("teacher_membership_id") @db.Uuid |
| studentMembershipId | String? | @map("student_membership_id") @db.Uuid |
| teacherMembershipRef | String | @map("teacher_membership_ref") @db.Uuid |
| studentMembershipRef | String | @map("student_membership_ref") @db.Uuid |
| materialId | String? | @map("material_id") @db.Uuid |
| monitoringVisitId | String? | @map("monitoring_visit_id") @db.Uuid |
| idempotencyKey | String | @map("idempotency_key") @db.Uuid |
| body | String |  |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6) |
| readAt | DateTime? | @map("read_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Restrict) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Restrict) |
| teacherMembership | AcademyMembership? | @relation("TeacherFeedbackAuthor", fields: [teacherMembershipId], references: [id], onDelete: SetNull) |
| studentMembership | AcademyMembership? | @relation("TeacherFeedbackRecipient", fields: [studentMembershipId], references: [id], onDelete: SetNull) |
| material | Material? | @relation(fields: [materialId], references: [id], onDelete: SetNull) |
| monitoringVisit | TeacherMonitoringVisit? | @relation(fields: [monitoringVisitId], references: [id], onDelete: SetNull) |

제약: `@@unique([teacherMembershipRef, idempotencyKey])`; `@@index([studentMembershipRef, createdAt(sort: Desc)])`; `@@index([studentMembershipRef, materialId, createdAt(sort: Desc)], map: "teacher_feedback_student_material_created_at_idx")`; `@@index([teacherMembershipRef, studentMembershipRef, materialId, createdAt(sort: Desc)], map: "teacher_feedback_author_thread_idx")`; `@@map("teacher_feedback")`

## ExerciseHint

실제 테이블: `exercise_hints`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| exerciseMaterialId | String | @map("exercise_material_id") @db.Uuid |
| position | Int |  |
| content | String |  |
| triggerExpression | String? | @map("trigger_expression") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| exercise | ProgrammingExercise | @relation(fields: [exerciseMaterialId], references: [materialId], onDelete: Cascade) |

제약: `@@unique([exerciseMaterialId, position])`; `@@map("exercise_hints")`

## StudentCourseLearningDay

실제 테이블: `student_course_learning_days`

| 필드 | 타입 | 정의 |
|---|---|---|
| academyId | String | @map("academy_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| localDate | DateTime | @map("local_date") @db.Date |
| activeSeconds | Int | @default(0) @map("active_seconds") |
| activeIntervals | Int | @default(0) @map("active_intervals") |
| firstActiveAt | DateTime | @map("first_active_at") @db.Timestamptz(6) |
| lastActiveAt | DateTime | @map("last_active_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Cascade) |

제약: `@@id([academyId, membershipId, courseId, localDate])`; `@@index([academyId, localDate])`; `@@index([membershipId, courseId, localDate])`; `@@map("student_course_learning_days")`

## StudentClassCourseLearningDay

실제 테이블: `student_class_course_learning_days`

| 필드 | 타입 | 정의 |
|---|---|---|
| academyId | String | @map("academy_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| courseId | String | @map("course_id") @db.Uuid |
| localDate | DateTime | @map("local_date") @db.Date |
| activeSeconds | Int | @default(0) @map("active_seconds") |
| activeIntervals | Int | @default(0) @map("active_intervals") |
| firstActiveAt | DateTime | @map("first_active_at") @db.Timestamptz(6) |
| lastActiveAt | DateTime | @map("last_active_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Cascade) |
| course | Course | @relation(fields: [courseId], references: [id], onDelete: Cascade) |

제약: `@@id([academyId, membershipId, classId, courseId, localDate])`; `@@index([classId, localDate, membershipId])`; `@@index([membershipId, classId, localDate])`; `@@map("student_class_course_learning_days")`

## LearningActivityFlush

실제 테이블: `learning_activity_flushes`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |

제약: `@@index([createdAt])`; `@@map("learning_activity_flushes")`

## ClassScheduleSlot

실제 테이블: `class_schedule_slots`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| weekday | Int |  |
| startMinute | Int | @map("start_minute") |
| endMinute | Int | @map("end_minute") |
| effectiveFrom | DateTime? | @map("effective_from") @db.Date |
| effectiveTo | DateTime? | @map("effective_to") @db.Date |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Cascade) |

제약: `@@index([classId, weekday])`; `@@map("class_schedule_slots")`

## PointAward

실제 테이블: `point_awards`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| membershipId | String | @map("membership_id") @db.Uuid |
| reason | PointReason |  |
| amount | Int |  |
| dedupeKey | String | @unique @map("dedupe_key") |
| materialId | String? | @map("material_id") @db.Uuid |
| lectureId | String? | @map("lecture_id") @db.Uuid |
| moduleId | String? | @map("module_id") @db.Uuid |
| courseId | String? | @map("course_id") @db.Uuid |
| classId | String? | @map("class_id") @db.Uuid |
| localDate | DateTime? | @map("local_date") @db.Date |
| subjectLabel | String | @map("subject_label") |
| difficulty | ExerciseDifficulty? | @map("difficulty") |
| cappedAt | DateTime? | @map("capped_at") @db.Timestamptz(6) |
| voidedAt | DateTime? | @map("voided_at") @db.Timestamptz(6) |
| voidedByMembershipId | String? | @map("voided_by_membership_id") @db.Uuid |
| voidReason | String? | @map("void_reason") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |
| class | Class? | @relation(fields: [classId], references: [id], onDelete: SetNull) |

제약: `@@index([academyId, classId, membershipId, createdAt])`; `@@index([membershipId, createdAt(sort: Desc), id(sort: Desc)])`; `@@index([membershipId, classId, localDate])`; `@@map("point_awards")`

## StudentPointBalance

실제 테이블: `student_point_balances`

| 필드 | 타입 | 정의 |
|---|---|---|
| membershipId | String | @id @map("membership_id") @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| earnedTotal | Int | @default(0) @map("earned_total") |
| spentTotal | Int | @default(0) @map("spent_total") |
| stampCount | Int | @default(0) @map("stamp_count") |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| membership | AcademyMembership | @relation(fields: [membershipId], references: [id], onDelete: Cascade) |

제약: `@@index([academyId])`; `@@map("student_point_balances")`

## AcademyPointPolicy

실제 테이블: `academy_point_policies`

| 필드 | 타입 | 정의 |
|---|---|---|
| academyId | String | @id @map("academy_id") @db.Uuid |
| solveEasy | Int | @default(3) @map("solve_easy") |
| solveMedium | Int | @default(5) @map("solve_medium") |
| solveHard | Int | @default(10) @map("solve_hard") |
| lectureCompleted | Int | @default(15) @map("lecture_completed") |
| moduleCompleted | Int | @default(40) @map("module_completed") |
| courseCompleted | Int | @default(150) @map("course_completed") |
| attendance | Int | @default(5) @map("attendance") |
| attendanceLate | Int | @default(2) @map("attendance_late") |
| attendanceMinMinutes | Int | @default(10) @map("attendance_min_minutes") |
| attendanceGraceMinutes | Int | @default(15) @map("attendance_grace_minutes") |
| learningTimeTier1Minutes | Int | @default(30) @map("learning_time_tier1_minutes") |
| learningTimeTier1Points | Int | @default(3) @map("learning_time_tier1_points") |
| learningTimeTier2Minutes | Int | @default(60) @map("learning_time_tier2_minutes") |
| learningTimeTier2Points | Int | @default(5) @map("learning_time_tier2_points") |
| learningTimeTier3Minutes | Int | @default(120) @map("learning_time_tier3_minutes") |
| learningTimeTier3Points | Int | @default(7) @map("learning_time_tier3_points") |
| studentDailyCap | Int | @default(100) @map("student_daily_cap") |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @updatedAt @map("updated_at") @db.Timestamptz(6) |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Cascade) |

제약: `@@map("academy_point_policies")`

## StudentHelpRequest

실제 테이블: `student_help_requests`

| 필드 | 타입 | 정의 |
|---|---|---|
| id | String | @id @default(uuid()) @db.Uuid |
| academyId | String | @map("academy_id") @db.Uuid |
| classId | String | @map("class_id") @db.Uuid |
| studentMembershipRef | String | @map("student_membership_ref") @db.Uuid |
| studentMembershipId | String? | @map("student_membership_id") @db.Uuid |
| materialRef | String | @map("material_ref") @db.Uuid |
| materialId | String? | @map("material_id") @db.Uuid |
| teacherMembershipRef | String? | @map("teacher_membership_ref") @db.Uuid |
| teacherMembershipId | String? | @map("teacher_membership_id") @db.Uuid |
| status | HelpRequestStatus | @default(WAITING) |
| requestedAt | DateTime | @default(now()) @map("requested_at") @db.Timestamptz(6) |
| claimedAt | DateTime? | @map("claimed_at") @db.Timestamptz(6) |
| closedAt | DateTime? | @map("closed_at") @db.Timestamptz(6) |
| updatedAt | DateTime | @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6) |
| version | Int | @default(1) |
| closedByRef | String? | @map("closed_by_ref") @db.Uuid |
| closeReason | String? | @map("close_reason") |
| academy | Academy | @relation(fields: [academyId], references: [id], onDelete: Restrict) |
| class | Class | @relation(fields: [classId], references: [id], onDelete: Restrict) |
| studentMembership | AcademyMembership? | @relation("HelpRequestStudent", fields: [studentMembershipId], references: [id], onDelete: SetNull) |
| teacherMembership | AcademyMembership? | @relation("HelpRequestTeacher", fields: [teacherMembershipId], references: [id], onDelete: SetNull) |
| material | Material? | @relation(fields: [materialId], references: [id], onDelete: SetNull) |

제약: `@@index([academyId, classId, status, requestedAt, id], map: "help_requests_class_queue_idx")`; `@@index([studentMembershipRef, classId, status], map: "help_requests_student_active_idx")`; `@@map("student_help_requests")`

## HelpRequestReceipt

실제 테이블: `help_request_receipts`

| 필드 | 타입 | 정의 |
|---|---|---|
| actorRef | String | @map("actor_ref") @db.Uuid |
| key | String | @db.Uuid |
| fingerprint | String |  |
| result | Json |  |
| createdAt | DateTime | @default(now()) @map("created_at") @db.Timestamptz(6) |

제약: `@@id([actorRef, key])`; `@@map("help_request_receipts")`

## 열거형

### PlatformRole

`USER`, `ADMIN`

### UserStatus

`PENDING_PROFILE`, `ACTIVE`, `SUSPENDED`, `DELETED`

### OrganizationStatus

`ACTIVE`, `SUSPENDED`, `ARCHIVED`

### AcademyStatus

`ACTIVE`, `SUSPENDED`, `ARCHIVED`

### AcademyKind

`ACADEMY`, `LIBRARY`

### AcademyRole

`STUDENT`, `TEACHER`, `TEAM_LEAD`, `MANAGER`

### MembershipStatus

`INVITED`, `ACTIVE`, `SUSPENDED`, `LEFT`

### InvitationStatus

`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`

### JoinRequestStatus

`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`

### JoinRequestKind

`STUDENT`, `STAFF`

### OAuthOnboardingIntentStatus

`PENDING`, `CONSUMED`, `EXPIRED`

### ClassStatus

`ACTIVE`, `ARCHIVED`

### AcademyFeature

`TEACHER_LIVE_MONITORING`, `STUDENT_CLASS_STANDING`, `STUDENT_POINTS`, `STUDENT_CLASS_LEADERBOARD`

### PointReason

`ATTENDANCE`, `ATTENDANCE_LATE`, `LEARNING_TIME`, `EXERCISE_SOLVED`, `LECTURE_COMPLETED`, `MODULE_COMPLETED`, `COURSE_COMPLETED`

### MonitoringVisitEndReason

`TEACHER_LEFT`, `WATCH_REPLACED`, `STUDENT_LEFT`, `ASSIGNMENT_CHANGED`, `CLASS_ARCHIVED`, `ENROLLMENT_REMOVED`, `MEMBERSHIP_INACTIVE`, `ROLE_CHANGED`, `MATERIAL_UNAVAILABLE`, `CONNECTION_EXPIRED`, `FEATURE_DISABLED`, `ACADEMY_SUSPENDED`

### MaterialType

`PROGRAMMING_EXERCISE`

### ExerciseDifficulty

`EASY`, `MEDIUM`, `HARD`

### ExerciseLanguage

`PYTHON`

### TestCaseVisibility

`SAMPLE`, `HIDDEN`

### SubmissionStatus

`QUEUED`, `RUNNING`, `PASSED`, `FAILED`, `ERRORED`, `CANCELLED`

### CaseOutcome

`PASSED`, `WRONG_OUTPUT`, `RUNTIME_ERROR`, `TIME_LIMIT`, `MEMORY_LIMIT`, `SKIPPED`

### MediaAssetPurpose

`USER_AVATAR`, `ACADEMY_MEMBER_AVATAR`, `ACADEMY_COVER`, `ACADEMY_GALLERY`

### AcademyMediaKind

`COVER`, `GALLERY`

### PeopleImportStatus

`PREVIEW_READY`, `COMMITTING`, `COMPLETED`, `EXPIRED`, `FAILED`

### ContentImportStatus

`PREVIEW_READY`, `COMMITTING`, `COMPLETED`, `EXPIRED`, `FAILED`

### PeopleBulkKind

`ENROLL`, `ROLE_CHANGE`, `SUSPEND`, `RESTORE`

### PeopleBulkStatus

`PENDING`, `COMPLETED`, `FAILED`

### InvitationDeliveryState

`QUEUED`, `SENT`, `DELIVERED`, `BOUNCED`, `FAILED`

### GuardianRelationship

`MOTHER`, `FATHER`, `GRANDPARENT`, `SIBLING`, `LEGAL_GUARDIAN`, `OTHER`

### ExerciseProgressStatus

`NOT_STARTED`, `IN_PROGRESS`, `SOLVED`

### PlatformOperation

`REGRADE_STALE_SUBMISSIONS`

### PlatformOperationStatus

`PLANNING`, `RUNNING`, `COMPLETED`, `FAILED`

### HelpRequestStatus

`WAITING`, `IN_PROGRESS`, `RESOLVED`, `CANCELLED`
