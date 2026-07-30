"use client";

import { useCallback, useEffect, useState } from "react";

import type { Instrument } from "@/lib/api";

const STORAGE_KEY = "assetera.watchlist.v1";

function read(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return null;
  }
}

/**
 * Which instruments the user is watching, persisted across reloads.
 *
 * Reading localStorage during render would desync the server HTML from the first
 * client render, so we start from the catalogue default and adopt the stored
 * selection in an effect after mount.
 */
export function useWatchlist(catalogue: readonly Instrument[]) {
  const all = catalogue.map((i) => i.symbol);
  const [watched, setWatched] = useState<string[]>(all);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = read();
    if (stored) setWatched(stored);
    setHydrated(true);
  }, []);

  // The catalogue is fetched, so it can arrive after mount — and a stored symbol
  // may have been retired since it was written. Anything the backend does not
  // know about would be silently dropped from the stream filter, and a filter
  // that ends up empty subscribes to *everything*, so intersect here instead.
  const known = new Set(all);
  const selected = watched.filter((s) => known.has(s));

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
  }, [watched, hydrated]);

  const toggle = useCallback((symbol: string) => {
    setWatched((current) =>
      current.includes(symbol)
        ? current.filter((s) => s !== symbol)
        : [...current, symbol],
    );
  }, []);

  const selectAll = useCallback(() => setWatched(catalogue.map((i) => i.symbol)), [catalogue]);
  const clear = useCallback(() => setWatched([]), []);

  // Keep catalogue order rather than click order, so the board does not reshuffle
  // when an instrument is removed and added back.
  const ordered = all.filter((s) => selected.includes(s));

  return { watched: ordered, hydrated, toggle, selectAll, clear };
}
