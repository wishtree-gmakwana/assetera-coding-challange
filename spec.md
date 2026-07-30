# Live Ticker — Implementation Spec

Derived from `Assetera-Coding-Challenge.pdf`, [README.md](README.md), [CLAUDE.md](CLAUDE.md), and a read
of the given `feed`/`backend`/`frontend` source.

This is the build spec for the deliverable. It states what to build, the invariants that make it
*correct*, the decisions taken up front (and why), and what is explicitly out of scope.

---

## 1. Objective

A single page at `/` showing live prices for the instrument catalogue, driven by the backend's SSE
stream. Correctness under high-precision prices and survival of a backend restart matter more than
feature count.

**Deliverable scope: `frontend/` only.** `redis`, `feed`, and `backend` are given and are not changed.
Any deviation from that must be recorded in the README (the brief explicitly permits changing the
starter — it does not permit changing it silently).

### Grading reality — the one-hour time-box

The brief says one hour is not enough and that the judgement is on *what was chosen and skipped*.
So the spec is tiered, and the tiers are a build order, not a wish list:

| Tier | Item | Brief ref |
|---|---|---|
| **P0** | Instrument list with live-updating current price | core 1 |
| **P0** | Correct price rendering (string/BigInt, never float) | "Prices are integers" |
| **P0** | Watchlist — user picks which instruments they watch | core 2 |
| **P0** | Change indicator — up/down + % move over the window | core 3 |
| **P0** | Survives backend restart without a page reload | core 4 |
| **P1** | Sparkline / recent history | bonus 5 |
| **P1** | Unit tests for the pure price logic | bonus 7 |
| **P2** | Product-grade visual polish | bonus 6 |
| **P2** | Persisted watchlist, connection-status affordances | — |

A P0 that is half-built is worse than a P1 that is cut and written down. Cut downward, never sideways.

---

## 2. The price invariant (non-negotiable)

`price` is an **integer in minor units, as a string**, with `decimals` alongside.
`ASTR-RE1` carries 18 decimals — `1234567890123456789` — well past `Number.MAX_SAFE_INTEGER`
(9007199254740991).

**Rule: no price value may ever be passed through `Number()`, `parseFloat`, `parseInt`, `+x`, `JSON`
round-trip-to-number, or a numeric sort/comparison.** All arithmetic, comparison, min/max, and
formatting stays on `string` or `BigInt`.

`Number` is permitted only for values that are *already* small and bounded and *only after* the
BigInt math is done — e.g. a basis-point integer, or an SVG pixel coordinate. Those are presentation
outputs, not prices.

Consequences:

