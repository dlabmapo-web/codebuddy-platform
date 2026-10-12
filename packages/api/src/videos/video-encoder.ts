import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { videoMaxDurationMs } from "@cove/shared";
export class InvalidVideo extends Error {}
async function command(
  binary: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
  signal?: AbortSignal,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8" },
    });
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    let output = "",
      settled = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(output);
    };
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 2_000_000) {
        child.kill("SIGKILL");
        finish(new InvalidVideo("Probe output exceeds bounds"));
      }
    });
    child.on("error", () => finish(new Error("TRANSIENT_ENCODER_UNAVAILABLE")));
    child.on("exit", (code, signal) =>
      finish(
        code === 0
          ? undefined
          : new InvalidVideo(
              signal ? "MEDIA_PROCESSING_TIMEOUT" : "UNSUPPORTED_VIDEO",
            ),
      ),
    );
  });
}
type Probe = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type: string;
    codec_name?: string;
    duration?: string;
    avg_frame_rate?: string;
    width: number;
    height: number;
  }>;
};
export function validateVideoProbe(probe: Probe) {
  const video = probe.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    ),
    audio = probe.streams?.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
  const durationMs = Math.ceil(
    Number(probe.format?.duration ?? video?.duration) * 1000,
  );
  const [numerator, denominator] = (video?.avg_frame_rate ?? "0/1")
    .split("/")
    .map(Number);
  if (
    !video ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > videoMaxDurationMs ||
    !Number.isFinite(video.width) ||
    !Number.isFinite(video.height) ||
    video.width > 8192 ||
    video.height > 8192 ||
    video.width <= 0 ||
    video.height <= 0 ||
    !Number.isFinite(numerator / denominator) ||
    numerator / denominator <= 0 ||
    numerator / denominator > 60
  )
    throw new InvalidVideo("UNSUPPORTED_VIDEO_OR_DURATION");
  return { video, audio, durationMs };
}
export async function encodeVideo(
  source: string,
  output: string,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + 86400000;
  const remaining = () => Math.max(1, deadline - Date.now());
  const formats = [
    "-format_whitelist",
    "mov,matroska,webm,avi,asf,flv,mpeg,mpegts,mxf,gxf",
  ];
  const probe = JSON.parse(
    await command(
      process.env.FFPROBE_PATH ?? "ffprobe",
      [
        "-v",
        "error",
        ...formats,
        "-protocol_whitelist",
        "file,pipe",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        source,
      ],
      60000,
      undefined,
      signal,
    ),
  );
  const { video, audio, durationMs } = validateVideoProbe(probe);
  await mkdir(output, { recursive: true });
  const base = [
    "-nostdin",
    "-y",
    "-v",
    "error",
    ...formats,
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    source,
  ];
  const heights = [360, 480, 720, 1080].filter((h) => h <= video.height);
  if (!heights.length)
    heights.push(Math.max(2, Math.floor(video.height / 2) * 2));
  const renditions: Array<{ height: number; path: string }> = [];
  for (const height of heights) {
    const folder = `r${height}`;
    await mkdir(join(output, folder));
    const args = [
      ...base,
      "-map",
      "0:v:0",
      ...(audio ? ["-map", "0:a:0"] : []),
      "-vf",
      `scale=-2:${height}`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      ...(audio ? ["-c:a", "aac", "-b:a", "128k"] : []),
      "-force_key_frames",
      "expr:gte(t,n_forced*6)",
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      `${folder}/segment%06d.ts`,
      `${folder}/index.m3u8`,
    ];
    await command(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      args,
      remaining(),
      output,
      signal,
    );
    renditions.push({ height, path: `${folder}/index.m3u8` });
  }
  const highest = heights.at(-1)!;
  await command(
    process.env.FFMPEG_PATH ?? "ffmpeg",
    [
      ...base,
      "-map",
      "0:v:0",
      ...(audio ? ["-map", "0:a:0"] : []),
      "-vf",
      `scale=-2:${highest}`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      ...(audio ? ["-c:a", "aac", "-b:a", "128k"] : []),
      "-movflags",
      "+faststart",
      "playback.mp4",
    ],
    remaining(),
    output,
    signal,
  );
  await command(
    process.env.FFMPEG_PATH ?? "ffmpeg",
    [...base, "-frames:v", "1", "-vf", "scale=640:-2", "poster.jpg"],
    60000,
    output,
    signal,
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(output, "master.m3u8"),
    "#EXTM3U\n#EXT-X-VERSION:3\n" +
      renditions
        .map(
          (r) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(r.height * 6000)},RESOLUTION=${Math.floor((video.width * r.height) / video.height / 2) * 2}x${r.height}\n${r.path}\n`,
        )
        .join(""),
  );
  const files: Array<{ path: string; size: number }> = [];
  async function walk(relative = "") {
    for (const entry of await readdir(join(output, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else
        files.push({ path: name, size: (await stat(join(output, name))).size });
    }
  }
  await walk();
  if (files.reduce((sum, f) => sum + f.size, 0) > 35 * 1024 ** 3)
    throw new InvalidVideo("MEDIA_OUTPUT_LIMIT");
  return { durationMs, renditions, files, metadata: { width: video.width, height: video.height, videoCodec: video.codec_name ?? "unknown", audio: Boolean(audio), averageFrameRate: video.avg_frame_rate ?? "unknown" } };
}
