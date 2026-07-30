/**
 * Server-side fetches only. Uses SERVER_API_BASE_URL (http://backend:4000 under
 * compose) which does not resolve from a browser — importing this into a
 * "use client" module is a bug.
 */
import { SERVER_API_BASE_URL, type Instrument } from "./api";

/**
 * The instrument catalogue, fetched during the server render so the first paint
 * already has rows instead of a spinner.
 *
 * Never throws: the frontend image is built (and can be started) with no backend
 * reachable, and the page has to survive a backend restart mid-session. An empty
 * catalogue is a valid result — the client retries from the browser.
 */
export async function fetchCatalogue(): Promise<Instrument[]> {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/api/symbols`, {
      // The catalogue is static in practice, but a cached copy would outlive a
      // stack restart and silently desync the stream query.
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return [];

    return (await response.json()) as Instrument[];
  } catch {
    return [];
  }
}
