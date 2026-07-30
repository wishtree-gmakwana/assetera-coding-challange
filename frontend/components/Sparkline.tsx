"use client";

import { useId } from "react";

import type { Tick } from "@/lib/api";

const VIEW_W = 240;
const VIEW_H = 56;
const PAD = 3;

type Direction = -1 | 0 | 1;

/**
 * Recent history for one instrument.
 *
 * Hand-rolled SVG rather than a chart library: the whole thing is a polyline and
 * a gradient, and a charting dependency would want floats at the boundary — the
 * one thing a price must never become.
 */
export function Sparkline({
  ticks,
  direction,
  className,
}: {
  ticks: readonly Tick[];
  direction: Direction;
  className?: string;
}) {
  const id = useId();

  if (ticks.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className={className}
        aria-hidden
      >
        <line
          x1={0}
          y1={VIEW_H / 2}
          x2={VIEW_W}
          y2={VIEW_H / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 5"
          className="text-neutral-800"
        />
      </svg>
    );
  }

  const prices = ticks.map((t) => BigInt(t.price));
  let min = prices[0];
  let max = prices[0];
  for (const price of prices) {
    if (price < min) min = price;
    if (price > max) max = price;
  }
  const range = max - min;

  const usable = VIEW_H - PAD * 2;
  const points = prices.map((price, index) => {
    const x = (index / (prices.length - 1)) * VIEW_W;
    // The division is done in BigInt; only the bounded 0..1000 ratio — never a
    // price — is handed to Number.
    const ratio = range === 0n ? 500 : Number(((price - min) * 1000n) / range);
    const y = VIEW_H - PAD - (ratio / 1000) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke =
    direction > 0 ? "#34d399" : direction < 0 ? "#fb7185" : "#a5b4fc";
  const line = points.join(" ");
  const area = `${points[0]?.split(",")[0]},${VIEW_H} ${line} ${points[points.length - 1]?.split(",")[0]},${VIEW_H}`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Price history, last ${ticks.length} ticks`}
    >
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>

      <polygon points={area} fill={`url(#fill-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
