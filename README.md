# Assetera — Live Ticker (challenge starter)

This is the starter for the Assetera coding challenge. The brief you were sent is the spec; this file
just describes what's in the box.

## What's here

| Service    | Stack                        | Who owns it                                   |
| ---------- | ---------------------------- | --------------------------------------------- |
| `redis`    | Redis 7                      | Given. The pub/sub backplane.                  |
| `feed`     | Node                         | Given. Stands in for the Finnhub websocket — publishes synthetic ticks to Redis. |
| `backend`  | Node · Fastify · TypeScript  | Given. Subscribes to Redis, serves snapshots and an SSE stream. |
| `frontend` | Next.js 15 (App Router) · TypeScript · Tailwind | **The deliverable.** Live ticker board — see [Frontend](#frontend) below. |

## Running it

```bash
docker compose up --build
```

- Frontend → http://localhost:3000
- Backend → http://localhost:4000

Give it a moment on first start; the images have to build.

To check the backend is alive without the frontend:

```bash
curl localhost:4000/health
curl localhost:4000/api/symbols
curl -N "localhost:4000/api/stream?symbols=AAPL"
```

## Backend API

### `GET /api/symbols`

The instrument catalogue.

```json
[{ "symbol": "AAPL", "name": "Apple Inc.", "decimals": 2 }]
```

### `GET /api/snapshot/:symbol?limit=60`

The most recent ticks for one instrument, plus the move across that window. This is what you read
before you attach to the stream.

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "decimals": 2,
  "changePercent": 0.42,
  "ticks": [{ "symbol": "AAPL", "price": "18734", "decimals": 2, "ts": 1753900000000, "seq": 41 }]
}
```

### `GET /api/stream?symbols=AAPL,MSFT`

Server-Sent Events. One `tick` event per published tick, `data` is a single tick object. Omit
`symbols` to subscribe to everything.

```
id: 42
event: tick
data: {"symbol":"AAPL","price":"18736","decimals":2,"ts":1753900000500,"seq":42}
```

## A note on prices

`price` is an **integer in minor units, as a string**, and `decimals` says where the point goes —
`{ "price": "18734", "decimals": 2 }` is `187.34`. That's how the settlement layer represents amounts,
so the feed matches it. Instruments in the catalogue range from 2 to 18 decimals.

## Frontend

A live board of the instrument catalogue: current price, the move across the visible window, a
sparkline of recent history, and a watchlist you can narrow. Everything below lives in `frontend/` —
`redis`, `feed`, `backend`, and `docker-compose.yml` are exactly as they were handed over.

### Layout

```
app/
  page.tsx                 Server component. Fetches the catalogue, renders the board.
  layout.tsx, globals.css  Shell, fonts, base theme.
components/
  TickerBoard.tsx          Client root — wires the hooks together, owns the page states.
  InstrumentRow.tsx        One instrument: price readout, change pill, sparkline.
  Sparkline.tsx            Hand-rolled SVG history line.
  ConnectionBadge.tsx      Live / stale / reconnecting / offline indicator.
  WatchlistPicker.tsx      Catalogue toggles.
hooks/
  useTickStream.ts         Snapshot-then-stream, reconnection, gap recovery, tick ring buffer.
  useWatchlist.ts          Selection + persistence.
lib/
  prices.ts                All price maths. String/BigInt only.
  prices.test.ts           Vitest cases for the above.
  api.ts                   Shared response types and the two base URLs (given).
  api.server.ts            Server-side fetches (SERVER_API_BASE_URL).
  api.client.ts            Browser-side fetches (BROWSER_API_BASE_URL).
