"use client";
import {
  Node,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { lessonCalloutTones } from "@cove/shared";
import { useEditorTranslation } from "./use-editor-translation";
function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const { t } = useEditorTranslation();
  return (
    <NodeViewWrapper
      data-callout={node.attrs.tone}
      className="relative my-4 rounded-md px-28 py-1.5 text-center text-[1.25em] font-medium leading-normal"
    >
      <select
        aria-label={t("banner_tone")}
        value={node.attrs.tone}
        onChange={(e) => updateAttributes({ tone: e.target.value })}
        disabled={!editor.isEditable}
        contentEditable={false}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-current/30 bg-card px-2 py-1 text-xs font-normal text-ink"
      >
        {lessonCalloutTones.map((tone) => (
          <option key={tone} value={tone}>
            {t(`banner_${tone}`)}
          </option>
        ))}
      </select>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
export const LessonCallout = Node.create({
  name: "lessonCallout",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "note",
        parseHTML: (element) => element.getAttribute("data-callout"),
      },
    };
  },
  parseHTML() {
    return lessonCalloutTones.map((tone) => ({
      tag: `div[data-callout="${tone}"]`,
    }));
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-callout": lessonCalloutTones.includes(node.attrs.tone)
          ? node.attrs.tone
          : "note",
      },
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
