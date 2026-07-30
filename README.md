# Assetera — Live Ticker (challenge starter)

This is the starter for the Assetera coding challenge. The brief you were sent is the spec; this file
just describes what's in the box.

## What's here

| Service    | Stack                        | Who owns it                                   |
| ---------- | ---------------------------- | --------------------------------------------- |
| `redis`    | Redis 7                      | Given. The pub/sub backplane.                  |
| `feed`     | Node                         | Given. Stands in for the Finnhub websocket — publishes synthetic ticks to Redis. |
| `backend`  | Node · Fastify · TypeScript  | Given. Subscribes to Redis, serves snapshots and an SSE stream. |
| `frontend` | Next.js 15 (App Router) · TypeScript · Tailwind | **Yours.** Currently a placeholder page. |

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

## Backend scripts

```bash
cd backend
npm install
npm test         # vitest
npm run typecheck
npm run dev      # tsx watch, expects a Redis on localhost:6379
```
