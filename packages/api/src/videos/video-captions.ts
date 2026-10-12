import { BadRequestException } from "@nestjs/common";
export function normalizeVideoCaption(content: string, durationMs: number) {
  content = content.replace(/^\uFEFF/, "");
  if (
    Buffer.byteLength(content) > 2_000_000 ||
    !/^WEBVTT(?:\s|$)/.test(content) ||
    content.includes("\0")
  )
    throw new BadRequestException(
      "Use a valid VTT subtitle file (maximum 2 MB)",
    );
  const blocks = content
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/);
  const out = ["WEBVTT"];
  let previous = -1,
    cues = 0;
  const milliseconds = (s: string) => {
    const parts = s.split(":").map(Number);
    if (parts.slice(-2).some((v) => v >= 60))
      throw new BadRequestException("Invalid caption timestamp");
    return Math.round(
      (parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1]) * 1000,
    );
  };
  for (const block of blocks.slice(1)) {
    if (/^NOTE(?:\s|$)/.test(block)) continue;
    const lines = block.split("\n");
    const index = lines.findIndex((x) => x.includes("-->"));
    if (index < 0 || index > 1)
      throw new BadRequestException("Invalid caption cue");
    const timing = lines[index].match(
      /^((?:\d{2,}:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})$/,
    );
    if (!timing) throw new BadRequestException("Invalid caption timing");
    const start = milliseconds(timing[1]),
      end = milliseconds(timing[2]);
    if (start < previous || end <= start || end > durationMs || ++cues > 20000)
      throw new BadRequestException(
        "Caption times exceed the video or are out of order",
      );
    previous = start;
    const text = lines.slice(index + 1).join("\n");
    if (!text.trim() || /[<>]/.test(text))
      throw new BadRequestException(
        "Use plain subtitle text without HTML or styles",
      );
    out.push(`${timing[1]} --> ${timing[2]}\n${text}`);
  }
  if (!cues) throw new BadRequestException("Subtitle file contains no cues");
  return out.join("\n\n") + "\n";
}
