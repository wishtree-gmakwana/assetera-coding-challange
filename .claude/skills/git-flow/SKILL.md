---
name: git-flow
description: Git conventions for this challenge repo — first-commit hygiene, what must never be committed, branch naming, and the pre-commit gate. Use before any commit, branch, or push, and when asked to prepare the hand-in. Usage: /git-flow [commit|branch|handin].
---

# Git Flow

Repo: `wishtree-gmakwana/assetera-coding-challange` on `origin`. Current branch is `master`; the
default branch for PRs is `master`.

**Only commit or push when the user asks.** Committing is the user's call, not a step you take to
tidy up after yourself.

## State of this repo — read before your first commit

At the time this skill was written the repo had **no commits at all** and everything was untracked.
Verify with `git log --oneline -1` before assuming otherwise. Two consequences:

1. `git diff` shows nothing useful pre-first-commit — use `git status` and read the working tree.
2. The first commit decides what is in the repo forever. Check the staged list explicitly:

```bash
git status --short
git add -A -n | head -50     # dry run: exactly what would be staged
```

## Never commit these

- **`.env`** — it is untracked but **not listed in `.gitignore`**, so `git add -A` will sweep it in.
  It holds `FINNHUB_API_KEY`. Add `.env` to `.gitignore` before the first `git add -A`, and if it is
  already staged, `git restore --staged .env`. A committed key needs rotation, not just a revert.
- **`ECC-master/`** and **`.claude_ref/`** — unrelated vendored tooling, not part of the application.
  Either gitignore them or stage paths explicitly. Do not let them into the hand-in diff.
- `node_modules/`, `.next/`, build output — already covered by `.gitignore`.

Confirm before staging:

```bash
git check-ignore -v .env  
   # each should print a matching rule
```

## Pre-commit gate

Run `/verify` first. A commit whose typecheck fails is not a commit worth making. If `frontend/`
changed, `cd frontend && npm run typecheck` is the minimum.

## Branches

Create one; do not commit directly to `master`/`master` for feature work.

```bash
git checkout -b feature/live-ticker-ui
git checkout -b fix/price-precision-loss
git checkout -b chore/frontend-test-runner
```

Types: `feature` | `fix` | `chore`. Keep the slug to the change, not the file.

## Commit messages

Imperative subject under ~72 chars, prefixed with the scope that changed
(`frontend:`, `backend:`, `chore:`). Body explains *why* when it is not obvious from the diff — the
price-invariant and SSE-resilience decisions are exactly the kind that need a sentence.

End every commit message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Commit in reviewable units: the formatter and its tests together, the stream client separately. Use
`git add <paths>` over `git add -A` in this repo, given the `.env` hazard above.

## Pull requests

```bash
gh pr create --base master --title "frontend: live ticker UI" --body "$(cat <<'EOF'
## Summary
- <what changed, in behaviour terms>

## Price invariant
- Where BigInt/string arithmetic lives, and confirmation that no price path touches Number/float.

## Stream resilience
- Reconnect, stall detection, and gap recovery — what is implemented and what is deliberately not.

## Verification
- frontend typecheck: PASS
- backend tests: N/N
- Smoke-tested against docker compose: yes/no

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Once the PR is open, [.github/workflows/claude-pr-review.yml](../../../.github/workflows/claude-pr-review.yml)
reviews it automatically using the `invariant-reviewer` checklist and posts a sticky comment. Two
preconditions, both easy to miss:

- the workflow must already exist **on `master`** — a workflow introduced by the PR itself does not run
  for that PR;
- the `ANTHROPIC_API_KEY` repo secret must be set, and pushing workflow files needs a token with the
  `workflow` scope (`gh auth refresh -s workflow` if the push is rejected).

Running `invariant-reviewer` locally before pushing is still worthwhile — it is the same checklist
without waiting on CI or spending an API call.

## Hand-in

```
[ ] /verify green (frontend typecheck + build, backend tests)
[ ] git status clean; .env, ECC-master/, .claude_ref/ absent from the tree
[ ] invariant-reviewer run on the full diff, verdict APPROVE or documented WARNING
[ ] README or PR body states the changePercent decision (given value vs. corrected client-side)
[ ] docker compose up --build works from a cold start
```
