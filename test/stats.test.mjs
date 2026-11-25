import test from 'node:test'
import assert from 'node:assert/strict'
import { createStats } from '../src/stats.js'

test('stats stay quiet before the first record', () => {
  const stats = createStats()
  assert.match(stats.report(), /no tool result has been inspected/)
})

test('dry-run records are counted but never add to savings', () => {
  const stats = createStats()
  stats.record({ sessionId: 'session-a', shape: 'git-status', beforeChars: 5000, afterChars: 1000, applied: false })
  const report = stats.report()
  assert.match(report, /inspected 1 result\(s\), rewrote 0/)
  assert.match(report, /saved 0 chars/)
})

test('applied records accumulate per session and per shape', () => {
  const stats = createStats()
  stats.record({ sessionId: 'session-a', shape: 'git-status', beforeChars: 5000, afterChars: 1000, applied: true })
  stats.record({ sessionId: 'session-a', shape: 'search', beforeChars: 3000, afterChars: 900, applied: true })
  stats.record({ sessionId: 'session-b', shape: 'bash', beforeChars: 2000, afterChars: 1500, applied: true })
  const report = stats.report()
  assert.match(report, /inspected 3 result\(s\), rewrote 3/)
  assert.match(report, /saved 6,600 chars/)
  assert.match(report, /session-a/)
  assert.match(report, /git-status 4,000/)
})

test('reset clears the counters', () => {
  const stats = createStats()
  stats.record({ sessionId: 'session-a', shape: 'bash', beforeChars: 2000, afterChars: 1000, applied: true })
  stats.reset()
  assert.match(stats.report(), /no tool result has been inspected/)
})
