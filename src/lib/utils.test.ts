import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, initialsOf } from "@/lib/utils";

describe("formatDuration", () => {
  it("formats minutes and padded seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("clamps negatives to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("initialsOf", () => {
  it("uses first and last name initials", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
  });

  it("uses the first two letters for a single name", () => {
    expect(initialsOf("Cher")).toBe("CH");
  });

  it("handles extra whitespace", () => {
    expect(initialsOf("  Grace   Brewster  ")).toBe("GB");
  });

  it("returns ? for empty input", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    const out = formatDate("2026-01-15T12:00:00.000Z");
    expect(out).toContain("2026");
    expect(out.length).toBeGreaterThan(8);
  });

  it("returns the raw string when parsing fails", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
