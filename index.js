/**
 * dsh-output-budget — shape-aware tool-output budgeting for DeepSeek Harness.
 *
 * Every tool result is inspected once, after the tool ran and before it enters
 * the context. Noisy shapes are rewritten into a denser preview, the full text
 * is stored through the harness spill store, and the model gets an explicit
 * recoverability notice. Errors are never touched.
 *
 * @module dsh-output-budget
 */
import Schema from '@deepseek-ai/schemastery'
import { applyBudget } from './src/policy.js'
import { createStats } from './src/stats.js'

/** Cordis plugin identity; also the bundle row id. */
export const name = 'dsh-output-budget'

/** The tool registry is the only hard dependency. */
export const inject = ['tools']

/**
 * @typedef {object} ConfigShape
 * @property {boolean} enabled
 * @property {string} mode
 * @property {number} maxContentChars
 * @property {number} minChars
 * @property {boolean} spill
 * @property {boolean} digestBashGeneric
 * @property {boolean} digestListing
 * @property {boolean} digestGit
 * @property {boolean} digestSearch
 * @property {boolean} digestPackage
 * @property {boolean} digestTest
 */

export const Config = Schema.object({
  enabled: Schema.boolean().default(true)
    .description('Master switch. false restores the untouched tool results byte for byte.'),
  mode: Schema.string().default('apply')
    .description("'apply' rewrites results, 'dry-run' only measures, 'off' does nothing."),
  maxContentChars: Schema.natural().min(200).max(200000).default(6000)
    .description('Target size of the rewritten preview in characters (≈4 characters per token).'),
  minChars: Schema.natural().min(0).max(200000).default(1200)
    .description('Results shorter than this are never inspected.'),
  spill: Schema.boolean().default(true)
    .description('Store the full text through the harness spill store so the model can read it back.'),
  digestBashGeneric: Schema.boolean().default(true)
    .description('Digest other shell output: ANSI, progress frames, repeated lines, error windows.'),
  digestListing: Schema.boolean().default(true)
    .description('Cap long ls/find/tree listings.'),
  digestGit: Schema.boolean().default(true)
    .description('Digest git status, git log and git diff/show output.'),
  digestSearch: Schema.boolean().default(true)
    .description('Group many grep/rg matches by file.'),
  digestPackage: Schema.boolean().default(true)
    .description('Keep warnings and errors from package-manager installs.'),
  digestTest: Schema.boolean().default(false)
    .description('Digest test-runner output down to failures and summaries. Off by default: runners vary.'),
})

/**
 * Mount the budget policy.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {ConfigShape} config
 */
export function apply(ctx, config) {
  const stats = createStats()
  /** Runtime override from `/budget`, so A/B needs no patch edit. */
  let runtimeMode = null
  /** @returns {string} */
  const currentMode = () => runtimeMode ?? config.mode

  /** @param {string} line */
  function commandResult(line) {
    const verb = line.trim().toLowerCase()
    if (verb === '' || verb === 'report') {
      return `${stats.report()}\nmode: ${currentMode()} · maxContentChars: ${config.maxContentChars}`
        + ` · minChars: ${config.minChars} · spill: ${config.spill}`
    }
    if (verb === 'on' || verb === 'off' || verb === 'dry-run' || verb === 'apply') {
      runtimeMode = verb === 'on' ? 'apply' : verb === 'off' ? 'off' : verb
      return `output-budget mode is now '${runtimeMode}' for this process (patch config: '${config.mode}').`
    }
    if (verb === 'reset') {
      stats.reset()
      return 'output-budget counters reset.'
    }
    return 'usage: /budget [report|on|off|dry-run|apply|reset]'
  }

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    return applyBudget(exec, result, decision, {
      config,
      mode: currentMode(),
      spillStore: ctx.get('spillStore'),
      stats,
      log: ctx.logger,
    })
  })

  ctx.inject(['commands'], (scope) => {
    scope.effect(() => scope.commands.register({
      name: 'budget',
      description: 'Inspect or change the tool-output budget for this process.',
      input: { hint: '[report|on|off|dry-run|apply|reset]' },
      handler: (invocation) => ({ kind: 'success', text: commandResult(invocation.rawInput) }),
    }), 'dsh-output-budget: /budget')
  })
}
