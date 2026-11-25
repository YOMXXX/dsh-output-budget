import test from 'node:test'
import assert from 'node:assert/strict'
import * as plugin from '../index.js'

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
    'Changes not staged for commit:',
    '  (use "git add <file>..." to update what will be committed)',
    ...entries,
  ].join('\n')
}

function fakeContext(options = {}) {
  const listeners = new Map()
  const commands = []
  const effects = []
  return {
    listeners,
    commands,
    effects,
    ctx: {
      on(name, listener) {
        listeners.set(name, listener)
      },
      inject(deps, callback) {
        callback({
          effect: (factory, label) => {
            effects.push(label)
            return factory()
          },
          commands: {
            register(definition) {
              commands.push(definition)
              return () => {}
            },
          },
        })
      },
      get() {
        return options.spillStore
      },
      logger: { warn() {}, debug() {}, info() {} },
      effect(factory) {
        return factory()
      },
    },
  }
}

test('the plugin exports the manifest fields the harness reads', () => {
  assert.equal(plugin.name, 'dsh-output-budget')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.ok(plugin.Config !== undefined)
  assert.equal(typeof plugin.apply, 'function')
})

test('apply wires one tool-result waterfall and one /budget command', () => {
  const fake = fakeContext()
  plugin.apply(fake.ctx, CONFIG)
  assert.equal(typeof fake.listeners.get('tools/post-execute'), 'function')
  assert.equal(fake.commands.length, 1)
  assert.equal(fake.commands[0].name, 'budget')
  assert.deepEqual(fake.commands[0].input, { hint: '[report|on|off|dry-run|apply|reset]' })
})

test('the waterfall digests a noisy git status and reports it', async () => {
  const fake = fakeContext()
  plugin.apply(fake.ctx, CONFIG)
  const waterfall = fake.listeners.get('tools/post-execute')
  const text = bigStatus()
  const exec = {
    name: 'bash',
    arguments: { command: 'git status' },
    callId: 'call-9',
    agent: { session: { header: { id: 'session-xyz' } } },
  }
  const decision = await waterfall(exec, { isError: false, content: [{ type: 'text', text }] },
    async () => ({ kind: 'accept' }))
  assert.notEqual(decision.content, undefined)
  assert.ok(decision.content[0].text.length < text.length)
  assert.match(decision.content[0].text, /bytes omitted from the preview/)

  const report = fake.commands[0].handler({ rawInput: '' })
  assert.match(report.text, /inspected 1 result\(s\), rewrote 1/)
  assert.match(report.text, /session-xyz/)
})

test('the /budget switch changes the mode for the running process', async () => {
  const fake = fakeContext()
  plugin.apply(fake.ctx, CONFIG)
  const handler = fake.commands[0].handler
  assert.match(handler({ rawInput: 'dry-run' }).text, /mode is now 'dry-run'/)
  const waterfall = fake.listeners.get('tools/post-execute')
  const text = bigStatus()
  const decision = await waterfall(
    { name: 'bash', arguments: { command: 'git status' }, callId: 'call-10', agent: { session: { header: { id: 's' } } } },
    { isError: false, content: [{ type: 'text', text }] },
    async () => ({ kind: 'accept' }),
  )
  assert.equal(decision.content, undefined)
  assert.match(handler({ rawInput: 'report' }).text, /mode: dry-run/)
  assert.match(handler({ rawInput: 'bogus' }).text, /usage: \/budget/)
})
