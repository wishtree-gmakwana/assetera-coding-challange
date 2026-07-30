/**
 * Price helpers.
 *
 * Prices travel as integer strings in minor units plus a `decimals` field, the
 * same way the settlement layer represents them. Nothing in here should turn a
 * price into a float.
 */

export interface Tick {
  symbol: string;
  /** Integer amount in minor units, as a string. */
  price: string;
  decimals: number;
  /** Epoch milliseconds. */
  ts: number;
  /** Monotonic per-symbol sequence number. */
  seq: number;
}

/**
 * Render a minor-unit integer string as a human-readable decimal string.
 *
 *   formatPrice("18734", 2)  === "187.34"
 *   formatPrice("5", 2)      === "0.05"
 */
export function formatPrice(price: string, decimals: number): string {
  if (decimals === 0) return price;

  const negative = price.startsWith("-");
  const digits = (negative ? price.slice(1) : price).padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Percentage move between the first and the last price of a window.
 * Returns 0 for an empty or single-entry window.
 */
export function changePercent(ticks: readonly Tick[]): number {
  if (ticks.length < 2) return 0;

  const first = Number(ticks[0]!.price);
  const last = Number(ticks[ticks.length - 1]!.price);

  return ((last - first) / last) * 100;
}

/**
 * Fixed-size in-memory window of the most recent ticks per symbol.
 * This is the snapshot clients read before they attach to the stream.
 */
export class TickWindow {
  private readonly buffers = new Map<string, Tick[]>();

  constructor(private readonly capacity: number) {}

  push(tick: Tick): void {
    let buffer = this.buffers.get(tick.symbol);
    if (!buffer) {
      buffer = [];
      this.buffers.set(tick.symbol, buffer);
    }

    buffer.push(tick);
    if (buffer.length > this.capacity) {
      buffer.splice(0, buffer.length - this.capacity);
    }
  }

  recent(symbol: string, limit: number): Tick[] {
    const buffer = this.buffers.get(symbol) ?? [];
    return buffer.slice(-limit);
  }
}
