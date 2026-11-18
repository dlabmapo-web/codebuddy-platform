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

/**
 * The academy slug, or null on a surface that has no academy — the content
 * library's editors are mounted under the console with none.
 */
export function useOptionalAcademySlug(): string | null {
  return useContext(AcademySlugContext);
}

export function useAcademySlug(): string {
  const academySlug = useContext(AcademySlugContext);
  if (!academySlug) {
    throw new Error('useAcademySlug must be used inside an academy route');
  }
  return academySlug;
}
