import sanitizeHtml from "sanitize-html";
import { hasExplanationContent } from "@cove/shared";
import { AppException } from "../common/app-exception.js";

/** The editor's document subset; image bytes are always private assets. */
export function sanitizeExplanation(html: string): string {
  const body = sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "mark", "span", "code", "pre", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "hr", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col"],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "width"], th: ["colspan", "rowspan", "colwidth"], td: ["colspan", "rowspan", "colwidth"], ol: ["start"], "*": ["style"] },
    allowedSchemes: ["https", "http", "mailto"], allowedSchemesByTag: { img: ["cove-asset"] }, allowProtocolRelative: false,
    allowedStyles: { "*": { "color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(\d{1,3}, ?\d{1,3}, ?\d{1,3}\)$/], "background-color": [/^#[0-9a-f]{3,8}$/i], "text-align": [/^(left|center|right|justify)$/], "font-size": [/^(12|14|16|18|20|24|28|32)px$/], "width": [/^\d{1,4}px$/] } },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
    exclusiveFilter: frame => frame.tag === "img" && !/^cove-asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(frame.attribs.src ?? ""),
  });
  if (!hasExplanationContent(body)) throw new AppException("CONTENT_VALIDATION_FAILED");
  return body;
}
