import { describe, expect, it } from "vitest";
import { formatDuration, shortId, timeAgo, titleCase } from "./format";

describe("formatDuration", () => {
  it("shows a dash for null (no incidents measured yet)", () => {
    expect(formatDuration(null)).toBe("—");
  });
  it.each([
    [0, "0s"],
    [59, "59s"],
    [60, "1m 0s"],
    [125, "2m 5s"],
    [3600, "1h 0m"],
    [3 * 3600 + 25 * 60, "3h 25m"],
    [86400, "1d 0h"],
    [90000, "1d 1h"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
  it("rounds fractional seconds (Postgres avg() returns floats)", () => {
    expect(formatDuration(59.6)).toBe("1m 0s");
  });
});

describe("timeAgo", () => {
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  it.each([
    [5, "just now"],
    [10 * 60, "10m ago"],
    [5 * 3600, "5h ago"],
    [3 * 86400, "3d ago"],
  ])("%s seconds ago reads as %s", (seconds, expected) => {
    expect(timeAgo(ago(seconds))).toBe(expected);
  });
  it("never shows negative time for a slightly-future timestamp (clock skew)", () => {
    expect(timeAgo(ago(-30))).toBe("just now");
  });
});

describe("small helpers", () => {
  it("titleCase", () => expect(titleCase("IDENTIFIED")).toBe("Identified"));
  it("shortId keeps the first 8 chars", () => expect(shortId("12345678-aaaa-bbbb")).toBe("12345678"));
});
