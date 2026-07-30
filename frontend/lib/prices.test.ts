import { describe, expect, it } from "vitest";

import {
  changeBasisPoints,
  compare,
  formatBasisPoints,
  formatPrice,
  groupDigits,
  splitPrice,
} from "./prices";

describe("formatPrice", () => {
  it("places the decimal point", () => {
    expect(formatPrice("18734", 2)).toBe("187.34");
  });

  it("pads values smaller than one unit", () => {
    expect(formatPrice("5", 2)).toBe("0.05");
  });

  it("keeps every digit at 18 decimals", () => {
    // The whole point: this value is larger than Number.MAX_SAFE_INTEGER, so any
    // float in the path loses the tail.
    expect(formatPrice("1234567890123456789", 18)).toBe("1.234567890123456789");
  });

  it("preserves the sign", () => {
    expect(formatPrice("-5", 2)).toBe("-0.05");
  });

  it("passes through zero decimals", () => {
    expect(formatPrice("42", 0)).toBe("42");
  });
});

describe("groupDigits", () => {
  it("groups in threes from the right", () => {
    expect(groupDigits("6431900")).toBe("6,431,900");
    expect(groupDigits("100")).toBe("100");
    expect(groupDigits("1000")).toBe("1,000");
    expect(groupDigits("-1234567")).toBe("-1,234,567");
  });
});

describe("splitPrice", () => {
  it("keeps two decimals in the lead and the rest in the tail", () => {
    expect(splitPrice("1234567890123456789", 18)).toEqual({
      lead: "1.23",
      tail: "4567890123456789",
    });
  });

  it("leaves nothing in the tail for two-decimal instruments", () => {
    expect(splitPrice("6431900", 2)).toEqual({ lead: "64,319.00", tail: "" });
  });

  it("splits four-decimal instruments after the second digit", () => {
    expect(splitPrice("24178500", 4)).toEqual({ lead: "2,417.85", tail: "00" });
  });
});

describe("changeBasisPoints", () => {
  it("measures the move against the first price, not the last", () => {
    // The backend's changePercent divides by `last` and reports +50% here.
    expect(changeBasisPoints("100", "200")).toBe(10000);
  });

  it("signs a downward move", () => {
    expect(changeBasisPoints("200", "100")).toBe(-5000);
  });

  it("survives an 18-decimal move that a float would round away", () => {
    const first = "1000000000000000000";
    const last = "1010000000000000000";
    expect(changeBasisPoints(first, last)).toBe(100); // +1.00%
  });

  it("does not lose a move in the last digit of an 18-decimal price", () => {
    const first = "1234567890123456789";
    const last = "1234567890123456790";
    // Below one basis point, so it rounds to 0 — but it must not throw, and the
    // underlying comparison still sees the difference.
    expect(changeBasisPoints(first, last)).toBe(0);
    expect(compare(first, last)).toBe(-1);
  });

  it("guards against a zero denominator", () => {
    expect(changeBasisPoints("0", "100")).toBeNull();
  });

  it("returns null when either side is missing", () => {
    expect(changeBasisPoints(undefined, "100")).toBeNull();
    expect(changeBasisPoints("100", null)).toBeNull();
  });
});

describe("compare", () => {
  it("orders values that differ past the 17th digit", () => {
    const a = "1234567890123456789";
    const b = "1234567890123456788";
    // Number(a) === Number(b) — this is the assertion a float implementation
    // cannot make.
    expect(Number(a) === Number(b)).toBe(true);
    expect(compare(a, b)).toBe(1);
    expect(compare(b, a)).toBe(-1);
    expect(compare(a, a)).toBe(0);
  });
});

describe("formatBasisPoints", () => {
  it("signs and scales to percent", () => {
    expect(formatBasisPoints(123)).toBe("+1.23%");
    expect(formatBasisPoints(-40)).toBe("-0.40%");
    expect(formatBasisPoints(0)).toBe("0.00%");
    expect(formatBasisPoints(null)).toBe("—");
  });
});
