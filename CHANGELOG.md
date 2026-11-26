# Changelog

## 0.2.1 — 2026-11-26

- Per-shape table (runs, saved bytes, share) replaces the inline legend; the sparkline is a compact
  right-aligned histogram.
- The chip lives in `conversation.input.right`, beside the other composer tooling.
- Slot entries are wrapped in an error boundary, so a render fault degrades to a plain pill instead of
  blanking the entry.

## 0.2.0 — 2026-11-26

Browser half, styled after the harness's own dashboard panels.

- **Composer chip**: shows the session's saved tokens and opens the panel.
- **Budget panel** in `shell.overlay`: KPI band (saved / rewrites / compression), per-shape stacked
  bar with legend and a sparkline, and the last digests with their command, saved ratio and byte
  reduction. Root-scoped so the docked composer cannot clip it.
- **`outputBudget` session projection**: the numbers are folded from committed `tool/call` and
  `tool/result` events, so they survive fork/replay and need no RPC or polling.
- Dependency-free projection schemas: the Host half still ships no runtime dependency.
- `inject` now declares `sessionProjections`.

## 0.1.0 — 2026-11-25

First release.

- Shape-aware digests for `git status`, `git log`, `git diff`/`show`, `ls`/`find`/`tree`, `grep`/`rg`
  output, package-manager installs, and a generic shell cleanup (ANSI, progress frames, repeated lines,
  head/tail windows, error windows).
- Full text is stored through the harness spill store; the preview carries the omitted byte count and the
  locator, using the harness retention wording so the Web UI keeps its spill affordance.
- Failure passthrough: `isError`, non-zero exit codes, signals, timeouts, and sandbox denials are never
  rewritten. `read` is never rewritten.
- `/budget` command: per-process report and a runtime `on`/`off`/`dry-run` switch for A/B.
- `scripts/ab.mjs`: offline replay that fails when a failure line would be lost.
- 36 unit tests, including the Cordis glue (waterfall + `/budget`).