- `formatPrice` must be reimplemented in `frontend/lib/`. The backend's version in
  [backend/src/prices.ts](backend/src/prices.ts#L26-L36) is the correct reference algorithm but is
  server-only and must not be imported across packages (separate `package.json`, separate tsconfig,
  no workspace linking — a cross-package relative import would break `next build`).
- **`snapshot.changePercent` from the backend is not trusted and is not displayed.**
  [backend/src/prices.ts:42-49](backend/src/prices.ts#L42-L49) has two defects visible in the given
  code: it calls `Number(tick.price)` (destroys ASTR-RE1 precision) and it divides by `last` instead
  of `first` (wrong denominator — a move from 100→200 reports +50%, not +100%). The frontend computes
  its own from the tick array it already holds. This is a deliberate decision, and it goes in the
  README.

### Required pure helpers — `frontend/lib/prices.ts`

```ts
formatPrice(price: string, decimals: number): string
```
Minor-unit integer string → display string. Pure string slicing, zero-padded, sign-preserving,
`decimals === 0` returns as-is. Must satisfy: `("18734", 2) → "187.34"`, `("5", 2) → "0.05"`,
`("-5", 2) → "-0.05"`, `("1234567890123456789", 18) → "1.234567890123456789"`.

```ts
changeBasisPoints(first: string, last: string): number | null
```
`(BigInt(last) - BigInt(first)) * 10000n / BigInt(first)`, then `Number(...)` on the bounded result.
Returns `null` when `first` is `"0"` or either side is missing. Both prices share a scale, so
`decimals` cancels and is not an input. Display as `bps / 100` with a fixed 2 decimals.

```ts
compare(a: string, b: string): -1 | 0 | 1        // BigInt comparison, for min/max and direction
```

Direction (`up | down | flat`) comes from `compare`, never from a float delta.

---

## 3. Given contract — what the client must absorb

From the README plus behaviours only visible in [backend/src/server.ts](backend/src/server.ts):

| Endpoint | Notes for the client |
|---|---|
| `GET /api/symbols` | Static catalogue: AAPL·2, MSFT·2, BTCUSD·2, XAU·4, ASTR-RE1·18. Safe to fetch server-side. |
| `GET /api/snapshot/:symbol?limit=N` | Per-symbol, **one request per symbol** — no batch endpoint. `limit` is clamped to `SNAPSHOT_BUFFER_SIZE` (240). `404` on unknown symbol. |
| `GET /api/stream?symbols=A,B` | One `event: tick` per tick, `data` = one tick object. |

Sharp edges the client owns, all confirmed in the source:

1. **No heartbeat, no comment frames, no `retry:` directive.** A silently dead TCP connection produces
   no `error` event — the browser will sit on it. Liveness detection is the client's job.
2. **`id:` is the per-symbol `seq`** ([server.ts:112](backend/src/server.ts#L112)). On a multi-symbol
   stream the ids interleave and are not globally monotonic. `Last-Event-ID` is meaningless for
   resume; the backend ignores it anyway. Do not build on it.
3. **An empty/unknown `symbols=` filter subscribes to everything**
   ([server.ts:76-81](backend/src/server.ts#L76-L81)). So: when the watchlist is empty, **do not open a
   stream at all**. Never send symbols outside the catalogue.
4. **Snapshot is process memory only.** A restarted backend returns `ticks: []` until the feed
   publishes again — no backfill, no error. The UI must treat this as "no history yet", not a failure.
5. **One Redis connection per SSE connection** ([server.ts:102](backend/src/server.ts#L102)). Fan-out
   cost scales with *connections*, not symbols. This forces the single-connection decision in §4.
6. **CORS is hand-set on the stream route only** ([server.ts:85-99](backend/src/server.ts#L85-L99)),
   keyed off the `Origin` header. Plain `EventSource` (no credentials) is fine; anything exotic is not.
7. Feed publishes all 5 symbols every `FEED_INTERVAL_MS` (500ms) → ~10 events/sec on a full stream.

---

## 4. Architecture decisions

### 4.1 Client/server boundary

- **Server component** (`app/page.tsx`): fetch `GET /api/symbols` using `SERVER_API_BASE_URL`
  (`http://backend:4000` under compose). It is static, cheap, and gives a non-empty first paint.
  Use `cache: "no-store"` so a restarted stack does not serve a stale catalogue.
- **Client component** (`app/ticker/*`): everything live — snapshots, SSE, watchlist state — using
  `BROWSER_API_BASE_URL` (`http://localhost:4000`).

**Using the wrong base URL is the highest-frequency failure in this setup**: `http://backend:4000`
does not resolve in the browser, `http://localhost:4000` does not resolve inside the frontend
container. The rule is one line: *server component → `SERVER_`, client component → `BROWSER_`.*

Rejected: proxying the stream through a Next route handler. It would unify the base URL and hide CORS,
but it doubles the SSE hop count, adds a Node buffering risk, and buys nothing the browser cannot do
directly. Not worth the hour.

### 4.2 One SSE connection, not one per symbol

A single `EventSource` to `/api/stream?symbols=<watchlist joined>`. Each connection costs the backend
a dedicated Redis subscriber; five connections for five symbols is five times the server cost for
identical data. Ticks are routed to per-symbol state by `tick.symbol` in the handler.

Cost of the choice, accepted: changing the watchlist tears down and reopens the connection. Debounce
watchlist edits (~300 ms) so a burst of toggles produces one reconnect. Reopening is cheap and the
snapshot refetch (§4.4) covers the gap.

### 4.3 State model

State lives in one client-side reducer/store keyed by symbol — no global state library, no server
cache library. React `useState`/`useReducer` in one provider is sufficient for 5 symbols and keeps the
data flow legible in a walkthrough.

```ts
type SymbolState = {
  instrument: Instrument;       // symbol, name, decimals — from the catalogue
  ticks: Tick[];                // ring, newest last, capped (see below)
  latest: Tick | null;          // ticks[ticks.length - 1], denormalised for render
  lastSeq: number | null;       // dedup / ordering guard
  windowFirst: Tick | null;     // baseline for the % change
};
```

- **Ring cap: 120 ticks per symbol** (~60s at 500 ms). Enough for a sparkline; bounded so a page left
  open overnight does not grow unboundedly. Trim on push, never on render.
- **Dedup + ordering**: drop a tick whose `seq <= lastSeq`. Redis pub/sub can redeliver across a
  reconnect and a snapshot+stream overlap will duplicate the boundary tick.
- **Feed-restart detection**: `seq` resets to 1 when the feed restarts. If an incoming `seq` is *far
  below* `lastSeq` (guard: `seq < lastSeq - 1000`), treat it as a new epoch — reset `lastSeq` and the
  change baseline rather than discarding every tick forever. Without this the UI freezes silently
  after a `docker compose restart feed`.
- **Change baseline** = the oldest tick currently in the ring (`windowFirst`), so the displayed % is
  "move over the visible window" and is consistent with the sparkline. This must be stated in the UI
  (a "1m" / "60s" label) — an unlabelled percentage is a lie about its own timeframe.

### 4.4 Stream lifecycle — `useTickStream` hook

This hook is the heart of the exercise. It owns:

1. **Prime**: on watchlist change, `GET /api/snapshot/:symbol?limit=120` for each watched symbol
   (in parallel, `Promise.allSettled` — one 404 or one failure must not blank the others). Seed the
   rings. `ticks: []` is a valid, expected response.
2. **Attach**: open one `EventSource` for the whole watchlist. Snapshot-then-attach may overlap; §4.3
   dedup absorbs it.
3. **Watchdog** (this is the part the backend does not give you): track `lastEventAt`. If no tick
   arrives for **3× the expected interval + slack (≈3 s)** while the connection claims to be open,
   treat it as dead — `close()` and reconnect. Without this a half-open socket looks alive forever.
4. **Reconnect**: on `onerror` or watchdog trip — `close()`, then reopen with **exponential backoff
   with jitter** (500ms → 1s → 2s → 4s, cap 10s, ±20% jitter), reset to the floor on a successful
   event. Do not rely on `EventSource`'s built-in retry: it cannot see a stalled-but-open socket, and
   it will not refetch the snapshot.
5. **Gap recovery**: after a successful reopen, **refetch the snapshot** for the watched symbols to
   fill what was missed while disconnected. `Last-Event-ID` cannot do this (§3.2).
6. **Never clear prices on disconnect.** Keep the last known values, render them visibly stale
   (dimmed + a status badge). A brokerage UI that blanks on a hiccup is worse than one showing a
   flagged stale price.
7. **Teardown**: `close()` the `EventSource` and clear timers on unmount and before every reopen.
   A leaked connection holds a backend Redis connection open.
8. Pause on `document.hidden`? **No** — out of scope, and reattaching costs a snapshot refetch anyway.
   Noted as a "with more time" item.

Exposed connection state: `connecting | live | stale | reconnecting | offline`, surfaced in the UI.

**Acceptance for "keep working when the backend restarts" (core 4):** with the page open, run
`docker compose restart backend`; prices freeze and the badge goes `reconnecting`; when the backend is
back, the badge returns to `live` and prices resume — **with no page reload and no console error
storm**. Sparklines rebuild from the empty snapshot forward; that is inherent to the given backend
(no persistence) and is stated in the README rather than worked around.

### 4.5 Watchlist

- Default: all catalogue symbols watched on first visit.
- Toggle per instrument in the UI; state persisted to `localStorage` under one versioned key
  (`assetera.watchlist.v1`), intersected with the live catalogue on read so a stale stored symbol
  cannot poison the stream query.
- **Empty watchlist is a first-class state**: no `EventSource` is opened (§3.3), and the panel shows
  an explicit empty state.
- Reading `localStorage` during render breaks SSR hydration — read it in an effect after mount and
  start from the catalogue default.

---

## 5. UI

Single page, dark theme already set in [frontend/app/globals.css](frontend/app/globals.css). Tailwind
only — no component library, no chart library (a sparkline is ~10 lines of SVG; adding a dependency
for it is a worse answer under a time-box).

**Layout**

- Header: title, connection badge (`live` green / `reconnecting` amber / `offline` red), tick counter
  or last-update time.
- Instrument rows (list on mobile, grid ≥ md), one per watched symbol:
  - symbol + name
  - **current price**, tabular-nums monospace, right-aligned, formatted at that instrument's `decimals`
  - change over the window: arrow + signed `%` , green/red/neutral
  - sparkline (P1)
  - watch toggle
- A catalogue panel/row of chips for unwatched instruments.

**Render rules**

- `font-variant-numeric: tabular-nums` on every price. Proportional digits make a 10 Hz ticker jitter
  horizontally — this is the single highest-value polish detail here.
- **Flash on change**: brief green/red background pulse on the changed row, ~300 ms via a CSS
  transition on a key derived from `seq`. Colour must not be the *only* signal — pair with an arrow
  glyph (colour-blind users, and it reads better in a screen-share walkthrough).
- ASTR-RE1 renders 18 decimals. Do not truncate the value — truncating is the float bug wearing a
  costume. Render the full string; de-emphasise trailing digits with a lighter span if it crowds the
  layout, and let the container scroll rather than clipping.
- Loading: skeleton rows sized to the final layout, so the first tick does not reflow the page.
- No data yet (fresh backend, empty snapshot): show `—` for price and `—%` for change. Never `NaN`,
  never `0.00` — a fabricated zero price in a brokerage UI is a correctness bug, not a cosmetic one.

**Sparkline (P1)** — `<svg>` polyline over the ring:
min/max via BigInt `compare`; normalise with `Number((p - min) * 1000n / (max - min)) / 1000` — the
division happens in BigInt, only the bounded 0…1000 ratio becomes a `Number`. Flat window
(`max === min`) → horizontal mid-line, no divide-by-zero. Stroke colour follows the window direction.

---

## 6. File layout

```
frontend/
  app/
    page.tsx                 server component — fetches catalogue, renders <TickerBoard/>
    layout.tsx               given, unchanged
    globals.css              given, unchanged
  components/
    TickerBoard.tsx          "use client" — owns watchlist + hook, composes the page
    InstrumentRow.tsx        one row: price, change, sparkline, toggle
    Sparkline.tsx            pure SVG from a Tick[]
    ConnectionBadge.tsx      connection state pill
    WatchlistPicker.tsx      catalogue chips / toggles
  hooks/
    useTickStream.ts         snapshot prime + SSE + watchdog + backoff + dedup
    useWatchlist.ts          localStorage-backed selection
  lib/
    api.ts                   GIVEN — types + base URLs. Extend, do not rewrite.
    prices.ts                formatPrice / changeBasisPoints / compare  (NEW, pure)
    prices.test.ts           vitest (P1)
```

`lib/api.ts` is given and already carries the `Instrument`/`Tick`/`Snapshot` types and both base URLs.
Add fetch helpers there; do not duplicate the types.

---

## 7. Tests (P1)

Only the pure layer is worth testing inside the hour; that is also where the bugs that matter live.

`vitest` is not yet installed in `frontend/` (backend has it). Adding it is ~2 min:
`npm i -D vitest`, `"test": "vitest run"`.

Required cases in `lib/prices.test.ts`:

| Case | Why |
|---|---|
| `formatPrice("18734", 2) === "187.34"` | the README's own example |
| `formatPrice("5", 2) === "0.05"` | zero-padding below one unit |
| `formatPrice("1234567890123456789", 18) === "1.234567890123456789"` | **the precision test** — fails the moment anything touches a float |
| `formatPrice("-5", 2) === "-0.05"` | sign handling |
| `formatPrice("42", 0) === "42"` | zero-decimals passthrough |
| `changeBasisPoints("100","200") === 10000` | +100%, and pins the denominator (backend's version says +50%) |
| `changeBasisPoints` on two 18-decimal strings differing in the last digit | sub-`EPSILON` move survives |
| `changeBasisPoints(x, "0") === null` | divide-by-zero guard |
| `compare` across 18-decimal values differing only past digit 17 | BigInt vs float comparison |

Explicitly not tested inside the hour: the SSE hook (needs an `EventSource` fake + timer control),
component rendering (needs jsdom + Testing Library). Both are named in the README as cut, with the
reason: highest bug-density per minute is in the pure layer.

---

## 8. Out of scope — deliberate cuts, all to be named in the README

| Cut | Reason |
|---|---|
| Backend changes (fixing `changePercent`, adding heartbeat / batch snapshot / `retry:`) | The frontend is the deliverable; the defects are documented and worked around client-side instead. Fixing `changePercent` in place is the top "with more time" item. |
| Server-side rendering of live prices / streaming RSC | Price data is inherently client-live; SSR of a value that is stale by first paint adds complexity for nothing. |
| WebSockets | Backend's `ws` dependency is dead ([server.ts:124-128](backend/src/server.ts#L124-L128)). SSE is the shipped contract. |
| Persistence / historical charts beyond the in-memory window | No backfill exists anywhere in the stack. |
| Auth, multi-user, order entry, i18n, currency symbols | Not in the brief. |
| Virtualised list | 5 instruments. |
| Component/E2E tests | See §7. |
| Light theme, mobile-first refinement | P2 polish, below the correctness line. |

---

## 9. Definition of done

Functional:

- [ ] Page lists the catalogue; watched instruments show a live price updating ~2/sec.
- [ ] ASTR-RE1 shows all 18 decimals and its trailing digits actually change (proves no float path).
- [ ] Toggling the watchlist adds/removes rows and results in **one** reconnect, not one per toggle.
- [ ] Empty watchlist opens no connection and shows an empty state.
- [ ] Each row shows a signed, labelled % move with direction colour **and** an arrow.
- [ ] `docker compose restart backend` → badge goes reconnecting → live, prices resume, no reload.
- [ ] Fresh backend (empty snapshot) renders `—`, never `NaN`/`0.00`, and recovers on the first tick.
- [ ] Watchlist survives a page reload.
- [ ] Navigating away closes the `EventSource` (verify in devtools Network).

Code quality:

- [ ] `grep -nE "Number\(|parseFloat|parseInt" frontend/{lib,hooks,components}` — every hit is a
      bounded, post-BigInt presentation value, and is justified in a comment.
- [ ] No import crossing from `frontend/` into `backend/` or `feed/`.
- [ ] `BROWSER_API_BASE_URL` appears only in `"use client"` files; `SERVER_API_BASE_URL` only in server
      components.

Gates — `/verify`:

```bash
cd frontend && npm run typecheck && npm run build
cd backend  && npm run typecheck && npm test
docker compose up --build          # smoke
```

Hand-in — `/git-flow`:

- [ ] `.env` **not** committed (it holds `FINNHUB_API_KEY` and is not covered by `.gitignore`);
      `ECC-main/` and `.claude_ref/` not committed. Stage explicit paths, never `git add -A`.
- [ ] Commit history readable — the brief says they read it. Small, sequential, honestly messaged.
- [ ] README updated: how to run · what was built · **what was cut and why** · what would change with
      more time · assumptions made.

## 10. Assumptions

1. The catalogue is small and static; no pagination, search, or lazy loading.
2. `FEED_INTERVAL_MS=500` is representative — the watchdog threshold is tuned to it and is a constant
   in one place, not scattered.
3. A single browser tab per user; no cross-tab connection sharing (BroadcastChannel/SharedWorker).
4. Modern browsers only — native `EventSource`, `BigInt`, `Intl`. No polyfills.
5. "How each one has moved" (core 3) means *over the visible window*, since the stack has no
   session-open or previous-close reference price. The window is labelled in the UI so the number is
   not read as a daily move.
