'use client';

import { createContext, useContext } from 'react';

const AcademySlugContext = createContext<string | null>(null);

export function AcademyRouteProvider({
  academySlug,
  children,
}: {
  academySlug: string;
  children: React.ReactNode;
}) {
  return (
    <AcademySlugContext.Provider value={academySlug}>
      {children}
    </AcademySlugContext.Provider>
  );
}

export function useAcademySlug(): string {
  const academySlug = useContext(AcademySlugContext);
  if (!academySlug) {
    throw new Error('useAcademySlug must be used inside an academy route');
  }
  return academySlug;
}
