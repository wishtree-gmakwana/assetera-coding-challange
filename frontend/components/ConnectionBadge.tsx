"use client";

import type { ConnectionState } from "@/hooks/useTickStream";

const LOOK: Record<
  ConnectionState,
  { label: string; dot: string; text: string; ring: string; pulse: boolean }
> = {
  idle: {
    label: "Idle",
    dot: "bg-neutral-500",
    text: "text-neutral-400",
    ring: "border-neutral-800 bg-neutral-900/60",
    pulse: false,
  },
  connecting: {
    label: "Connecting",
    dot: "bg-brand-bright",
    text: "text-brand-bright",
    ring: "border-brand/40 bg-brand-soft",
    pulse: true,
  },
  live: {
    label: "Live",
    dot: "bg-up",
    text: "text-up",
    ring: "border-up/30 bg-up-soft",
    pulse: true,
  },
  stale: {
    label: "No data",
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "border-amber-500/30 bg-amber-500/10",
    pulse: true,
  },
  reconnecting: {
    label: "Reconnecting",
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "border-amber-500/30 bg-amber-500/10",
    pulse: true,
  },
  offline: {
    label: "Offline",
    dot: "bg-down",
    text: "text-down",
    ring: "border-down/30 bg-down-soft",
    pulse: false,
  },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const look = LOOK[state];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${look.ring} ${look.text}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {look.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${look.dot} animate-pulse-ring`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${look.dot}`} />
      </span>
      {look.label}
    </span>
  );
}
