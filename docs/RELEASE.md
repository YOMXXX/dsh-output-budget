# Release checklist

## 1. Publish to npm (needs your account)

`npm whoami` must work; the GitHub account alone is not enough.

```sh
cd <this repo>
npm login                     # one-time, opens the browser / asks for the 2FA code
npm pack --dry-run            # confirm the 16-file, ~17 kB tarball
npm publish                   # 0.1.0 — public, no build step, no install scripts
npm view dsh-output-budget version dist-tags.latest
```

`npm publish` cannot be undone; `npm unpublish` is restricted after 72 hours. If the version is wrong,
publish a new patch version instead.

## 2. Get listed in the plugin market

The market reads `https://awesome-dsh-plugin.com/plugins.json`, which is generated from
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin). Submission is **one YAML
file**; the READMEs there are generated and must not be edited.

1. The repository must be **at least one day old** (hard requirement) and declare `dsh.bundle` (it does).
2. Fork and add `data/plugins/YOMXXX__dsh-output-budget.yml` — content is in `docs/awesome-entry.yml`.
3. Open the PR with a one-line title and a body that states:
   - what the plugin does in one sentence;
   - that it never rewrites failures, and rewrites only the model-facing text;
   - what was verified (live digests, failure passthrough, spill round trip, 36 tests);
   - that it has no build step, no external binary, and no network access.
4. After merge, the site and the market pick the entry up within about a day.

## 3. Verify the listing like a user

```sh
# clean profile, so nothing from the development profile leaks in
dsh plugin --profile market-check add dsh-output-budget
```

In the market UI: search `dsh-output-budget` → **Install** → **Enable** → in a new session, run
`git status` in a dirty repo and confirm the preview plus the spill notice, then type `/budget`.

## 4. Later versions

1. Bump `version` in `package.json`, add a `CHANGELOG.md` section.
2. `node --test`
3. `npm publish`, then `gh release create v<version> --notes-file <(...)`
4. The market detects the new npm version automatically.
