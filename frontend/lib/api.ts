/**
 * Shapes served by the backend. Nothing else in here is prescriptive —
 * fetch however you like.
 */

export interface Instrument {
  symbol: string;
  name: string;
  /** Number of decimal places `Tick.price` carries. */
  decimals: number;
}

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

export interface Snapshot {
  symbol: string;
  name: string;
  decimals: number;
  changePercent: number;
  ticks: Tick[];
}

/**
 * Two hostnames, because the browser and the Next.js server are on different
 * networks when this runs under docker-compose:
 *   - from the browser: http://localhost:4000
 *   - from inside the compose network: http://backend:4000
 */
export const BROWSER_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const SERVER_API_BASE_URL =
  process.env.API_BASE_URL ?? BROWSER_API_BASE_URL;