```

### Prices never become floats

This is the constraint the whole frontend is built around. `ASTR-RE1` carries 18 decimals —
`"1234567890123456789"` is far past `Number.MAX_SAFE_INTEGER`, so a single `Number()` anywhere in the
path silently corrupts it while still producing a plausible-looking string. `lib/prices.ts` therefore
works entirely on strings and `BigInt`:

| Function | Does |
| --- | --- |
| `formatPrice(price, decimals)` | Places the decimal point by slicing digits. |
| `groupDigits(whole)` | Thousands separators by string walk — the whole part can exceed 2^53. |
| `splitPrice(price, decimals)` | Splits into the glance-readable lead and the precision tail. |
| `compare(a, b)` | `BigInt` three-way compare. Used for tick direction, sparkline min/max. |
| `changeBasisPoints(first, last)` | The window move, divided in `BigInt`. |

Two places where a float would normally sneak in, and what happens instead:

- **The sparkline.** Points are normalised as `((price - min) * 1000n) / range` — the division is
  `BigInt`, and only the bounded `0..1000` ratio is handed to `Number` for the SVG coordinate. A chart
  library was deliberately not used; it would want floats at the boundary.
- **The change figure.** `changeBasisPoints` multiplies by `10000n` *before* dividing, so the result
  is a small integer (basis points) that is safe to convert. Both prices share a scale, so `decimals`
  cancels out.

Full precision is displayed, never rounded away: `InstrumentRow` renders every digit and simply
de-emphasises everything past the second decimal. Truncating an 18-decimal price to look tidy would be
the float bug wearing a different hat.

**This deviates from the backend on purpose.** `changePercent` in `backend/src/prices.ts` calls
`Number()` on the price and divides by the *last* price rather than the first (so 100 → 200 reports
+50%). The frontend computes its own value client-side from the ticks it holds and does not display
the backend's field. The backend was left untouched.

### The stream client owns what the SSE contract doesn't

`/api/stream` sends no heartbeat frames and no `retry:` directive, and its `id:` is a per-symbol `seq`
that interleaves across a multi-symbol stream — so `Last-Event-ID` cannot meaningfully resume.
`useTickStream` handles all of it:

- **Snapshot, then stream.** On every connect *and every reconnect*, `/api/snapshot/:symbol` is
  refetched for each watched symbol and replayed through the same reducer as live ticks. Refetching is
  the only gap recovery available. Requests go out with `allSettled`, so one failing symbol can't
  blank the rest of the board.
- **Stall detection.** A 1s watchdog watches time since the last event. Past ~2s the badge goes
  `stale`; past 4s the connection is treated as dead and torn down. `EventSource` reconnects a *closed*
  socket by itself, but it cannot notice one that is open and silent — with a 500 ms feed interval,
  silence is the only symptom you get.
- **Backoff.** Reconnects retry at 500 ms doubling to a 10s ceiling, ±20% jitter so N tabs don't
  return in lockstep. After three failed attempts the badge stops calling it a blip and says
  `offline`.
- **Deduplication.** Ticks at or below the last seen `seq` are dropped — the snapshot overlaps the
  stream on connect, and Redis can redeliver across a reconnect. But a `seq` far *below* the last one
  is read as the feed process having restarted (its counter resets to 1) and the ring is reseeded.
  Without that branch every later tick looks like a duplicate and the board freezes permanently.
- **One connection for the whole watchlist.** The backend opens a dedicated Redis subscriber per SSE
  connection, so per-symbol connections would cost five subscribers for the same five channels.
  Watchlist changes are debounced 300 ms to collapse a burst of toggles into one reconnect, and
  unmount aborts in-flight fetches and closes the source — a leaked `EventSource` holds a backend
  Redis connection open.
- **Empty watchlist means no connection at all.** The backend treats a `symbols=` filter that matches
  nothing as *subscribe to everything*, so the client never sends an empty or unvalidated filter;
  `useWatchlist` also intersects stored selections against the live catalogue before they reach the
  query string.
- **Bounded memory.** 120 ticks per symbol (~60s at 500 ms), so a tab left open overnight doesn't grow
  without limit.

### Server / client split

`page.tsx` fetches the catalogue during the server render, so the first paint has rows instead of a
spinner. The two base URLs are not interchangeable — the browser resolves `localhost:4000`, the
Next.js server inside compose resolves `backend:4000` — so the fetches are split into two modules,
`api.server.ts` and `api.client.ts`, making an import into the wrong environment an obvious mistake
rather than a subtle one.

The server fetch never throws: it times out at 3s and returns `[]`. The frontend image is built with
no backend reachable, and the stack can restart mid-session, so `TickerBoard` retries the catalogue
from the browser and offers a manual retry if that fails too. The page is `force-dynamic` — a
build-time catalogue would outlive a restart and silently desync the stream filter.

### Interface decisions

- **The flash lands on the number, not the row.** Every instrument ticks twice a second; a row-sized
  colour wash never finishes fading and the whole board ends up permanently tinted, which conveys
  nothing. The flash is 400 ms — shorter than the feed interval — so it reads as motion, while the
  change pill carries direction as *state*.
- **Colour is never the only signal.** The pill pairs its tint with ▲/▼/— and the connection badge
  pairs its dot with a word.
- **The change window is labelled** (`60s`) everywhere it appears. An unlabelled percentage on a
  ticker gets read as a daily move.
- **Empty is distinguished from zero.** A symbol with no ticks yet renders `—`, not `0.00`; a
  restarted backend legitimately serves `ticks: []` until the feed publishes again. Skeleton rows
  cover the pre-catalogue moment, and an empty watchlist gets its own state.
- Tabular figures throughout so digits don't jitter as prices change.

### Frontend scripts

```bash
cd frontend
npm install
npm run dev        # next dev -p 3000
npm run typecheck  # tsc --noEmit — the only static gate; no linter is configured
npm test           # vitest — lib/prices.test.ts
npm run build
```

`vitest` was added to devDependencies (the starter had no test runner); it needs **Node ≥ 18.18** —
on an older Node or an older glibc it fails at startup in `@rollup/rollup-linux-x64-gnu` before
running a single test. Node 20 is what CI and the Docker image use.

To iterate against the compose backend without rebuilding the image each change — the frontend
Dockerfile runs `npm run build` at image-build time, so compose does not hot-reload it:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 npm run dev
```

## Backend scripts

```bash
cd backend
npm install
npm test         # vitest
npm run typecheck
npm run dev      # tsx watch, expects a Redis on localhost:6379
```
