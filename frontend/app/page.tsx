import { TickerBoard } from "@/components/TickerBoard";
import { fetchCatalogue } from "@/lib/api.server";

// Fetched per request, not at build time: the frontend image is built with no
// backend running, and a build-time copy would outlive a stack restart.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Server-side, over the compose network — the browser cannot resolve
  // http://backend:4000. Everything live is fetched client-side instead.
  const catalogue = await fetchCatalogue();

  return <TickerBoard initialCatalogue={catalogue} />;
}
