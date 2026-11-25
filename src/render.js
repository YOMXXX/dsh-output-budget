/**
 * Assemble the model-facing preview and recognise an already-budgeted result.
 *
 * The notice reproduces the harness retention wording exactly
 * (`(Omitted N bytes. Full formatted result stored at: <locator>. <hint>)`) so
 * the Web UI's existing spill affordances keep recognising the preview.
 */

const OPEN = '('
const CLOSE = ')'
const LOCATION = ' Full formatted result stored at: '

/** Marker shared with the harness retention notice. */
const SPILL_MARKER = 'Full formatted result stored at:'

/** Marker unique to this plugin when no spill store is available. */
const LOCAL_MARKER = 'bytes omitted from the preview'

/**
 * Whether a tool result already carries a retention notice (harness spill
 * policy or an earlier pass of this plugin) and must not be rewritten again.
 * @param {string} text
 * @returns {boolean}
 */
export function isAlreadyDigested(text) {
  if (!text.includes(SPILL_MARKER) && !text.includes(LOCAL_MARKER)) return false
  const tail = text.slice(-4000)
  return tail.includes(SPILL_MARKER) || tail.includes(LOCAL_MARKER)
}

/**
 * @param {{ bytes: number, retrieval: { locator: string, retrievalHint: string } }} input
 * @returns {string}
 */
export function buildSpillNotice(input) {
  return `${OPEN}Omitted ${Math.max(0, Math.trunc(input.bytes))} bytes.`
    + `${LOCATION}${input.retrieval.locator}. ${input.retrieval.retrievalHint}${CLOSE}`
}

/**
 * Build the replacement text: digest plus a recoverability notice.
 * @param {string} digestText
 * @param {{ ref?: { locator: string, retrievalHint: string }, omittedBytes: number }} options
 * @returns {string}
 */
export function buildDigestContent(digestText, options) {
  const bytes = Math.max(0, Math.trunc(options.omittedBytes))
  const notice = options.ref === undefined
    ? `(${bytes} bytes omitted from the preview. Re-run the command to see the full output.)`
    : buildSpillNotice({ bytes, retrieval: options.ref })
  return `${digestText}\n\n${notice}`
}
