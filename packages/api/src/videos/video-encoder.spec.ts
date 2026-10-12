import { describe, it, expect } from "vitest";
import { validateVideoProbe } from "./video-encoder.js";
const probe = {
  format: { duration: "21600" },
  streams: [
    { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "60/1" },
  ],
};
describe("video decoder admission", () => {
  it("accepts exactly six hours and rejects the next millisecond", () => {
    expect(validateVideoProbe(probe).durationMs).toBe(21600000);
    expect(() =>
      validateVideoProbe({ ...probe, format: { duration: "21600.001" } }),
    ).toThrow("UNSUPPORTED_VIDEO_OR_DURATION");
  });
  it("rejects audio-only, corrupt duration, unsafe dimensions and invalid frame rates", () => {
    for (const duration of ["0", "-1", "NaN", "Infinity"])
      expect(() =>
        validateVideoProbe({ ...probe, format: { duration } }),
      ).toThrow();
    expect(() => validateVideoProbe({ ...probe, streams: [] })).toThrow();
    for (const patch of [
      { width: 8193 },
      { height: 0 },
      { width: NaN },
      { avg_frame_rate: "0/0" },
      { avg_frame_rate: "0/1" },
      { avg_frame_rate: "61/1" },
    ])
      expect(() =>
        validateVideoProbe({
          ...probe,
          streams: [{ ...probe.streams[0], ...patch }],
        }),
      ).toThrow();
  });
});
