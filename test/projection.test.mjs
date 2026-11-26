import test from 'node:test'
import assert from 'node:assert/strict'
import { omittedBytesOf, registerOutputBudget } from '../src/projection.js'

function capture() {
  const box = { definition: null }
  return {
    ctx: {
      sessionProjections: {
        register(definition) {
          box.definition = definition
          return Promise.resolve({ dispose: () => Promise.resolve() })
        },
      },
    },
    get definition() {
      return box.definition
    },
  }
}

const call = (seq, callId, command) => ({
  type: 'tool/call', seq, time: seq * 10,
  data: { callId, name: 'bash', arguments: JSON.stringify({ command }), turn: 1, step: 1 },
})
const result = (seq, callId, text) => ({
  type: 'tool/result', seq, time: seq * 10,
  data: { message: { content: [{ type: 'text', text }], toolCallId: callId }, turn: 1, step: 1 },
})
const NOTICE = '\n\n(Omitted 3000 bytes. Full formatted result stored at: /tmp/x.txt. Use read with offset/limit.)'

test('omittedBytesOf reads our notice', () => {
  assert.equal(omittedBytesOf(`condensed body${NOTICE}`), 3000)
  assert.equal(omittedBytesOf('no notice here'), null)
  assert.equal(omittedBytesOf('(Omitted 12 bytes. Full formatted result stored at: /tmp/a. Use read.)'), 12)
})

test('the fold counts rewrites and classifies the shape from the call', async () => {
  const cap = capture()
  await registerOutputBudget(cap.ctx)
  const definition = cap.definition
  assert.equal(definition.key, 'outputBudget')
  assert.equal(definition.stateVersion, 1)

  let state = definition.init()
  state = definition.apply(state, call(1, 'a', 'git -C /repo status'))
  state = definition.apply(state, result(2, 'a', `condensed body${NOTICE}`))
  state = definition.apply(state, call(3, 'b', 'grep -rn TODO src'))
  state = definition.apply(state, result(4, 'b', 'preview body\n\n(Omitted 512 bytes. Full formatted result stored at: /tmp/y. Use read.)'))

  assert.equal(state.rewritten, 2)
  assert.equal(state.savedBytes, 3512)
  assert.equal(state.byShape['git-status'].count, 1)
  assert.equal(state.byShape.search.count, 1)
  assert.equal(state.items.length, 2)
  assert.match(state.items[0].command, /git -C \/repo status/)
  assert.equal(Object.keys(state.calls).length, 0, 'the call ledger is consumed by its result')

  const view = definition.wire.view(state)
  assert.equal(view.calls, undefined, 'the client view never carries the call ledger')
  assert.equal(definition.wire.summary, false)
})

test('results without a notice change nothing but the consumed call', async () => {
  const cap = capture()
  await registerOutputBudget(cap.ctx)
  const definition = cap.definition
  const initial = definition.init()
  assert.equal(definition.apply(initial, result(1, 'x', 'plain output')), initial)

  const withCall = definition.apply(initial, call(2, 'y', 'git status'))
  assert.notEqual(withCall, initial)
  const afterPlain = definition.apply(withCall, result(3, 'y', 'plain output'))
  assert.equal(afterPlain.savedBytes, 0)
  assert.equal(afterPlain.rewritten, 0)
  assert.equal(Object.keys(afterPlain.calls).length, 0)
})
