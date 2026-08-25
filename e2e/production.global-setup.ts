const requiredVariables = [
  'PRODUCTION_BASE_URL',
  'PRODUCTION_HOME_URL',
  'PRODUCTION_API_URL',
  'PRODUCTION_MVP_URL',
  'PRODUCTION_ACADEMY_SLUG',
  'PRODUCTION_STUDENT_USERNAME',
  'PRODUCTION_STUDENT_PASSWORD',
  'PRODUCTION_TEACHER_USERNAME',
  'PRODUCTION_TEACHER_PASSWORD',
  'PRODUCTION_TEAM_LEAD_USERNAME',
  'PRODUCTION_TEAM_LEAD_PASSWORD',
  'PRODUCTION_MANAGER_USERNAME',
  'PRODUCTION_MANAGER_PASSWORD',
  'PRODUCTION_ADMIN_USERNAME',
  'PRODUCTION_ADMIN_PASSWORD',
] as const;

export default function productionGlobalSetup() {
  const missing = requiredVariables.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Production smoke configuration is incomplete: ${missing.join(', ')}`,
    );
  }

  for (const key of [
    'PRODUCTION_BASE_URL',
    'PRODUCTION_HOME_URL',
    'PRODUCTION_API_URL',
    'PRODUCTION_MVP_URL',
  ] as const) {
    const url = new URL(process.env[key]!);
    if (url.protocol !== 'https:') {
      throw new Error(`${key} must use HTTPS`);
    }
  }
}
