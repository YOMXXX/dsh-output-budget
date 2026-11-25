import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDigestContent, buildSpillNotice, isAlreadyDigested } from '../src/render.js'

test('spill notice reproduces the harness retention wording', () => {
  const notice = buildSpillNotice({
    bytes: 1234,
    retrieval: { locator: '/var/spill/bash-result.txt', retrievalHint: 'Use read with this path.' },
  })
  assert.equal(notice,
    '(Omitted 1234 bytes. Full formatted result stored at: /var/spill/bash-result.txt. Use read with this path.)')
})

test('the harness notice is recognised as already digested', () => {
  assert.equal(isAlreadyDigested('body\n\n(Omitted 42 bytes. Full formatted result stored at: /tmp/a. Use read.)'), true)
  assert.equal(isAlreadyDigested('body\n\n(42 bytes omitted from the preview. Re-run the command to see the full output.)'), true)
  assert.equal(isAlreadyDigested('ordinary output without any notice'), false)
})

test('preview content joins the digest and the notice', () => {
  const withSpill = buildDigestContent('digest body', {
    ref: { locator: '/tmp/a.txt', retrievalHint: 'Use read.' },
    omittedBytes: 99,
  })
  assert.equal(withSpill, 'digest body\n\n(Omitted 99 bytes. Full formatted result stored at: /tmp/a.txt. Use read.)')
  const withoutSpill = buildDigestContent('digest body', { omittedBytes: 99 })
  assert.match(withoutSpill, /^digest body\n\n\(99 bytes omitted from the preview/)
})
