import { routes } from '@/lib/routes';
import { MaterialReadFailure } from '@/components/workspace/material-read-failure';
import { isMaterialUnavailable } from '@/lib/material-read';
import { requireAcademyRoute } from "@/lib/academy-route";
import { createServerORPCClient } from "@/lib/orpc-server";
import { StudentWorkPage } from "@/components/student-history/student-work-page";

export default async function SavedStudentWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{
    academySlug: string;
    classId: string;
    membershipId: string;
    materialId: string;
  }>;
  searchParams: Promise<{
    returnTo?: string;
    attempt?: string;
    attemptPage?: string;
  }>;
}) {
  const { academySlug, ...target } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const scope = { academyId, ...target };
  const api = createServerORPCClient();
  const query = await searchParams;
  const requestedPage = Number(query.attemptPage ?? 1);
  const attemptPage =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 100000
      ? requestedPage
      : 1;
  let name: string;
  try {
    // Authorize the exact student and material before rendering even the identity.
    const attempts = await api.studentWorkHistory.listAttempts({
      ...scope,
      page: attemptPage,
    });
    if (query.attempt && !attempts.attempts.some((a) => a.id === query.attempt))
      return <MaterialReadFailure unavailable backHref={routes.academyTeachClasses(academySlug)} />;
    const summary = await api.studentWorkHistory.getStudentSummary({
      academyId,
      classId: target.classId,
      membershipId: target.membershipId,
    });
    name = summary.student.name;
  } catch (error) {
    if (isMaterialUnavailable(error)) return <MaterialReadFailure unavailable backHref={routes.academyTeachClasses(academySlug)} />;
    throw error;
  }
  return (
    <StudentWorkPage
      key={`${target.membershipId}:${target.materialId}:${query.attempt ?? "latest"}:${attemptPage}`}
      {...scope}
      name={name}
      returnTo={typeof query.returnTo === "string" ? query.returnTo : undefined}
      initialSubmissionId={query.attempt}
      initialAttemptPage={attemptPage}
    />
  );
}
