import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';

/**
 * The library surface, for every editor mounted below.
 *
 * `academySlug` is empty and unused: the `library` branch of
 * `createContentPaths` ignores it, because a master course's address carries
 * no academy. The provider is still the right seam — the editors ask it where
 * their links go, and this is the third answer it gives.
 */
export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ContentBasePathProvider academySlug="" surface="library">
      {children}
    </ContentBasePathProvider>
  );
}
