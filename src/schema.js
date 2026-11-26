/**
 * Hand-written projection schemas.
 *
 * The projection service only calls `parse()` on a state schema and on a wire
 * view schema, so the plugin needs no schema library: this keeps the shipped
 * bundle dependency-free and lets a malformed checkpoint degrade to a clean
 * state instead of throwing.
 */

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const string = (value, fallback = '') => (typeof value === 'string' ? value : fallback)

/** @param {unknown} value */
function shapeStat(value) {
  const record = isRecord(value) ? value : {}
  return { count: number(record.count), savedBytes: number(record.savedBytes) }
}

/** @param {unknown} value */
function item(value) {
  const record = isRecord(value) ? value : {}
  return {
    seq: number(record.seq),
    at: number(record.at),
    shape: string(record.shape, 'bash'),
    command: string(record.command),
    omittedBytes: number(record.omittedBytes),
    previewBytes: number(record.previewBytes),
  }
}

/** @param {unknown} value */
function byShape(value) {
  if (!isRecord(value)) return {}
  const out = {}
  for (const [shape, stat] of Object.entries(value)) {
    if (typeof shape !== 'string' || shape === '') continue
    out[shape] = shapeStat(stat)
  }
  return out
}

/** Internal state, including the tool-call ledger. */
export const StateSchema = {
  /** @param {unknown} value */
  parse(value) {
    const record = isRecord(value) ? value : {}
    const items = Array.isArray(record.items) ? record.items.slice(-24).map(item) : []
    const calls = {}
    if (isRecord(record.calls)) {
      for (const [callId, entry] of Object.entries(record.calls)) {
        if (typeof callId !== 'string' || !isRecord(entry)) continue
        calls[callId] = { name: string(entry.name), command: string(entry.command) }
      }
    }
    const state = {
      rewritten: number(record.rewritten),
      savedBytes: number(record.savedBytes),
      previewBytes: number(record.previewBytes),
      byShape: byShape(record.byShape),
      items,
      calls,
    }
    if (typeof record.lastShape === 'string' && record.lastShape !== '') state.lastShape = record.lastShape
    return state
  },
}

/** Client-facing view: the call ledger never leaves the Host. */
export const ViewSchema = {
  /** @param {unknown} value */
  parse(value) {
    const state = StateSchema.parse(value)
    const view = {
      rewritten: state.rewritten,
      savedBytes: state.savedBytes,
      previewBytes: state.previewBytes,
      byShape: state.byShape,
      items: state.items,
    }
    if (state.lastShape !== undefined) view.lastShape = state.lastShape
    return view
  },
}
