"use client";

import { useEffect, useReducer, useState } from "react";

import type { Instrument, Tick } from "@/lib/api";
import { fetchSnapshot, streamUrl } from "@/lib/api.client";
import { compare } from "@/lib/prices";

// ---------------------------------------------------------------------------
// Tuning. All of it derives from FEED_INTERVAL_MS=500 (see .env) — kept together
// so the assumption is visible in one place rather than sprinkled through the
// reconnect logic.
// ---------------------------------------------------------------------------

/** ~60s of history at one tick per 500ms. Enough for a sparkline, bounded so a
 *  tab left open overnight does not grow without limit. */
export const RING_CAPACITY = 120;

/** Silence longer than this means the connection is dead, not quiet. */
const STALL_MS = 4000;
const WATCHDOG_INTERVAL_MS = 1000;

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 10_000;
const RETRY_JITTER = 0.2;
/** After this many failed attempts we stop calling it a blip. */
const OFFLINE_AFTER_ATTEMPTS = 3;

/** Collapse a burst of watchlist toggles into one reconnect. */
const WATCHLIST_DEBOUNCE_MS = 300;

/** A seq this far below the last one is a restarted feed, not a stray packet. */
const SEQ_EPOCH_SLACK = 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type ConnectionState =
  | "idle"
  | "connecting"
  | "live"
  | "stale"
  | "reconnecting"
  | "offline";

export interface SymbolState {
  instrument: Instrument;
  /** Ring buffer, oldest first, capped at RING_CAPACITY. */
  ticks: Tick[];
  latest: Tick | null;
  /** Baseline for the window change — the oldest tick still in the ring. */
  windowFirst: Tick | null;
  lastSeq: number | null;
  /** Direction of the most recent tick, for the flash. */
  lastDirection: -1 | 0 | 1;
  updatedAt: number | null;
}

export type Board = Record<string, SymbolState>;

type Action =
  | { type: "catalogue"; catalogue: readonly Instrument[] }
  | { type: "seed"; symbol: string; ticks: readonly Tick[] }
  | { type: "tick"; tick: Tick };

function emptyState(instrument: Instrument): SymbolState {
  return {
    instrument,
    ticks: [],
    latest: null,
    windowFirst: null,
    lastSeq: null,
    lastDirection: 0,
    updatedAt: null,
  };
}

function initBoard(catalogue: readonly Instrument[]): Board {
  const board: Board = {};
  for (const instrument of catalogue) board[instrument.symbol] = emptyState(instrument);
  return board;
}

/**
 * Append one tick, absorbing the two ways the given backend delivers ticks we
 * have already seen: the snapshot overlaps the stream on connect, and Redis
 * pub/sub can redeliver across a reconnect.
 */
function pushTick(state: SymbolState, tick: Tick): SymbolState {
  const { lastSeq } = state;

  if (lastSeq !== null && tick.seq <= lastSeq) {
    const epochReset = tick.seq <= 1 || tick.seq < lastSeq - SEQ_EPOCH_SLACK;

    // The feed's per-symbol seq restarts at 1 when the feed process restarts.
    // Without this branch every subsequent tick looks like a duplicate and the
    // board silently freezes for good.
    if (!epochReset) return state;

    return {
      ...state,
      ticks: [tick],
      latest: tick,
      windowFirst: tick,
      lastSeq: tick.seq,
      lastDirection: 0,
      updatedAt: Date.now(),
    };
  }

  const ticks =
    state.ticks.length >= RING_CAPACITY
      ? [...state.ticks.slice(state.ticks.length - RING_CAPACITY + 1), tick]
      : [...state.ticks, tick];

  return {
    ...state,
    ticks,
    latest: tick,
    windowFirst: ticks[0] ?? tick,
    lastSeq: tick.seq,
    lastDirection: state.latest ? compare(tick.price, state.latest.price) : 0,
    updatedAt: Date.now(),
  };
}

