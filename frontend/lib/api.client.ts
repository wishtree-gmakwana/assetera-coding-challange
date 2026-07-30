/**
 * Browser-side fetches only. Uses BROWSER_API_BASE_URL (http://localhost:4000
 * under compose); that hostname does not resolve from inside the frontend
 * container, so nothing here may run during a server render.
 */
import { BROWSER_API_BASE_URL, type Instrument, type Snapshot } from "./api";

/**
 * Fallback for when the server render could not reach the backend (backend still
 * booting, or restarted between the render and the hydrate).
 */
export async function fetchCatalogue(signal?: AbortSignal): Promise<Instrument[]> {
  const response = await fetch(`${BROWSER_API_BASE_URL}/api/symbols`, { signal });
  if (!response.ok) throw new Error(`catalogue: HTTP ${response.status}`);
  return (await response.json()) as Instrument[];
}

/**
 * Recent ticks for one instrument. There is no batch endpoint, so a watchlist of
 * N costs N requests — fine for a catalogue of five.
 *
 * A freshly restarted backend answers with `ticks: []` (the window is process
 * memory, there is no backfill). That is a valid response, not an error.
 */
export async function fetchSnapshot(
  symbol: string,
  limit: number,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const url = `${BROWSER_API_BASE_URL}/api/snapshot/${encodeURIComponent(symbol)}?limit=${limit}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`snapshot ${symbol}: HTTP ${response.status}`);
  return (await response.json()) as Snapshot;
}

/**
 * One stream URL for the whole watchlist.
 *
 * Callers must never pass an empty list: the backend treats a filter that
 * matches nothing as "subscribe to everything" (server.ts:76-81), so an empty
 * watchlist has to mean *no connection at all*, not an empty query string.
 */
export function streamUrl(symbols: readonly string[]): string {
  return `${BROWSER_API_BASE_URL}/api/stream?symbols=${encodeURIComponent(symbols.join(","))}`;
}
