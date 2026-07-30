"use client";

import { Sparkline } from "@/components/Sparkline";
import type { SymbolState } from "@/hooks/useTickStream";
import { changeBasisPoints, formatBasisPoints, splitPrice } from "@/lib/prices";

/**
 * The price itself, in two spans: the part you read at a glance, and the
 * precision tail.
 *
 * ASTR-RE1 carries 18 decimals. Rounding it to look tidy would be exactly the
 * float bug this challenge is about, so every digit is on the page — the tail is
 * just quieter, and it wraps rather than being clipped.
 */
function PriceReadout({
  price,
  decimals,
  seq,
  direction,
  muted,
}: {
  price: string | null;
  decimals: number;
  seq: number | null;
  direction: -1 | 0 | 1;
  muted: boolean;
}) {
  if (price === null) {
    // No tick yet — a restarted backend serves an empty snapshot until the feed
    // publishes again. A placeholder zero would be a fabricated price.
    return <span className="tnum font-mono text-2xl text-neutral-700">—</span>;
  }

  const { lead, tail } = splitPrice(price, decimals);

  // Remounting on each seq restarts the animation; that is what the key is for.
  // `direction` is a BigInt comparison, never a float delta.
  const flash =
    direction > 0 ? "animate-tick-up" : direction < 0 ? "animate-tick-down" : "";

  return (
    <span
      className={`tnum flex flex-wrap items-baseline justify-end font-mono tracking-tight transition-opacity duration-500 ${
        muted ? "opacity-40" : "opacity-100"
      }`}
    >
      <span key={seq ?? "static"} className={`text-2xl font-semibold text-neutral-50 ${flash}`}>
        {lead}
      </span>
      {tail && <span className="text-sm text-neutral-500">{tail}</span>}
    </span>
  );
}

function ChangePill({ bps }: { bps: number | null }) {
  const direction = bps === null ? 0 : Math.sign(bps);

  const tone =
    direction > 0
      ? "border-up/30 bg-up-soft text-up"
      : direction < 0
        ? "border-down/30 bg-down-soft text-down"
        : "border-neutral-800 bg-neutral-900 text-neutral-400";

  // Colour is never the only signal — the glyph carries it too.
  const glyph = direction > 0 ? "▲" : direction < 0 ? "▼" : "—";

  return (
    <span
      className={`tnum inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-sm ${tone}`}
    >
      <span aria-hidden className="text-[0.7em]">
        {glyph}
      </span>
      {formatBasisPoints(bps)}
    </span>
  );
}

export function InstrumentRow({
  state,
  windowLabel,
  muted,
  onRemove,
}: {
  state: SymbolState;
  windowLabel: string;
  muted: boolean;
  onRemove: () => void;
}) {
  const { instrument, latest, windowFirst, ticks, lastDirection } = state;
  const bps = changeBasisPoints(windowFirst?.price, latest?.price);
  const direction: -1 | 0 | 1 = bps === null || bps === 0 ? 0 : bps > 0 ? 1 : -1;

  return (
    <li className="group animate-rise-in rounded-xl border border-neutral-800/80 bg-neutral-900/40 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 p-4 lg:grid-cols-[12rem_minmax(0,1fr)_13rem_7rem_auto]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wide text-neutral-100">
              {instrument.symbol}
            </span>
            <span className="rounded border border-neutral-800 px-1.5 py-px font-mono text-[10px] text-neutral-500">
              {instrument.decimals}d
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{instrument.name}</p>
        </div>

        <div className="order-last col-span-2 h-10 w-full min-w-0 lg:order-none lg:col-span-1 lg:h-9">
          <Sparkline
            ticks={ticks}
            direction={direction}
            className="h-full w-full opacity-80 transition-opacity group-hover:opacity-100"
          />
        </div>

        <div className="min-w-0 text-right">
          <PriceReadout
            price={latest?.price ?? null}
            decimals={latest?.decimals ?? instrument.decimals}
            seq={latest?.seq ?? null}
            direction={lastDirection}
            muted={muted}
          />
        </div>

        <div className="flex flex-col items-end gap-1 lg:items-start">
          <ChangePill bps={bps} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
            {windowLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Stop watching ${instrument.symbol}`}
          className="col-start-2 row-start-1 justify-self-end rounded-lg border border-transparent p-1.5 text-neutral-600 opacity-0 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:opacity-100 group-hover:opacity-100 lg:col-start-auto lg:row-start-auto"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}
