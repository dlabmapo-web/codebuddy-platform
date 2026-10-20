import { describe, it, expect } from "vitest";
import { ConfigService } from "@nestjs/config";
import {
  evaluateMultipleChoice,
  multipleChoiceSchema,
  publicChoice,
} from "@cove/shared";
import {
  MultipleChoiceService,
  sanitizeChoiceHtml,
} from "./multiple-choice.service.js";
const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const definition = multipleChoiceSchema.parse({
  question: "Choose",
  selectionMode: "MULTIPLE",
  options: ids.map((id, i) => ({ id, content: `<p>Option ${i}</p>` })),
  correctOptionIds: [ids[0], ids[2]],
});
describe("multiple-choice grading and private definition", () => {
  it("compares sets without partial credit or order sensitivity", () => {
    expect(
      evaluateMultipleChoice(definition, {
        selectedOptionIds: [ids[2], ids[0]],
        displayOrder: [...ids].reverse(),
      }),
    ).toBe(true);
    for (const selectedOptionIds of [[ids[0]], [...ids], [ids[1]]])
      expect(
        evaluateMultipleChoice(definition, {
          selectedOptionIds,
          displayOrder: ids,
        }),
      ).toBe(false);
  });
  it("rejects malformed selection identity and order", () => {
    for (const selectedOptionIds of [
      [],
      [ids[0], ids[0]],
      ["00000000-0000-4000-8000-000000000099"],
    ])
      expect(() =>
        evaluateMultipleChoice(definition, {
          selectedOptionIds,
          displayOrder: ids,
        }),
      ).toThrow();
    expect(() =>
      evaluateMultipleChoice(definition, {
        selectedOptionIds: [ids[0]],
        displayOrder: [ids[0], ids[0], ids[2]],
      }),
    ).toThrow();
    expect(() =>
      evaluateMultipleChoice(
        { ...definition, selectionMode: "SINGLE", correctOptionIds: [ids[0]] },
        { selectedOptionIds: [ids[0], ids[1]], displayOrder: ids },
      ),
    ).toThrow();
  });
  it("validates nonempty unique options and single correct keys", () => {
    for (const next of [
      { options: definition.options.slice(0, 1) },
      { options: [definition.options[0], definition.options[0]] },
      { selectionMode: "SINGLE" },
      {
        options: definition.options.map((o) => ({
          ...o,
          content: "<p>&nbsp;</p>",
        })),
      },
      { explanationEnabled: true },
    ])
      expect(
        multipleChoiceSchema.safeParse({ ...definition, ...next }).success,
      ).toBe(false);
  });
  it("omits answer keys and explanations from learner definition", () => {
    const safe = publicChoice({ ...definition, explanation: "PRIVATE" });
    expect(safe).not.toHaveProperty("correctOptionIds");
    expect(safe).not.toHaveProperty("explanation");
  });
  it("sanitizes executable HTML and restricts images to private assets with alt text", () => {
    const html = sanitizeChoiceHtml(
      `<script>secret()</script><p onclick="bad()">Safe</p><img src="https://evil.test/p.png" alt="remote"><img src="cove-asset:${ids[0]}" alt="Diagram"><a href="javascript:bad()">link</a>`,
    );
    expect(html).not.toMatch(/secret|onclick|evil|javascript/);
    expect(html).toContain(`src="cove-asset:${ids[0]}"`);
    expect(sanitizeChoiceHtml(`<img src="cove-asset:${ids[0]}">`)).toBe("");
  });
  it("enforces asset manifests and rejects options emptied by sanitation", () => {
    const service = new MultipleChoiceService(
      new ConfigService({ MULTIPLE_CHOICE_ENABLED: "true" }),
    );
    const image = {
      ...definition,
      options: [
        {
          id: ids[0],
          content: `<img src="cove-asset:${ids[0]}" alt="diagram">`,
        },
        ...definition.options.slice(1),
      ],
    };
    expect(() => service.normalize(image, [], [])).toThrow(/manifest/);
    expect(service.normalize(image, [ids[0]], []).options[0].content).toContain(
      "diagram",
    );
    expect(() =>
      service.normalize(
        {
          ...definition,
          options: definition.options.map((o) => ({
            ...o,
            content: "<script>only</script>",
          })),
        },
        [],
        [],
      ),
    ).toThrow(/meaningful/);
  });
  it("stays disabled unless independently enabled", () => {
    const service = new MultipleChoiceService(
      new ConfigService({ GUI_ENABLED: "true", SHORT_ANSWER_ENABLED: "true" }),
    );
    expect(service.enabled()).toBe(false);
    expect(() => service.assertEnabled()).toThrow();
  });
});


describe("multiple-choice rollout configuration", () => {
  it.each([true, "true"])("accepts enabled configuration: %s", (value) => {
    const service = new MultipleChoiceService(new ConfigService({ MULTIPLE_CHOICE_ENABLED: value }));
    expect(service.enabled()).toBe(true);
    expect(() => service.assertEnabled()).not.toThrow();
  });
  it.each([false, "false", undefined])("blocks disabled configuration: %s", (value) => {
    const service = new MultipleChoiceService(new ConfigService({ MULTIPLE_CHOICE_ENABLED: value }));
    expect(service.enabled()).toBe(false);
    expect(() => service.assertEnabled()).toThrow("Multiple-choice submission is unavailable");
  });
});
