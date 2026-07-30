---
name: verify
description: Run this repo's full static and test gate before claiming work is done or committing — frontend typecheck, backend typecheck, backend vitest, and an optional live stack smoke test. Use when asked to verify, check, or confirm the build is green. Usage: /verify [--smoke].
---

# Verify

There is **no linter and no formatter** anywhere in this repo, and the frontend has no test runner.
`typecheck` plus the backend vitest suite is the entire gate. Run it — do not eyeball it.

## 1. Frontend typecheck (required for any `frontend/` change)

```bash
cd frontend && npm run typecheck
```

Remember `frontend/tsconfig.json` omits `noUncheckedIndexedAccess`, so a green typecheck does **not**
prove index access is safe. Read array reads by eye as well.

## 2. Backend typecheck + tests

```bash
cd backend && npm run typecheck && npm test
```

Only required if `backend/` changed — but run it anyway when a session touched shared assumptions
(the symbol catalogue, tick shape), since the frontend has no suite to catch a drift.

## 3. Frontend build (before hand-in, and before any docker rebuild)

```bash
cd frontend && npm run build
```

The frontend Dockerfile runs `npm run build` at image-build time, so a type or build error surfaces
as a failed `docker compose up --build` rather than a runtime error. Catch it locally first.

## 4. Smoke test against the live stack (`--smoke`)

```bash
docker compose up --build -d
curl -s localhost:4000/health
curl -s localhost:4000/api/symbols
curl -s "localhost:4000/api/snapshot/ASTR-RE1?limit=5"
curl -sN "localhost:4000/api/stream?symbols=AAPL" | head -c 600
```

What to actually check in the output:

- `/api/snapshot/ASTR-RE1` returns `price` as a **quoted string** of ~19 digits with
  `"decimals": 18`. If it arrived unquoted or shortened, something upstream cast it to a number.
- `ticks: []` right after a fresh start is **expected**, not a failure — the snapshot window is
  process memory and there is no backfill. Wait a couple of seconds for the feed (500 ms interval)
  and re-request.
- The stream emits `id: <seq>` / `event: tick` / `data: {...}` frames and **no comment or `retry:`
  lines** — that absence is the given behaviour, and it is why the client owns keep-alive.

For UI iteration do **not** rebuild the frontend image per change; compose will not hot-reload it.
Run the frontend locally against the compose backend:

```bash
cd frontend && NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 npm run dev
```

## Reporting

State each gate and its real result. If a gate was skipped, say which and why. Never report "done"
with an unrun or failing gate — paste the failure output instead.

```
frontend typecheck : PASS | FAIL
frontend build     : PASS | FAIL | skipped (reason)
backend typecheck  : PASS | FAIL | skipped (no backend change)
backend tests      : N/N passed | skipped (no backend change)
smoke              : PASS | FAIL | not run
```
