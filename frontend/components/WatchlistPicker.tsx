"use client";

import type { Instrument } from "@/lib/api";

export function WatchlistPicker({
  catalogue,
  watched,
  onToggle,
  onSelectAll,
  onClear,
}: {
  catalogue: readonly Instrument[];
  watched: readonly string[];
  onToggle: (symbol: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const isWatched = (symbol: string) => watched.includes(symbol);

  return (
    <section className="rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Catalogue
        </h2>
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={watched.length === catalogue.length}
            className="rounded px-2 py-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-30"
          >
            All
          </button>
          <span className="text-neutral-700">·</span>
          <button
            type="button"
            onClick={onClear}
            disabled={watched.length === 0}
            className="rounded px-2 py-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-30"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {catalogue.map((instrument) => {
          const on = isWatched(instrument.symbol);
          return (
            <button
              key={instrument.symbol}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onToggle(instrument.symbol)}
              title={instrument.name}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs transition ${
                on
                  ? "border-brand/50 bg-brand-soft text-brand-bright"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-brand-bright" : "bg-neutral-700"}`}
              />
              {instrument.symbol}
            </button>
          );
        })}
      </div>
    </section>
  );
}
