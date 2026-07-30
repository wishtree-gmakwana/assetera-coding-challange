# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Assetera live-ticker coding challenge. `redis`, `feed`, and `backend` are **given** and should not
need changes; `frontend` is a placeholder page and is **the deliverable**. See [README.md](README.md)
for the API contract as it was handed over.

`ECC-main/` and `.claude_ref/` are unrelated vendored tooling (a Claude Code plugin repo and a
reference agent/hook config). They are not part of the application — ignore them unless asked.

## Agents and skills

Project-specific definitions live in `.claude/`. Prefer them over ad-hoc work in their areas.

| Agent | Use for |
|---|---|
| `frontend-coder` | Any implementation in `frontend/` — knows the price invariant and what the SSE client must own |
| `test-author` | Writing/running vitest cases; tests only, never edits production code to make one pass |
| `invariant-reviewer` | Reviewing a diff for float contamination, base-URL misuse, missing stream resilience |

| Skill | Use for |
|---|---|
| `/verify` | The real gate: frontend typecheck + build, backend typecheck + tests, optional compose smoke test |
| `/git-flow` | Commit/branch/PR conventions and the hand-in checklist |

CI runs the same review automatically on every PR
([.github/workflows/claude-pr-review.yml](.github/workflows/claude-pr-review.yml)) — it reads
`invariant-reviewer.md` from the checkout rather than duplicating the checklist, so editing the agent
updates CI too. It needs the `ANTHROPIC_API_KEY` repo secret and only runs once the workflow is on the
default branch.

Before any broad `git add`: **`.env` contains `FINNHUB_API_KEY` and is not matched by `.gitignore`**,
and `ECC-main/`/`.claude_ref/` are unignored too. Stage explicit paths — see `/git-flow`.

## Commands

```bash
docker compose up --build          # whole stack: frontend :3000, backend :4000, redis :6379

cd backend
npm install
npm test                           # vitest run
npx vitest run src/prices.test.ts  # single file
npx vitest run -t "places the decimal point"   # single test by name
npm run typecheck
npm run dev                        # tsx watch; needs a Redis on localhost:6379

cd frontend
npm run dev                        # next dev -p 3000
npm run build
npm run typecheck
```

No linter or formatter is configured anywhere, and the frontend has no test runner. `npm run
typecheck` is the only static gate — run it before claiming frontend work is done.

The frontend Dockerfile runs `npm run build` at image-build time, so compose does not hot-reload
frontend edits. For iterating on the UI, run `npm run dev` locally against the compose backend
(`NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`) rather than rebuilding the image each change.

## Data flow

```
feed/src/index.js          BigInt random walk, every FEED_INTERVAL_MS (500)
      │ redis.publish("ticks:<SYMBOL>", <tick JSON>)
      ▼
redis pub/sub              fire-and-forget; nothing is persisted
      │
      ▼
backend/src/server.ts      one long-lived "warmer" subscriber → TickWindow (in-memory ring,
      │                    SNAPSHOT_BUFFER_SIZE=240 ticks/symbol) serves /api/snapshot
      │                    plus one *new* Redis subscriber per SSE connection
      ▼
frontend                   GET /api/snapshot/:symbol first, then attach to /api/stream
```

Consequences worth knowing before debugging:

- The snapshot window is process memory only. Restarting the backend empties it, and a freshly
  started backend returns `ticks: []` until the feed publishes again. There is no backfill.
- Every SSE client opens its own Redis connection. Fan-out cost scales with connections, not symbols.
- Redis is not exposed to the browser; the SSE endpoint is the only push path.

## The price invariant

`price` is an **integer in minor units, as a string**, paired with `decimals`. `ASTR-RE1` carries 18
decimals — `1234567890123456789` — which exceeds `Number.MAX_SAFE_INTEGER`. Any arithmetic,
comparison, or formatting must stay on strings or `BigInt`; converting to `float`/`Number` silently
loses digits on the high-precision instruments. `formatPrice` in [backend/src/prices.ts](backend/src/prices.ts)
is the reference string-based implementation, but it lives in the backend and is not shipped to the
browser — the frontend needs its own.

Related: `changePercent` in the same file uses `Number(...)` and divides by the *last* price rather
than the first. Both are visible in the given code; treat them as part of the challenge surface, not
as settled behaviour to copy.

## SSE contract details not in the README

The stream handler writes the response head by hand via `reply.raw`, which bypasses Fastify's reply
pipeline. That means `@fastify/cors` headers do not apply and are re-set manually
([backend/src/server.ts:85-100](backend/src/server.ts#L85-L100)); anything else added to the reply
pipeline will likewise not reach this route.

The stream sends **no heartbeat/comment frames and no `retry:` directive**, so reconnection,
keep-alive detection, and gap recovery after a drop are entirely the client's problem. `id:` is the
per-symbol `seq`, so on a multi-symbol stream the ids interleave and are not globally monotonic —
`Last-Event-ID` cannot be used to resume meaningfully. Unknown symbols in `?symbols=` are silently
dropped; if none survive filtering, the client is subscribed to *everything*.

## Cross-cutting conventions

- The instrument catalogue is duplicated in [backend/src/symbols.ts](backend/src/symbols.ts) and
  [feed/src/symbols.js](feed/src/symbols.js) (the feed copy adds `start`). Both files say so; changing
  one without the other desynchronises the catalogue from the published channels.
- Frontend has two API base URLs because the browser and the Next.js server sit on different networks
  under compose: use `BROWSER_API_BASE_URL` in client components, `SERVER_API_BASE_URL` in server
  components/route handlers ([frontend/lib/api.ts](frontend/lib/api.ts)). The shared response types
  live there too.
- All three Node packages are ESM (`"type": "module"`). Backend TS imports use `.js` specifiers
  (`./prices.js`) — required by `moduleResolution: "Bundler"` + ESM; keep that style.
- Backend tsconfig sets `noUncheckedIndexedAccess`, the frontend's does not.
- `FINNHUB_API_KEY`/`FINNHUB_WS_URL` in `.env` are placeholders — the bundled feed ignores them.
  The `ws` dependency in `backend/package.json` is dead (abandoned WebSocket endpoint, see the TODO at
  the bottom of `server.ts`).
