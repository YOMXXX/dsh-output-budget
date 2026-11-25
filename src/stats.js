/**
 * Per-process accounting. Host-only and in memory: the plugin writes no Session
 * event and no file of its own, so this is a derived cache for `/budget`.
 */

/** Heuristic tokens, matching the harness estimator density. */
const CHARS_PER_TOKEN = 4

/** @param {number} chars */
function tokens(chars) {
  return `~${Math.round(chars / CHARS_PER_TOKEN).toLocaleString('en-US')} tokens`
}

/** @param {number} value */
function num(value) {
  return value.toLocaleString('en-US')
}

/**
 * @returns {{
 *   record: (input: { sessionId?: string, shape: string, beforeChars: number, afterChars: number, applied: boolean }) => void,
 *   report: () => string,
 *   reset: () => void,
 * }}
 */
export function createStats() {
  /** @type {Map<string, { processed: number, applied: number, savedChars: number, byShape: Map<string, number> }>} */
  const bySession = new Map()
  let processed = 0
  let applied = 0
  let savedChars = 0

  /** @param {string} key */
  function cellOf(key) {
    let cell = bySession.get(key)
    if (cell === undefined) {
      cell = { processed: 0, applied: 0, savedChars: 0, byShape: new Map() }
      bySession.set(key, cell)
    }
    return cell
  }

  return {
    record(input) {
      processed += 1
      if (!input.applied) return
      const saved = Math.max(0, input.beforeChars - input.afterChars)
      applied += 1
      savedChars += saved
      const cell = cellOf(input.sessionId ?? 'unknown')
      cell.processed += 1
      cell.applied += 1
      cell.savedChars += saved
      cell.byShape.set(input.shape, (cell.byShape.get(input.shape) ?? 0) + saved)
    },
    report() {
      if (processed === 0) return 'output-budget: no tool result has been inspected yet in this process.'
      const out = [
        'output-budget (this process)',
        `inspected ${num(processed)} result(s), rewrote ${num(applied)}`,
        `saved ${num(savedChars)} chars (${tokens(savedChars)})`,
      ]
      for (const [sessionId, cell] of bySession) {
        const shapes = [...cell.byShape.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([shape, chars]) => `${shape} ${num(chars)}`)
          .join(', ')
        out.push(`  ${sessionId.slice(0, 12)}…  ${num(cell.applied)}/${num(cell.processed)} rewritten, `
          + `saved ${num(cell.savedChars)} chars${shapes === '' ? '' : ` [${shapes}]`}`)
      }
      return out.join('\n')
    },
    reset() {
      bySession.clear()
      processed = 0
      applied = 0
      savedChars = 0
    },
  }
}
