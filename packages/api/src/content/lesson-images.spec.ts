import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "../generated/prisma/client.js";
import { assertLessonImages, lessonImageIds } from "./lesson-images.js";

const own = "11111111-1111-4111-8111-111111111111";
const copied = "22222222-2222-4222-8222-222222222222";
const foreign = "33333333-3333-4333-8333-333333333333";
const img = (id: string) => `<img src="cove-asset:${id}" alt="x">`;
const scope = { academyId: "a0000000-0000-4000-8000-000000000001", courseId: "c0000000-0000-4000-8000-000000000001" };

function tx(ownedCount: number) {
  const count = vi.fn().mockResolvedValue(ownedCount);
  return { client: { manualAsset: { count } } as unknown as Prisma.TransactionClient, count };
}

describe("lessonImageIds", () => {
  it("finds each private image once, in either quote style and case", () => {
    expect(lessonImageIds(`${img(own)}<p>${img(own.toUpperCase())}</p><img src='cove-asset:${copied}'>`)).toEqual([own, copied]);
  });

  it("ignores ordinary images and text that only mentions an asset", () => {
    expect(lessonImageIds(`<img src="https://example.com/a.png"><p>cove-asset:${own}</p>`)).toEqual([]);
    expect(lessonImageIds(null)).toEqual([]);
  });
});

describe("assertLessonImages", () => {
  it("costs nothing for a statement without new images", async () => {
    const { client, count } = tx(0);
    await assertLessonImages(client, { ...scope, html: "<p>No pictures</p>" });
    await assertLessonImages(client, { ...scope, html: img(copied), previousHtml: `<p>${img(copied)}</p>` });
    expect(count).not.toHaveBeenCalled();
  });

  it("checks every new image of the course in one statement", async () => {
    const { client, count } = tx(2);
    await assertLessonImages(client, { ...scope, html: `${img(own)}${img(foreign)}${img(copied)}`, previousHtml: img(copied) });
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: {
      id: { in: [own, foreign] }, academyId: scope.academyId, courseId: scope.courseId, mimeType: { startsWith: "image/" },
    } });
  });

  it("refuses an image from another course or academy", async () => {
    const { client } = tx(1);
    await expect(assertLessonImages(client, { ...scope, html: `${img(own)}${img(foreign)}` }))
      .rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
  });
});
