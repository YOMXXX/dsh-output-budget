/**
 * The budget decision, extracted from the Cordis glue so it can be tested
 * without a runtime. Pure apart from the injected spill store and stats sink.
 */
import { classify } from './classify.js'
import { digest } from './digest.js'
import { buildDigestContent, isAlreadyDigested } from './render.js'
import { byteLength } from './text.js'

/** Shapes to their config switch. @param {string} shape */
export function shapeGroup(shape) {
  if (shape.startsWith('git')) return 'digestGit'
  switch (shape) {
    case 'listing':
      return 'digestListing'
    case 'search':
      return 'digestSearch'
    case 'package':
      return 'digestPackage'
    case 'test':
      return 'digestTest'
    default:
      return 'digestBashGeneric'
  }
}

/**
 * Plain text of a content array, or null when the result carries non-text blocks.
 * @param {unknown} content
 * @returns {string | null}
 */
export function textOf(content) {
  if (!Array.isArray(content) || content.length === 0) return null
  let text = ''
  for (const block of content) {
    if (block === null || typeof block !== 'object') return null
    const typed = /** @type {{ type?: unknown, text?: unknown }} */ (block)
    if (typed.type !== 'text' || typeof typed.text !== 'string') return null
    text += typed.text
  }
  return text
}

/**
 * Whether a result represents a failure. Failures keep every byte: a digested
 * failure hides the evidence the model is about to reason about.
 * @param {{ isError?: boolean, value?: unknown }} result
 * @param {string} text
 * @returns {boolean}
 */
export function indicatesFailure(result, text) {
  if (result.isError === true) return true
  if (/\[exit code: [1-9]\d*\]/.test(text)) return true
  const value = result.value
  if (value === null || typeof value !== 'object') return false
  const typed = /** @type {{ exitCode?: unknown, signal?: unknown, timedOut?: unknown, aborted?: unknown, sandbox?: { denied?: unknown } }} */ (value)
  if (typeof typed.exitCode === 'number' && typed.exitCode !== 0) return true
  if (typed.signal !== undefined && typed.signal !== null) return true
  if (typed.timedOut === true || typed.aborted === true) return true
  if (typed.sandbox?.denied === true) return true
  return false
}

/**
 * Rewrite one accepted tool result when a digest applies.
 * @param {{ name: string, arguments?: unknown, callId?: unknown, parent?: unknown, agent?: { session?: { header?: { id?: string } } } }} exec
 * @param {{ isError?: boolean, content?: unknown }} result
 * @param {{ kind: 'accept', content?: unknown, value?: unknown, additionalContexts?: unknown }} decision
 * @param {{
 *   config: Record<string, any>,
 *   mode: string,
 *   spillStore?: { saveText: (input: any) => Promise<{ locator: string, retrievalHint: string }> },
 *   stats: { record: (input: any) => void },
 *   log?: { warn?: (message: string) => void, debug?: (message: string) => void },
 *   digestFn?: typeof digest,
 *   classifyFn?: typeof classify,
 * }} deps
 * @returns {Promise<any>} the decision to hand back to the harness
 */
export async function applyBudget(exec, result, decision, deps) {
  const { config, mode, stats } = deps
  const digestFn = deps.digestFn ?? digest
  const classifyFn = deps.classifyFn ?? classify
  try {
    if (decision.kind !== 'accept') return decision
    // A structured `value` means the model reads JSON, not a preview.
    if (Object.hasOwn(decision, 'value')) return decision
    if (config.enabled !== true) return decision
    if (mode === 'off') return decision
    // Sub-dispatches (PTC) already have their own log-only retention path.
    if (exec.parent !== undefined) return decision
    const text = textOf(decision.content ?? result.content)
    if (text === null) return decision
    // Failures keep every byte: that is the safety contract.
    if (indicatesFailure(result, text)) return decision
    if (text.length < config.minChars) return decision
    if (isAlreadyDigested(text)) return decision
    const shape = classifyFn(exec.name, exec.arguments)
    if (shape === null) return decision
    if (config[shapeGroup(shape)] !== true) return decision
    const digested = digestFn(shape, text, { maxChars: config.maxContentChars, minChars: config.minChars })
    if (digested === null) return decision

    const sessionId = exec.agent?.session?.header?.id
    if (mode === 'dry-run') {
      stats.record({ sessionId, shape, beforeChars: text.length, afterChars: digested.text.length, applied: false })
      return decision
    }

    let ref
    if (config.spill === true && sessionId !== undefined && deps.spillStore !== undefined) {
      try {
        ref = await deps.spillStore.saveText({
          owner: { sessionId },
          source: { kind: 'tool', toolName: exec.name, callId: exec.callId, label: 'result' },
          suggestedName: `${exec.name}.txt`,
          content: text,
        })
      } catch (error) {
        deps.log?.warn?.(`output-budget: spill failed (${String(error)}); keeping the original result`)
        return decision
      }
    }

    const omittedBytes = Math.max(0, byteLength(text) - byteLength(digested.text))
    const preview = buildDigestContent(digested.text, { ref, omittedBytes })
    if (preview.length >= text.length) return decision

    stats.record({ sessionId, shape, beforeChars: text.length, afterChars: preview.length, applied: true })
    deps.log?.debug?.(`output-budget: ${shape} ${text.length} → ${preview.length} chars`)
    return { ...decision, content: [{ type: 'text', text: preview }] }
  } catch (error) {
    deps.log?.warn?.(`output-budget: digest skipped (${String(error)}); keeping the original result`)
    return decision
  }
}
