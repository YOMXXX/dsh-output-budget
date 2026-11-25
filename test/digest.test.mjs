import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, classifyCommand } from '../src/classify.js'
import { digest } from '../src/digest.js'

const OPTIONS = { maxChars: 6000, minChars: 1200 }

/** @param {number} count @param {(index: number) => string} make */
function lines(count, make) {
  return Array.from({ length: count }, (_, index) => make(index))
}

test('classifyCommand picks the shape from the real command', () => {
  assert.equal(classifyCommand('git status --short'), 'git-status')
  assert.equal(classifyCommand('cd /tmp/repo && git log --oneline -50'), 'git-log')
  assert.equal(classifyCommand('git diff HEAD~1'), 'git-diff')
  assert.equal(classifyCommand('git -C /tmp/repo log --oneline -80'), 'git-log')
  assert.equal(classifyCommand('git --no-pager diff -- src'), 'git-diff')
  assert.equal(classifyCommand('git -c core.pager=cat status'), 'git-status')
  assert.equal(classifyCommand('ls -la'), 'listing')
  assert.equal(classifyCommand('find . -name "*.ts"'), 'listing')
  assert.equal(classifyCommand('grep -rn "foo" src'), 'search')
  assert.equal(classifyCommand('pnpm install'), 'package')
  assert.equal(classifyCommand('pnpm test:run'), 'test')
  assert.equal(classifyCommand('npx vitest run'), 'test')
  assert.equal(classifyCommand('node scripts/build.mjs'), 'bash')
})

test('classify leaves non-shell tools alone', () => {
  assert.equal(classify('read', { file_path: '/tmp/a.ts' }), null)
  assert.equal(classify('edit', {}), null)
  assert.equal(classify('bash', { command: 'echo hi' }), 'bash')
  assert.equal(classify('grep', { pattern: 'x' }), 'search')
})

test('generic shell digest keeps errors and folds the middle', () => {
  const text = lines(200, (index) => {
    if (index === 120) return 'ERROR src/app.ts:42: TypeError: boom'
    if (index === 121) return '    at handler (/repo/src/app.ts:42:9)'
    return `progress line ${index} ${'x'.repeat(20)}`
  }).join('\n')
  const result = digest('bash', text, OPTIONS)
  assert.ok(result !== null)
  assert.ok(result.text.length < text.length)
  assert.ok(result.text.includes('ERROR src/app.ts:42'))
  assert.ok(result.text.includes('at handler (/repo/src/app.ts:42:9)'))
  assert.match(result.text, /lines omitted/)
})

test('collapse repeated lines', () => {
  const repeated = Array.from({ length: 60 }, () => 'downloading 42%').join('\n')
  const text = `start\n${repeated}\nend`
  const result = digest('bash', `${text}\n${lines(80, (i) => `tail ${i}`).join('\n')}`, OPTIONS)
  assert.ok(result !== null)
  assert.match(result.text, /repeated/)
})

test('short results are never touched', () => {
  assert.equal(digest('bash', 'short output', OPTIONS), null)
})

