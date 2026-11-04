import { requireAcademyRoute } from "@/lib/academy-route";
import { StudioPage } from "../../_components/studio-page";
import { getServerTranslation } from "@/i18n/server/get-server-translation";
import { ClassHistoryPicker } from "@/components/student-history/class-history-picker";
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(["teach"]);
  return (
    <StudioPage
      bleed
      title={t("history.title")}
      description={t("history.choose_class")}
    >
      <ClassHistoryPicker academyId={academyId} />
    </StudioPage>
  );
}
