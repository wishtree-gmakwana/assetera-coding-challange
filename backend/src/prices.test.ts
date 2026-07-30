import { describe, expect, it } from "vitest";

import { formatPrice } from "./prices.js";

describe("formatPrice", () => {
  it("places the decimal point", () => {
    expect(formatPrice("18734", 2)).toBe("187.34");
    expect(formatPrice("41288", 2)).toBe("412.88");
  });

  it("pads values smaller than one major unit", () => {
    expect(formatPrice("5", 2)).toBe("0.05");
    expect(formatPrice("0", 4)).toBe("0.0000");
  });

  it("handles high-precision instruments without losing digits", () => {
    expect(formatPrice("1234567890123456789", 18)).toBe("1.234567890123456789");
  });

  it("passes integer instruments straight through", () => {
    expect(formatPrice("42", 0)).toBe("42");
  });
});
