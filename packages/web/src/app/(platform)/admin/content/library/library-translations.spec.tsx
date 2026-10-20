import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { defaultEliceGradingProfile } from '@cove/shared';
import { initTranslationsSync } from '@/i18n/init-translations';
import { PageTranslationsProvider } from '@/i18n/page-translations-provider';
import { platformNamespaces } from '@/i18n/namespaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ locale: 'en' }));
function resources(namespaces: readonly string[]) {
  return Object.fromEntries(['en', 'ko'].map((locale) => [locale,
    Object.fromEntries(namespaces.map((ns) => [ns, JSON.parse(readFileSync(resolve(process.cwd(), '../i18n/src/locales', locale, `${ns}.json`), 'utf8'))])),
  ]));
}
vi.mock('@/app/(platform)/admin/_components/platform-shell', () => ({
  PlatformShell: ({ children, namespaces = [] }: { children: ReactNode; namespaces?: readonly string[] }) => {
    const all = [...platformNamespaces, ...namespaces];
    return <PageTranslationsProvider locale={state.locale} namespaces={all} resources={resources(all)}>{children}</PageTranslationsProvider>;
  },
}));
vi.mock('@/i18n/server/get-server-translation', () => ({
  getServerTranslation: async (namespaces: string[]) => ({ t: initTranslationsSync(state.locale, namespaces, resources(namespaces)).t }),
}));
vi.mock('./_lib/require-library', () => ({ requireLibraryAcademyId: async () => 'academy' }));
vi.mock('@/components/studio/back-link', () => ({ BackLink: () => null }));
vi.mock('@/lib/orpc-server', () => ({
  getAccount: async () => ({ user: { platformRole: 'ADMIN' } }),
  createPlatformServerORPCClient: () => ({
    platformLibrary: { academy: async () => ({ academyId: 'academy' }), courses: async () => ({ courses: [], total: 0, page: 1, pageSize: 25 }) },
    academyCourses: {
      getTree: async () => ({ course: { id: 'course', title: 'Course' }, modules: [{ id: 'module', title: 'Module', lectures: [{ id: 'lecture', title: 'Lecture', materials: [] }] }] }),
      getExercise: async () => ({ course: { id: 'course', title: 'Course' }, module: { id: 'module', title: 'Module' }, lecture: { id: 'lecture', title: 'Lecture' }, material: null }),
      getExerciseSolution: async () => ({ solutionCode: '' }),
    },
  }),
}));
vi.mock('./_components/library-table', () => ({ LibraryTable: () => <LibraryCopy /> }));
function LibraryCopy() {
  const { t } = useTranslation('platform-library');
  return <p>{t('title')} {t('picker.action')} {t('create.action')}</p>;
}
function BuilderCopy() {
  const { t } = useTranslation(['content', 'quiz', 'grading']);
  return <p>{t('builder.all_courses')} {t('quiz:type')} {t('grading:exercise.grading.title')}</p>;
}
vi.mock('@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/course-builder', () => ({ CourseBuilder: () => <BuilderCopy /> }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => () => 'Error' }));
vi.mock('@/lib/config', () => ({ publicConfig: { apiUrl: 'http://localhost:4000/api/rpc' } }));
vi.mock('@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/exercise-workspace', () => ({ ExerciseWorkspace: () => <ExerciseCopy /> }));
import { AnswersEditor } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/answers-editor';
import { newTestCaseDraft } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_lib/exercise-draft';
function ExerciseCopy() {
  const { t } = useTranslation('quiz');
  return <><p>{t('type')}</p><AnswersEditor editable testCases={[newTestCaseDraft('test', 'SAMPLE')]} grading={defaultEliceGradingProfile} gradingIssues={[]} update={() => {}} updateGrading={() => {}} /></>;
}
import LibraryPage from './page';
import BuilderPage from './[courseId]/page';
import ImportPage from './[courseId]/imports/new/page';
import LibraryLayout from './layout';
import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';
import { CourseImportWizard } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/imports/_components/course-import-wizard';
import ExercisePage from './[courseId]/lectures/[lectureId]/exercises/[materialId]/page';
const params = (materialId: string) => Promise.resolve({ courseId: 'course', lectureId: 'lecture', materialId });

describe.each(['en', 'ko'])('Library route translations in %s', (locale) => {
  it.each(['list', 'builder', 'import', 'new exercise', 'existing exercise'])('resolves %s copy on the first render', async (page) => {
    state.locale = locale;
    const element = page === 'list' ? await LibraryPage({ searchParams: Promise.resolve({}) })
      : page === 'builder' ? await BuilderPage({ params: Promise.resolve({ courseId: 'course' }), searchParams: Promise.resolve({}) })
      : page === 'import' ? await ImportPage({ params: Promise.resolve({ courseId: 'course' }) })
      : await ExercisePage({ params: params(page === 'new exercise' ? 'new' : 'material') });
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LibraryLayout>{element}</LibraryLayout></QueryClientProvider>);
    client.clear();
    expect(html).not.toMatch(/(?:exercise\.(?:grading|controls|test)|builder\.|prepare\.|picker\.)[a-z_]/);
    if (page.includes('exercise')) {
      expect(html).toContain(locale === 'ko' ? '테스트 케이스 1' : 'Test case 1');
      expect(html).toContain(locale === 'ko' ? '문제 점수' : 'Problem score');
      expect(html).toContain(locale === 'ko' ? '출력 비교' : 'Compare output');
    }
    if (page === 'import') {
      expect(html).toContain('/admin/content/library/course');
      expect(html).not.toContain('href="/academy/');
    }
  });
});

it.each([
  ['library', '/admin/content/library/course'],
  ['console', '/admin/academies/qa/courses/course'],
  ['academy', '/academy/qa/learn/courses/course'],
] as const)('keeps workbook importer links in the %s surface', (surface, href) => {
  const namespaces = [...platformNamespaces, 'content', 'content-import'];
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentBasePathProvider surface={surface} academySlug="qa">
        <PageTranslationsProvider locale="en" namespaces={namespaces} resources={resources(namespaces)}>
          <CourseImportWizard academyId="academy" courseId="course" courseTitle="Course" problemCount={0} />
        </PageTranslationsProvider>
      </ContentBasePathProvider>
    </QueryClientProvider>,
  );
  client.clear();
  expect(html).toContain(`href="${href}"`);
});
