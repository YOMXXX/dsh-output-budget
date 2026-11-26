Digests noisy tool output before it reaches the model, keeps the full text one `read` away, and never touches failure output.

**What it does.** Shape-aware digests for `git status` / `git log` / `git diff` / `git show`, `ls` / `find` / `tree`, `grep` / `rg` hits, package-manager installs, and a generic shell cleanup (ANSI, progress frames, repeated lines, head/tail windows). The digest is written through the harness spill store, so the preview carries the omitted byte count and the locator, and the complete original is one `read` away. A `/budget` command reports per-process numbers and switches the runtime between `on`, `off` and `dry-run`.

**Failures are never truncated.** `isError`, non-zero exit codes, signals, timeouts and sandbox denials pass through byte-identical, and `read` output is never rewritten at all. Only the model-facing text of successful, noisy commands is rewritten.

**Verified locally.**

- Live digests on real `git status` / `git log` / `grep` output in a dirty repo, checked against the original.
- Failure passthrough: non-zero exit, timeout and sandbox denial all leave the text unchanged.
- Spill round trip: the locator printed in the preview returns the complete original.
- 39 unit tests, including the Cordis glue (`/budget` and the waterfall), plus `scripts/ab.mjs`, an offline replay that fails if a failure line would be lost.

**Install.** No build step, no external binary, no network access at runtime, zero runtime dependencies. Published as `dsh-output-budget@0.2.1`: `dsh plugin add dsh-output-budget`. The browser half is plain ESM that registers a composer chip and a `shell.overlay` panel; the host half ships no dependency.

This PR adds one file: `data/plugins/YOMXXX__dsh-output-budget.yml`.
