import { describe, expect, it } from "vitest";
import { calculateBitrateKbps } from "./ffmpeg.js";

describe("calculateBitrateKbps", () => {
  it("keeps bitrate within the target budget", () => {
    const kbps = calculateBitrateKbps(600, 10, 320_000);
    expect(kbps).toBeGreaterThanOrEqual(24);
    expect(kbps).toBeLessThanOrEqual(140);
  });

  it("does not exceed source bitrate", () => {
    const kbps = calculateBitrateKbps(60, 60, 96_000);
    expect(kbps).toBe(96);
  });
});
