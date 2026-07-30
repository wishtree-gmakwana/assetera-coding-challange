/**
 * Price maths for the browser.
 *
 * Prices arrive as integer strings in minor units plus a `decimals` field. The
 * catalogue runs to 18 decimals (ASTR-RE1 = "1234567890123456789"), which is far
 * past Number.MAX_SAFE_INTEGER — so nothing in here may put a price through
 * Number(), parseFloat, or a numeric comparison. Everything stays on string or
 * BigInt.
 *
 * The backend has an equivalent `formatPrice` in backend/src/prices.ts, but that
 * is a separate package and is never shipped to the browser. This is the client
 * copy, not an import.
 */

/**
 * Render a minor-unit integer string as a decimal string.
 *
 *   formatPrice("18734", 2)                  === "187.34"
 *   formatPrice("5", 2)                      === "0.05"
 *   formatPrice("1234567890123456789", 18)   === "1.234567890123456789"
 */
export function formatPrice(price: string, decimals: number): string {
  if (decimals <= 0) return price;

  const negative = price.startsWith("-");
  const digits = (negative ? price.slice(1) : price).padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Thousands separators, by string slicing — the whole part can exceed 2^53. */
export function groupDigits(whole: string): string {
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;

  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - i;
    out += digits[i];
    if (fromRight > 1 && fromRight % 3 === 1) out += ",";
  }

  return `${negative ? "-" : ""}${out}`;
}

/**
 * Split a price into the part worth reading at a glance and the precision tail.
 *
 * ASTR-RE1 carries 18 decimals; showing all of them at full weight turns the
 * board into noise, and truncating them would be the float bug in disguise. So
 * we render every digit but de-emphasise everything past the second decimal.
 */
export function splitPrice(
  price: string,
  decimals: number,
): { lead: string; tail: string } {
  const formatted = formatPrice(price, decimals);
  const dot = formatted.indexOf(".");

  if (dot === -1) return { lead: groupDigits(formatted), tail: "" };

  const whole = groupDigits(formatted.slice(0, dot));
  const fraction = formatted.slice(dot + 1);

  return {
    lead: `${whole}.${fraction.slice(0, 2)}`,
    tail: fraction.slice(2),
  };
}

/** BigInt comparison. Used for direction, min and max — never a float subtract. */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Move from `first` to `last`, in basis points (1bp = 0.01%).
 *
 * Deliberately not the backend's `changePercent`: that one calls Number() on the
 * price (which destroys ASTR-RE1) and divides by the *last* price instead of the
 * first, so a 100 -> 200 move reports +50%. See the README.
 *
 * Both prices share the same scale, so `decimals` cancels out and is not needed.
 * The division happens in BigInt; only the bounded basis-point result — a small
 * integer — becomes a Number.
 */
export function changeBasisPoints(
  first: string | null | undefined,
  last: string | null | undefined,
): number | null {
  if (first == null || last == null) return null;

  const from = BigInt(first);
  if (from === 0n) return null;

  return Number(((BigInt(last) - from) * 10000n) / from);
}

/** "+1.23%" / "-0.40%" / "0.00%" from a basis-point integer. */
export function formatBasisPoints(bps: number | null): string {
  if (bps === null) return "—";
  const percent = (bps / 100).toFixed(2);
  return bps > 0 ? `+${percent}%` : `${percent}%`;
}
