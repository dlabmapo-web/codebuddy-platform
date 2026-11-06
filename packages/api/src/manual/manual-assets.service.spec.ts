import { describe, expect, it } from "vitest";

import { lessonAssetMime } from "./manual-assets.service.js";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
const gif = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
const bmp = Buffer.concat([Buffer.from("BM"), Buffer.alloc(40)]);
const ftyp = (major: string, ...compatible: string[]) => {
  const brands = Buffer.from([major, "\0\0\0\0", ...compatible].join(""), "latin1");
  const size = Buffer.alloc(4); size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from("ftyp"), brands, Buffer.alloc(16)]);
};
const svg = (body: string) => Buffer.from(body);

describe("lessonAssetMime", () => {
  it.each([
    ["diagram.png", png, "image/png"],
    ["photo.jpg", jpeg, "image/jpeg"],
    ["photo.JPEG", jpeg, "image/jpeg"],
    ["moving.gif", gif, "image/gif"],
    ["screen.webp", webp, "image/webp"],
    ["photo.avif", ftyp("avif", "mif1"), "image/avif"],
    ["paint.bmp", bmp, "image/bmp"],
    ["shape.svg", svg('<?xml version="1.0"?>\n<!-- drawn by hand -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" fill="red"/></svg>'), "image/svg+xml"],
  ])("accepts %s by its content", (name, bytes, mime) => {
    expect(lessonAssetMime(name, bytes)).toBe(mime);
  });

  it("keeps Turtle data files as UTF-8 text", () => {
    expect(lessonAssetMime("data.csv", Buffer.from("a,b\n1,2"))).toBe("text/plain");
    expect(lessonAssetMime("data.json", Buffer.from('{"a":1}'))).toBe("application/json");
    expect(() => lessonAssetMime("data.json", Buffer.from("{"))).toThrow("Invalid data file");
  });

  it("refuses a file whose content is not the picture its name says", () => {
    expect(() => lessonAssetMime("photo.png", jpeg)).toThrow("not a valid PNG image");
    expect(() => lessonAssetMime("photo.webp", png)).toThrow("not a valid WEBP image");
  });

  it("explains that iPhone HEIC photos must be exported first", () => {
    expect(() => lessonAssetMime("IMG_0001.heic", ftyp("heic", "mif1", "heic"))).toThrow("export the photo as JPG or PNG");
    expect(() => lessonAssetMime("IMG_0001.jpg", ftyp("mif1", "heic"))).toThrow("HEIC");
  });

  it("refuses unknown types with the list of supported ones", () => {
    expect(() => lessonAssetMime("notes.pdf", Buffer.from("%PDF-1.7"))).toThrow("PNG, JPG, GIF, WebP, AVIF, BMP or SVG");
  });

  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/x.png"/></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(//tracker.example/x)"/></svg>'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>'],
  ])("refuses an SVG that is not a static picture: %s", (body) => {
    expect(() => lessonAssetMime("shape.svg", svg(body))).toThrow(/static picture|Not an SVG/);
  });

  it("refuses an SVG that is not an SVG document", () => {
    expect(() => lessonAssetMime("shape.svg", svg("<html><body/></html>"))).toThrow("Not an SVG image");
    expect(() => lessonAssetMime("shape.svg", Buffer.from([0xff, 0xfe, 0x00]))).toThrow("UTF-8");
  });
});
