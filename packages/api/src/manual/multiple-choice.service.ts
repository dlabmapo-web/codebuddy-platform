import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import sanitizeHtml from "sanitize-html";
import {
  multipleChoiceSchema,
  evaluateMultipleChoice,
  type MultipleChoiceDefinition,
} from "@cove/shared";

export function sanitizeChoiceHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "code",
      "pre",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "a",
      "img",
    ],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["cove-asset"] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      (!/^cove-asset:[0-9a-f-]{36}$/i.test(frame.attribs.src ?? "") ||
        !frame.attribs.alt?.trim()),
  });
}
export function choiceAssetIds(html: string) {
  return Array.from(
    html.matchAll(/src="cove-asset:([0-9a-f-]{36})"/gi),
    (m) => m[1],
  );
}
@Injectable()
export class MultipleChoiceService {
  constructor(private readonly config: ConfigService) {}
  enabled() {
    const enabled = this.config.get<boolean | string>("MULTIPLE_CHOICE_ENABLED");
    return enabled === true || enabled === "true";
  }
  assertEnabled() {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        "Multiple-choice submission is unavailable",
      );
  }
  normalize(raw: unknown, publicAssets: string[], privateAssets: string[]) {
    const parsed = multipleChoiceSchema.parse(raw);
    const normalized = multipleChoiceSchema.safeParse({
      ...parsed,
      problemDescription: sanitizeChoiceHtml(parsed.problemDescription),
      options: parsed.options.map((o) => ({
        ...o,
        content: sanitizeChoiceHtml(o.content),
      })),
      explanation: sanitizeChoiceHtml(parsed.explanation),
    });
    if (!normalized.success)
      throw new BadRequestException(
        normalized.error.issues.map((i) => i.message).join("; "),
      );
    const definition = normalized.data;
    const visible = [
      definition.problemDescription,
      ...definition.options.map((o) => o.content),
    ];
    if (
      visible.some((html) =>
        choiceAssetIds(html).some((id) => !publicAssets.includes(id)),
      ) ||
      choiceAssetIds(definition.explanation).some(
        (id) => !privateAssets.includes(id),
      )
    )
      throw new BadRequestException(
        "Question image must belong to its authorized asset manifest",
      );
    return definition;
  }
  evaluate(
    definition: MultipleChoiceDefinition,
    selectedOptionIds: string[],
    displayOrder: string[],
  ) {
    try {
      return evaluateMultipleChoice(definition, {
        selectedOptionIds,
        displayOrder,
      });
    } catch {
      throw new BadRequestException(
        "Invalid choice selection or displayed order",
      );
    }
  }
}
