# Changelog

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
