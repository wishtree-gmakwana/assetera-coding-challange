"use client";

import { useCallback, useEffect, useState } from "react";

import { ConnectionBadge } from "@/components/ConnectionBadge";
import { InstrumentRow } from "@/components/InstrumentRow";
import { WatchlistPicker } from "@/components/WatchlistPicker";
import { RING_CAPACITY, useTickStream } from "@/hooks/useTickStream";
import { useWatchlist } from "@/hooks/useWatchlist";
import type { Instrument } from "@/lib/api";
import { fetchCatalogue } from "@/lib/api.client";

/** The window every change figure is measured over. Labelled in the UI, because
 *  an unlabelled percentage gets read as a daily move. */
const WINDOW_LABEL = `${Math.round((RING_CAPACITY * 500) / 1000)}s`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/40 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="tnum mt-0.5 font-mono text-sm text-neutral-200">{value}</div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <li className="relative overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-neutral-800" />
          <div className="h-2 w-32 rounded bg-neutral-800/60" />
        </div>
        <div className="h-6 w-28 rounded bg-neutral-800" />
      </div>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-neutral-700/10 to-transparent" />
    </li>
  );
}

export function TickerBoard({ initialCatalogue }: { initialCatalogue: Instrument[] }) {
  // The server render fetches the catalogue, but the backend may have been down
  // at that moment (or may have restarted since). Recover from the browser
  // rather than shipping a permanently empty page.
  const [catalogue, setCatalogue] = useState(initialCatalogue);
  const [catalogueError, setCatalogueError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (catalogue.length > 0) return;

    const controller = new AbortController();
    fetchCatalogue(controller.signal)
      .then((instruments) => {
        setCatalogue(instruments);
        setCatalogueError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogueError(true);
      });

    return () => controller.abort();
  }, [catalogue.length, retry]);

  const { watched, toggle, selectAll, clear } = useWatchlist(catalogue);
  const { board, connection, lastEventAt, updates } = useTickStream(catalogue, watched);

  // Only used to re-render the "last update" clock while the stream is quiet.
  const [, tickClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tickClock((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggle = useCallback((symbol: string) => toggle(symbol), [toggle]);

  const stale = connection === "reconnecting" || connection === "offline" || connection === "stale";
  const secondsAgo =
    lastEventAt === null ? null : Math.max(0, Math.round((Date.now() - lastEventAt) / 1000));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-bright">
            Assetera
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Live Ticker</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tokenised and listed instruments, streamed from the market feed.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <ConnectionBadge state={connection} />
          <span className="tnum font-mono text-[11px] text-neutral-600">
            {secondsAgo === null
              ? "awaiting first tick"
              : secondsAgo === 0
                ? "updated just now"
                : `updated ${secondsAgo}s ago`}
          </span>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Watching" value={`${watched.length} / ${catalogue.length}`} />
        <Stat label="Updates" value={updates.toLocaleString("en-US")} />
        <Stat label="Window" value={WINDOW_LABEL} />
        <Stat label="Transport" value="SSE" />
      </div>

      <div className="mb-6">
        <WatchlistPicker
          catalogue={catalogue}
          watched={watched}
          onToggle={handleToggle}
          onSelectAll={selectAll}
          onClear={clear}
        />
      </div>

      {catalogue.length === 0 ? (
        catalogueError ? (
          <div className="rounded-xl border border-down/30 bg-down-soft p-6 text-center">
            <p className="text-sm text-down">Could not reach the backend.</p>
            <p className="mt-1 text-xs text-neutral-400">
              Check that it is up on port 4000, then try again.
            </p>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="mt-4 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </ul>
        )
      ) : watched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/20 p-10 text-center">
          <p className="text-sm text-neutral-400">Nothing on the watchlist.</p>
          <p className="mt-1 text-xs text-neutral-600">
            Pick instruments from the catalogue above. No stream is open while this is empty.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {watched.map((symbol) => {
            const state = board[symbol];
            if (!state) return null;
            return (
              <InstrumentRow
                key={symbol}
                state={state}
                windowLabel={WINDOW_LABEL}
                muted={stale}
                onRemove={() => handleToggle(symbol)}
              />
            );
          })}
        </ul>
      )}

      <footer className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-900 pt-5 font-mono text-[11px] text-neutral-600">
        <span>Prices are integer minor units — rendered via BigInt, never a float.</span>
        <span className="text-neutral-800">·</span>
        <span>Change is measured over the {WINDOW_LABEL} window, not the trading day.</span>
      </footer>
    </main>
  );
}
