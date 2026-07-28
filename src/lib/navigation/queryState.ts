export type QueryUpdates = Record<string, string | null | undefined>;

export function updateQueryString(
  current: string | URLSearchParams,
  updates: QueryUpdates,
) {
  const params = new URLSearchParams(
    typeof current === 'string' ? current : current.toString(),
  );

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') params.delete(key);
    else params.set(key, value);
  }

  return params.toString();
}

export function routeWithQuery(
  pathname: string,
  current: string | URLSearchParams,
  updates: QueryUpdates,
) {
  const query = updateQueryString(current, updates);
  return query ? `${pathname}?${query}` : pathname;
}

export function normalizeCurriculumQuery({
  subjectId,
  stageId,
  chapterId,
}: {
  subjectId?: string | null;
  stageId?: string | null;
  chapterId?: string | null;
}) {
  return {
    subject: subjectId || null,
    stage: subjectId && stageId ? stageId : null,
    chapter: subjectId && stageId && chapterId ? chapterId : null,
  };
}

