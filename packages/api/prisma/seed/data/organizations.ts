export const developmentOrganization = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Cove Development",
  slug: "cove-development",
} as const;

export const developmentAcademy = {
  id: "20000000-0000-4000-8000-000000000001",
  organizationId: developmentOrganization.id,
  name: "Cove Development Academy",
  slug: "development-academy",
} as const;
