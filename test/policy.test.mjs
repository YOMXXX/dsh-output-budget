import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBudget } from '../src/policy.js'

const CONFIG = {
  enabled: true,
  mode: 'apply',
  maxContentChars: 6000,
  minChars: 1200,
  spill: true,
  digestBashGeneric: true,
  digestListing: true,
  digestGit: true,
  digestSearch: true,
  digestPackage: true,
  digestTest: false,
}

function bigStatus() {
  const entries = Array.from({ length: 40 }, (_, index) => `\tmodified:   src/file-${index}.ts`)
  return [
    'On branch main',
    "Your branch is up to date with 'origin/main'.",
    '',
    'Changes not staged for commit:',
    '  (use "git add <file>..." to update what will be committed)',
    ...entries,
    '',
    'Untracked files:',
    '  (use "git add <file>..." to include in what will be committed)',
    ...Array.from({ length: 20 }, (_, index) => `\tsrc/new-${index}.ts`),
  ].join('\n')
}

function fakeStats() {
  const records = []
  return { records, record: (entry) => records.push(entry) }
}

function fakeSpill() {
  return {
    async saveText(input) {
      return { locator: '/tmp/spill/bash-result.txt', bytes: input.content.length, retrievalHint: 'Use read on the locator.' }
    },
  }
}

function execFor(command, extra = {}) {
  return {
    name: 'bash',
    arguments: { command },
    callId: 'call-1',
    agent: { session: { header: { id: 'session-abc' } } },
    ...extra,
  }
}

const accept = (content) => ({ kind: 'accept', content })

test('rewrites a noisy git status and saves the original through the spill store', async () => {
  const stats = fakeStats()
  const text = bigStatus()
  const decision = await applyBudget(execFor('git status'), { isError: false, content: [{ type: 'text', text }] },
    accept([{ type: 'text', text }]), { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats })
  const preview = decision.content[0].text
  assert.ok(preview.length < text.length)
  assert.match(preview, /Full formatted result stored at: \/tmp\/spill\/bash-result\.txt/)
  assert.equal(stats.records.length, 1)
  assert.equal(stats.records[0].applied, true)
  assert.equal(stats.records[0].shape, 'git-status')
})

test('errors are never rewritten', async () => {
  const text = bigStatus()
  const decision = { kind: 'accept', content: [{ type: 'text', text }] }
  const out = await applyBudget(execFor('git status'), { isError: true, content: decision.content },
    decision, { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
  assert.deepEqual(out, decision)
})

test('a non-zero exit code is never rewritten', async () => {
  const text = bigStatus()
  const decision = { kind: 'accept', content: [{ type: 'text', text }] }
  const failedShell = { isError: false, content: decision.content, value: { exitCode: 2, stdout: { text }, stderr: { text: '' } } }
  const out = await applyBudget(execFor('git status'), failedShell, decision,
    { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
  assert.equal(out, decision)
})

test('a signalled or timed-out shell is never rewritten', async () => {
  const text = bigStatus()
  const decision = { kind: 'accept', content: [{ type: 'text', text }] }
  for (const value of [{ exitCode: null, signal: 'SIGTERM' }, { exitCode: 0, timedOut: true }, { exitCode: 0, aborted: true }]) {
    const out = await applyBudget(execFor('git status'), { isError: false, content: decision.content, value }, decision,
      { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
    assert.equal(out, decision)
  }
})

test('structured values are never rewritten', async () => {
  const decision = { kind: 'accept', value: { ok: true } }
  const out = await applyBudget(execFor('git status'), { isError: false, content: [] }, decision,
    { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
  assert.equal(out, decision)
})

test('disabled config and off mode pass through untouched', async () => {
  const text = bigStatus()
  const decision = accept([{ type: 'text', text }])
  const disabled = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: { ...CONFIG, enabled: false }, mode: 'apply', stats: fakeStats() })
  assert.equal(disabled, decision)
  const off = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'off', stats: fakeStats() })
  assert.equal(off, decision)
})

test('dry-run measures without changing the result', async () => {
  const stats = fakeStats()
  const text = bigStatus()
  const decision = accept([{ type: 'text', text }])
  const out = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'dry-run', spillStore: fakeSpill(), stats })
  assert.equal(out, decision)
  assert.equal(stats.records.length, 1)
  assert.equal(stats.records[0].applied, false)
  assert.ok(stats.records[0].afterChars < text.length)
})

test('a spill failure keeps the original result', async () => {
  const failing = { async saveText() { throw new Error('disk full') } }
  const text = bigStatus()
  const decision = accept([{ type: 'text', text }])
  const out = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'apply', spillStore: failing, stats: fakeStats(), log: {} })
  assert.equal(out, decision)
})

test('without a spill store the preview carries a re-run notice', async () => {
  const text = bigStatus()
  const decision = accept([{ type: 'text', text }])
  const out = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'apply', stats: fakeStats() })
  assert.notEqual(out, decision)
  assert.match(out.content[0].text, /bytes omitted from the preview/)
})

test('an already digested result is skipped', async () => {
  const text = `${bigStatus()}\n\n(Omitted 900 bytes. Full formatted result stored at: /tmp/x. Use read.)`
  const decision = accept([{ type: 'text', text }])
  const out = await applyBudget(execFor('git status'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
  assert.equal(out, decision)
})

test('non-text and unknown tools are skipped', async () => {
  const image = { kind: 'accept', content: [{ type: 'image', attachment: {} }] }
  const outImage = await applyBudget(execFor('git status'), { isError: false, content: image.content }, image,
    { config: CONFIG, mode: 'apply', stats: fakeStats() })
  assert.equal(outImage, image)
  const readDecision = accept([{ type: 'text', text: 'x'.repeat(9000) }])
  const outRead = await applyBudget({ name: 'read', arguments: {}, callId: 'c' },
    { isError: false, content: readDecision.content }, readDecision,
    { config: CONFIG, mode: 'apply', stats: fakeStats() })
  assert.equal(outRead, readDecision)
})

test('test output is skipped while digestTest stays off', async () => {
  const text = Array.from({ length: 200 }, (_, index) => ` ✓ test ${index}`).join('\n')
  const decision = accept([{ type: 'text', text }])
  const out = await applyBudget(execFor('pnpm test:run'), { isError: false, content: decision.content }, decision,
    { config: CONFIG, mode: 'apply', spillStore: fakeSpill(), stats: fakeStats() })
  assert.equal(out, decision)
})
