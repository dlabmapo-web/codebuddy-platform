'use client';

import { createContext, useContext, useMemo } from 'react';

import {
  createContentPaths,
  type ContentPaths,
  type ContentSurface,
} from './content-paths';

type ContentRouteContextValue = {
  academySlug: string;
  paths: ContentPaths;
  surface: ContentSurface;
};

const ContentRouteContext = createContext<ContentRouteContextValue | null>(null);

export function ContentBasePathProvider({
  academySlug,
  children,
  surface,
}: {
  academySlug: string;
  children: React.ReactNode;
  surface: ContentSurface;
}) {
  const value = useMemo(
    () => ({ academySlug, paths: createContentPaths(academySlug, surface), surface }),
    [academySlug, surface],
  );

  return (
    <ContentRouteContext.Provider value={value}>
      {children}
    </ContentRouteContext.Provider>
  );
}

function useContentRoute(): ContentRouteContextValue {
  const route = useContext(ContentRouteContext);
  if (!route) {
    throw new Error(
      'content editors must be rendered inside ContentBasePathProvider',
    );
  }
  return route;
}

export function useContentBasePath(): ContentPaths {
  return useContentRoute().paths;
}

export function useContentSurface(): ContentSurface {
  return useContentRoute().surface;
}

export function useContentAcademySlug(): string {
  return useContentRoute().academySlug;
}
