# dsh-output-budget

[English](README.md) | [中文](README.zh.md)

Shape-aware tool-output budgeting for [DeepSeek Harness](https://www.deepseek.com/harness/).

Every tool result is inspected once — after the tool ran, before it reaches the model. Noisy shapes are
rewritten into a denser preview, the full text is stored through the harness spill store, and the model
gets an explicit recoverability notice. **Errors keep every byte.**

```
$ git log --oneline -80
517963bc6 fix(resume): keep newlines and lists in a table sample
…
36e925902 Merge branch 'feature/setting-tag-20261013' into 'master'
[... +50 more commits ...]

(Omitted 3301 bytes. Full formatted result stored at: /…/session-…/06aca161290b-bash.txt. Use read with offset/limit, or grep this path to search within it.)
```

## What it does

| Shape | Trigger | Rewrite |
|---|---|---|
| `git-status` | `git status` (long or porcelain) | drops advice rows, caps each file group, keeps conflicts |
| `git-log` | `git log`, `git log --oneline -n` | 30 commits + remainder marker |
| `git-diff` | `git diff`, `git show` | per-file `+a/-b` stats, hunk headers, 6 lines per hunk |
| `listing` | `ls`, `find`, `tree`, `fd`, `du` | 100 entries + remainder marker |
| `search` | `grep`, `rg`, or the `grep` tool | matches grouped by file with counts |
| `package` | `pnpm/npm/yarn/bun install|add|ci` | warnings + errors + tail |
| `bash` | any other shell call | ANSI/progress-frame cleanup, repeated-line folding, head 40 + tail 40, error windows |

A rewrite only happens when the result is at least `minChars` long, the preview is strictly smaller, and
the result is not already a preview.

## What it never does

- **Never rewrites a failure.** `isError`, a non-zero exit code, a signal, a timeout, or a sandbox denial
  keeps the result byte for byte.
- **Never rewrites `read`.** Lines the model asked for are the lines it gets.
- **Never edits your command.** There is no pre-execute rewrite; only the model-facing text changes, and
  `value` stays intact.
- **Never hides output.** Every rewrite carries the omitted byte count and a locator; the harness UI still
  recognises the notice as a spill preview.

## Install

In DSH: **Plugins → Add plugin →** search `dsh-output-budget` → **Install**, then enable it.
Or from a checkout:

```sh
dsh plugin --profile <profile> add dsh-output-budget
```

The plugin is host-only: no client bundle, no build step, no external binary.

## Configuration

Patch the row in your profile's `cordis.patch.yml`:

```yaml
- id: dsh-output-budget
  name: dsh-output-budget
  config:
    mode: dry-run
    maxContentChars: 6000
```

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; `false` restores results byte for byte |
| `mode` | `apply` | `apply` rewrites, `dry-run` only measures, `off` does nothing |
| `maxContentChars` | `6000` | Target preview size (≈4 characters per token) |
| `minChars` | `1200` | Results shorter than this are never inspected |
| `spill` | `true` | Store the full text through the harness spill store |
| `digestBashGeneric` | `true` | Generic shell cleanup |
| `digestListing` | `true` | `ls`/`find`/`tree` capping |
| `digestGit` | `true` | `git status`/`log`/`diff` |
| `digestSearch` | `true` | Group many matches by file |
| `digestPackage` | `true` | Package-manager warnings and errors |
| `digestTest` | `false` | Test-runner output, off by default |

Start with `mode: dry-run` if you want to see the numbers before anything is rewritten.

## The `/budget` command

Type `/budget` in a session to print what this process has inspected and saved:

```
output-budget (this process)
inspected 41 result(s), rewrote 33
saved 812,441 chars (~203,110 tokens)
  session-…  33/41 rewritten, saved 812,441 chars [git-log 212,004, search 402,110, bash 198,327]
mode: apply · maxContentChars: 6000 · minChars: 1200 · spill: true
```

`/budget dry-run`, `/budget on`, `/budget off` switch the mode for the running process, so you can A/B
without editing a patch file; an edit to the patch layer is what survives a restart.

## Offline report

`scripts/ab.mjs` replays recorded outputs and fails when a failure line would be lost:

```sh
node scripts/ab.mjs records.jsonl   # {"command":"git status","output":"…"}
```

## Known limitations

- The digest is a **heuristic**, not a parser: unusual command dialects may fall back to the generic
  shape, which is safe but less aggressive.
- `digestTest` is off by default because test runners differ widely; enable it per project.
- Previews are plain text: a rewritten result no longer renders as a rich terminal card in the Web UI.
  The UI still shows the spill affordance for the full text.
- Only text results are inspected; image-bearing results pass through untouched.
- Saved text lives in the session spill directory managed by the harness, so retention follows the
  harness's own spill policy.

## Development

```sh
node --test          # 36 unit tests
node scripts/ab.mjs records.jsonl
```

## Compatibility

- DSH `^0.2.3-alpha.2`.
- Verified on DSH Desktop `0.2.3-alpha.2` (macOS): `git status`/`git log` digests and the failure
  passthrough were observed in a live session; the spilled locator was written and readable.

## License

MIT
