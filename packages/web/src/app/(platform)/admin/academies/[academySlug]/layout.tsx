import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';

export default async function PlatformAcademyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;

  return (
    <ContentBasePathProvider academySlug={academySlug} surface="console">
      {children}
    </ContentBasePathProvider>
  );
}
