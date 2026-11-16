"use client";
import { useId, useMemo, useState } from "react";
import { WorkspaceColumnDivider } from "@/components/workspace/workspace-column-divider";
import { useSplitPane } from "@/lib/workspace/use-split-pane";
import styles from "./explanation-split.module.css";
import { BookOpen } from "lucide-react";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { withPrivateImages } from "@/lib/lesson-images";
import { anchorProps, surfaceProps } from "@/lib/monitoring/awareness/surfaces";
import { useExplanationTranslation } from "./use-explanation-translation";

/** Shared by preview, the learner and the existing teacher observation shell. */
export function ExplanationContent(props: {
  title: string;
  body: string;
  sideBody?: string | null;
  images?: Record<string, string | null>;
  lectureTitle?: string;
  onRetry?: () => void;
}) {
  const { t } = useExplanationTranslation();
  const [tab, setTab] = useState<"instructions" | "reference">("instructions");
  const id = useId();
  const { containerRef, size, resizeBy, dividerProps } = useSplitPane({
    axis: "horizontal",
    initial: 42,
    min: 25,
    max: 70,
    storageKey: "cove-explanation-split",
  });
  if (!props.sideBody) return <ExplanationPane {...props} />;
  return (
    <div className={styles.workspace}>
      <div
        role="tablist"
        aria-label={t("content")}
        className={styles.tabs}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "instructions"
              : event.key === "End"
                ? "reference"
                : tab === "instructions"
                  ? "reference"
                  : "instructions";
          setTab(next);
          document.getElementById(`${id}-${next}-tab`)?.focus();
        }}
      >
        {(["instructions", "reference"] as const).map((value) => (
          <button
            id={`${id}-${value}-tab`}
            type="button"
            role="tab"
            key={value}
            aria-selected={tab === value}
            aria-controls={`${id}-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
          >
            {t(value)}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        className={styles.panes}
        style={{ "--instruction-share": `${size}%` } as React.CSSProperties}
      >
        <section
          id={`${id}-instructions`}
          aria-label={t("instructions")}
          data-active={tab === "instructions"}
          className={styles.instructions}
        >
          <ExplanationPane {...props} />
        </section>
        <WorkspaceColumnDivider
          label={t("resize_panes")}
          size={size}
          resizeBy={resizeBy}
          dividerProps={dividerProps}
        />
        <section
          id={`${id}-reference`}
          aria-label={t("reference")}
          data-active={tab === "reference"}
          className={styles.reference}
        >
          <ExplanationPane
            {...props}
            title={t("reference")}
            body={props.sideBody}
            lectureTitle={undefined}
            anchor="statement:reference"
            reference
          />
        </section>
      </div>
    </div>
  );
}
function ExplanationPane({
  title,
  body,
  images = {},
  lectureTitle,
  onRetry,
  anchor = "statement:instructions",
  reference = false,
}: {
  /** The side pane: a quiet label instead of a second page heading. */
  reference?: boolean;
  title: string;
  body: string;
  anchor?: string;
  images?: Record<string, string | null>;
  lectureTitle?: string;
  onRetry?: () => void;
}) {
  const { t } = useExplanationTranslation();
  const codeLabels = useMemo(
    () => ({
      copy: t("copy_code"),
      copied: t("copied"),
      copyFailed: t("copy_failed"),
      plainText: t("plain_text"),
    }),
    [t],
  );
  const html = useMemo(
    () => withPrivateImages(body, new Map(Object.entries(images))),
    [body, images],
  );
  return (
    <article
      {...surfaceProps("statement")}
      className="mx-auto my-5 w-full max-w-[1440px] rounded-2xl border border-border bg-card px-5 py-7 shadow-sm sm:my-8 sm:px-10 sm:py-10 lg:px-10 lg:py-10"
    >
      {reference ? (
        <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-sub">
          {title}
        </h2>
      ) : (
      <header className="mb-7 border-b border-border pb-6">
        <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-brand">
          <BookOpen aria-hidden className="size-4" />
          {t("type")}
          <span className="text-border">/</span>
          <span className="text-sub">{t("ungraded")}</span>
        </p>
        <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {lectureTitle ? (
          <p className="mt-3 text-sm leading-6 text-sub">{lectureTitle}</p>
        ) : null}
      </header>
      )}
      {Object.values(images).some((value) => value === null) ? (
        <p
          role="status"
          className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-ink"
        >
          {t("image_failed")}
          {onRetry ? (
            <button
              type="button"
              className="ml-2 font-semibold text-brand underline"
              onClick={onRetry}
            >
              {t("retry")}
            </button>
          ) : null}
        </p>
      ) : null}
      <div {...anchorProps(anchor)} className="min-w-0">
        <RichTextFrame
          content={html}
          title={title}
          minHeight={100}
          padding={0}
          codeExamples={codeLabels}
        />
      </div>
    </article>
  );
}