function reducer(board: Board, action: Action): Board {
  switch (action.type) {
    case "catalogue": {
      const next: Board = {};
      for (const instrument of action.catalogue) {
        next[instrument.symbol] = board[instrument.symbol] ?? emptyState(instrument);
      }
      return next;
    }

    case "seed": {
      const current = board[action.symbol];
      if (!current) return board;
      // Snapshot ticks arrive oldest-first; replaying them through pushTick means
      // the dedup and epoch rules apply here too, so a reconnect snapshot fills
      // the gap without rewinding what the stream already delivered.
      let next = current;
      for (const tick of action.ticks) next = pushTick(next, tick);
      return next === current ? board : { ...board, [action.symbol]: next };
    }

    case "tick": {
      const current = board[action.tick.symbol];
      if (!current) return board;
      const next = pushTick(current, action.tick);
      return next === current ? board : { ...board, [action.tick.symbol]: next };
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface TickStream {
  board: Board;
  connection: ConnectionState;
  lastEventAt: number | null;
  updates: number;
}

/**
 * Snapshot-then-stream, plus everything the SSE contract leaves to the client:
 * liveness detection, reconnection, and gap recovery.
 *
 * The stream sends no heartbeat and no `retry:` directive, and its `id:` is a
 * per-symbol seq that interleaves on a multi-symbol stream — so Last-Event-ID
 * cannot resume. Refetching the snapshot on every reconnect is the only gap
 * recovery available.
 */
export function useTickStream(
  catalogue: readonly Instrument[],
  watched: readonly string[],
): TickStream {
  const [board, dispatch] = useReducer(reducer, catalogue, initBoard);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [updates, setUpdates] = useState(0);

  const catalogueKey = catalogue.map((i) => i.symbol).join(",");
  useEffect(() => {
    dispatch({ type: "catalogue", catalogue });
    // catalogueKey stands in for the catalogue array's identity, which changes
    // on every server render even when the contents do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueKey]);

  // One connection serves the whole watchlist: the backend opens a dedicated
  // Redis subscriber per SSE connection, so per-symbol connections would cost
  // five subscribers for the same five channels.
  const requestedKey = watched.join(",");
  const [activeKey, setActiveKey] = useState(requestedKey);

  useEffect(() => {
    if (requestedKey === activeKey) return;
    const timer = setTimeout(() => setActiveKey(requestedKey), WATCHLIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestedKey, activeKey]);

  useEffect(() => {
    const symbols = activeKey ? activeKey.split(",") : [];

    // An empty or fully-unknown `symbols=` filter makes the backend subscribe the
    // client to *everything*, so "nothing watched" has to mean no connection.
    if (symbols.length === 0) {
      setConnection("idle");
      return;
    }

    let disposed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let lastEvent = Date.now();
    const inflight = new Set<AbortController>();

    const prime = () => {
      const controller = new AbortController();
      inflight.add(controller);

      // allSettled, not all: one 404 or one failed symbol must not blank the
      // rest of the board.
      void Promise.allSettled(
        symbols.map(async (symbol) => {
          const snapshot = await fetchSnapshot(symbol, RING_CAPACITY, controller.signal);
          if (!disposed) dispatch({ type: "seed", symbol, ticks: snapshot.ticks });
        }),
      ).finally(() => inflight.delete(controller));
    };

    const onTick = (event: MessageEvent<string>) => {
      let tick: Tick;
      try {
        tick = JSON.parse(event.data) as Tick;
      } catch {
        return;
      }

      lastEvent = Date.now();
      attempt = 0;
      setConnection("live");
      setLastEventAt(lastEvent);
      setUpdates((n) => n + 1);
      dispatch({ type: "tick", tick });
    };

    const close = () => {
      if (!source) return;
      source.close();
      source = null;
    };

    const scheduleReconnect = () => {
      close();
      if (disposed) return;

      attempt += 1;
      setConnection(attempt > OFFLINE_AFTER_ATTEMPTS ? "offline" : "reconnecting");

      const backoff = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
      const jitter = backoff * RETRY_JITTER * (Math.random() * 2 - 1);
      retryTimer = setTimeout(open, Math.round(backoff + jitter));
    };

    function open() {
      if (disposed) return;
      if (attempt === 0) setConnection("connecting");

      lastEvent = Date.now();
      prime();

      const opened = new EventSource(streamUrl(symbols));
      source = opened;
      opened.addEventListener("tick", onTick as EventListener);
      // EventSource reconnects on its own, but it cannot notice a socket that is
      // open and silent, and it will never refetch the snapshot. Own it here.
      opened.onerror = () => {
        if (source === opened) scheduleReconnect();
      };
    }

    const watchdog = setInterval(() => {
      if (disposed || !source) return;
      const silence = Date.now() - lastEvent;
      if (silence > STALL_MS) {
        scheduleReconnect();
      } else if (silence > STALL_MS / 2) {
        setConnection((current) => (current === "live" ? "stale" : current));
      }
    }, WATCHDOG_INTERVAL_MS);

    open();

    return () => {
      disposed = true;
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      for (const controller of inflight) controller.abort();
      // A leaked EventSource holds a backend Redis connection open.
      close();
    };
  }, [activeKey]);

  return { board, connection, lastEventAt, updates };
}