test('git status drops advice rows and caps each group', () => {
  const entries = lines(30, (index) => `\tmodified:   src/file-${index}.ts`)
  const text = [
    'On branch main',
    "Your branch is up to date with 'origin/main'.",
    '',
    'Changes not staged for commit:',
    '  (use "git add <file>..." to update what will be committed)',
    ...entries,
    '',
    'Unmerged paths:',
    '  (use "git add <file>..." to mark resolution)',
    '\tboth modified:   src/conflict.ts',
    '',
    'no changes added to commit (use "git add" and/or "git commit -a")',
    ...lines(40, (index) => `\tpadding-${index}`),
  ].join('\n')
  const result = digest('git-status', text, OPTIONS)
  assert.ok(result !== null)
  assert.ok(!/^ {2,}\(use /m.test(result.text))
  assert.ok(result.text.includes('src/conflict.ts'))
  assert.match(result.text, /more in this group/)
  assert.ok(result.text.length < text.length)
})

test('git log oneline is capped', () => {
  const text = lines(60, (index) => `${'a'.repeat(7)}${index.toString().padStart(3, '0')} commit ${index}`).join('\n')
  const result = digest('git-log', text, OPTIONS)
  assert.ok(result !== null)
  assert.match(result.text, /more commits/)
  assert.equal(result.text.split('\n').filter((line) => !line.startsWith('[...')).length, 30)
})

test('git diff keeps per-file stats and hunk headers', () => {
  const sections = lines(3, (file) => {
    const body = lines(20, (index) => `+added line ${index} ${'y'.repeat(30)}`).join('\n')
    return `diff --git a/src/file-${file}.ts b/src/file-${file}.ts\nindex 111..222 100644\n--- a/src/file-${file}.ts\n+++ b/src/file-${file}.ts\n@@ -1,3 +1,20 @@\n${body}`
  })
  const text = `${sections.join('\n')}\n${'z'.repeat(4000)}`
  const result = digest('git-diff', text, OPTIONS)
  assert.ok(result !== null)
  assert.match(result.text, /diff src\/file-0\.ts {2}\(\+\d+\/-\d+\)/)
  assert.ok(result.text.includes('@@ -1,3 +1,20 @@'))
  assert.match(result.text, /lines omitted/)
})

test('listing is capped with a remainder marker', () => {
  const text = lines(220, (index) => `./src/module-${index}.ts`).join('\n')
  const result = digest('listing', text, OPTIONS)
  assert.ok(result !== null)
  assert.match(result.text, /more entries/)
  assert.ok(result.text.length < text.length)
})

test('search output is grouped by file', () => {
  const text = lines(300, (index) => `src/file-${index % 12}.ts:${index + 1}:const value = ${index}`).join('\n')
  const result = digest('search', text, OPTIONS)
  assert.ok(result !== null)
  assert.match(result.text, /search digest: 300 matches in 12 files/)
  assert.match(result.text, /more matches in this file/)
})

test('package installs keep warnings and the tail', () => {
  const text = [
    ...lines(120, (index) => `Progress: resolved ${index}`),
    'WARN deprecated left-pad@1.3.0: use something else',
    'ERR_PNPM_FETCH_404 GET https://registry.example/missing: Not found',
    ...lines(30, (index) => `tail line ${index}`),
  ].join('\n')
  const result = digest('package', text, OPTIONS)
  assert.ok(result !== null)
  assert.ok(result.text.includes('ERR_PNPM_FETCH_404'))
  assert.ok(result.text.includes('WARN deprecated'))
})

test('test output keeps failures and summaries', () => {
  const text = [
    ' RUN  v4.1.8 /repo',
    ...lines(40, (index) => ` ✓ src/unit-${index}.test.ts (3 tests)`),
    ' FAIL  src/broken.test.ts > suite > case',
    'AssertionError: expected 1 to be 2',
    '  at src/broken.test.ts:14:22',
    ...lines(40, (index) => ` ✓ src/late-${index}.test.ts (1 test)`),
    ' Test Files  1 failed | 80 passed (81)',
    '      Tests  1 failed | 240 passed (241)',
  ].join('\n')
  const result = digest('test', text, OPTIONS)
  assert.ok(result !== null)
  assert.ok(result.text.includes('FAIL  src/broken.test.ts'))
  assert.ok(result.text.includes('AssertionError'))
  assert.ok(result.text.includes('Test Files  1 failed'))
})

test('error lines survive in every generated shell output', () => {
  for (let round = 0; round < 200; round += 1) {
    const body = lines(100, (index) => `noise ${round}-${index} ${'q'.repeat(30)}`)
    body.splice(50, 0, `ERROR round ${round}: fatal failure`)
    const result = digest('bash', body.join('\n'), OPTIONS)
    if (result === null) continue
    assert.ok(result.text.includes(`ERROR round ${round}: fatal failure`), `round ${round} dropped the error line`)
    assert.ok(result.text.length < body.join('\n').length)
  }
})
