"use client";
import { useState } from "react";
import { RichEditor } from "@/components/editor/RichEditor";
import { useManualTranslation } from "./use-manual-translation";
import { simpleChoiceText, choiceTextHtml } from "./choice-text";

/** Existing formatted/image answers remain rich; ordinary answers use a small text field. */
export function ChoiceOptionInput({ value, label, onChange, uploadImage }: {
  value: string; label: string; onChange: (value: string) => void;
  uploadImage: (file: File) => Promise<string>;
}) {
  const { t } = useManualTranslation();
  const [rich, setRich] = useState(() => simpleChoiceText(value) === null);
  return <div className="min-w-0 flex-1">
    {rich ? <RichEditor minHeight={80} value={value} onChange={onChange} onImageUpload={uploadImage} /> : <textarea
      aria-label={label} placeholder={label} rows={1} maxLength={10000}
      className="block min-h-11 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      value={simpleChoiceText(value) ?? ""}
      onChange={(e) => onChange(choiceTextHtml(e.target.value))}
    />}
    {!rich ? <button type="button" onClick={() => setRich(true)} className="mt-1 text-xs text-sub hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">{t("quiz_simple.format_option")}</button> : null}
  </div>;
}
