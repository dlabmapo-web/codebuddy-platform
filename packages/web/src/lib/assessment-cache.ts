/** Assessment hints invalidate only data about learning and submitted work. */
export function assessmentCacheMatches(key: readonly unknown[], academyId: string): boolean {
  return key.includes(academyId) && key.some(part => typeof part === 'string' && [
    'learn', 'latest-submission', 'student-history', 'teacher-progress',
    'tutor-attempts', 'live-submission-review',
  ].includes(part));
}
