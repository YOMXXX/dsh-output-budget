/**
 * Session projection that turns committed `tool/call` + `tool/result` events
 * into the numbers the budget panel shows.
 *
 * Nothing is written to the Session: the fold only reads events that already
 * exist. A result counts as rewritten when it carries our retention notice, so
 * the numbers are derived from the log rather than from plugin memory and stay
 * correct after a fork or a replay.
 */
import { classifyCommand } from './classify.js'
import { StateSchema, ViewSchema } from './schema.js'

/** Projection key the client reads with `useProjection`. */
export const PROJECTION_KEY = 'outputBudget'

const MAX_ITEMS = 24
const MAX_CALLS = 64

/** The retention notice this plugin appends. */
const NOTICE = /\(Omitted (\d+) bytes\./

/**
 * Byte count claimed by the trailing notice, or null when there is none.
 * @param {string} text
 * @returns {number | null}
 */
export function omittedBytesOf(text) {
  const index = text.lastIndexOf('(Omitted ')
  if (index < 0) return null
  const match = NOTICE.exec(text.slice(index))
  if (match === null) return null
  const bytes = Number(match[1])
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null
}

/**
 * Byte count of the notice itself, so the preview count excludes its claim.
 * @param {string} text
 */
function noticeBytes(text) {
  const index = text.lastIndexOf('(Omitted ')
  return index < 0 ? 0 : Buffer.byteLength(text.slice(index), 'utf8')
}

/** @param {unknown} content */
function textOfContent(content) {
  if (!Array.isArray(content)) return null
  let text = ''
  for (const block of content) {
    if (block === null || typeof block !== 'object') return null
    const typed = /** @type {{ type?: unknown, text?: unknown }} */ (block)
    if (typed.type !== 'text' || typeof typed.text !== 'string') return null
    text += typed.text
  }
  return text
}

/** @param {string} command */
function commandLabel(command) {
  const single = command.replace(/\s+/g, ' ').trim()
  return single.length > 96 ? `${single.slice(0, 94)}…` : single
}

/** @returns {Record<string, any>} */
function emptyState() {
  return {
    rewritten: 0,
    savedBytes: 0,
    previewBytes: 0,
    byShape: {},
    items: [],
    calls: {},
  }
}

/** @param {Record<string, any>} state */
function viewOf(state) {
  return {
    rewritten: state.rewritten,
    savedBytes: state.savedBytes,
    previewBytes: state.previewBytes,
    byShape: state.byShape,
    items: state.items,
    ...state.lastShape === undefined ? {} : { lastShape: state.lastShape },
  }
}

/**
 * Register the projection on the calling context.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Promise<unknown>} registration handle
 */
export function registerOutputBudget(ctx) {
  return ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema: StateSchema,
    stateVersion: 1,
    init: emptyState,
    apply(state, event) {
      if (event.type === 'tool/call') {
        const data = /** @type {{ callId?: string, name?: string, arguments?: string }} */ (event.data)
        if (typeof data.callId !== 'string') return state
        let command = ''
        try {
          const parsed = JSON.parse(typeof data.arguments === 'string' ? data.arguments : '{}')
          if (typeof parsed?.command === 'string') command = parsed.command
        } catch {
          command = ''
        }
        const calls = { ...state.calls, [data.callId]: { name: data.name ?? '', command } }
        const ids = Object.keys(calls)
        if (ids.length > MAX_CALLS) {
          for (const stale of ids.slice(0, ids.length - MAX_CALLS)) delete calls[stale]
        }
        return { ...state, calls }
      }
      if (event.type !== 'tool/result') return state

      const data = /** @type {{ message?: { content?: unknown, toolCallId?: string }, toolCallId?: string, callId?: string }} */ (event.data)
      const message = data.message ?? {}
      const callId = typeof message.toolCallId === 'string'
        ? message.toolCallId
        : typeof data.toolCallId === 'string' ? data.toolCallId : data.callId
      const text = textOfContent(message.content)
      if (text === null) return state

      const call = typeof callId === 'string' ? state.calls[callId] : undefined
      let calls = state.calls
      if (typeof callId === 'string' && call !== undefined) {
        calls = { ...state.calls }
        delete calls[callId]
      }
      const omitted = omittedBytesOf(text)
      if (omitted === null) return calls === state.calls ? state : { ...state, calls }

      const shape = call === undefined || call.command === '' ? 'bash' : classifyCommand(call.command)
      const previous = state.byShape[shape] ?? { count: 0, savedBytes: 0 }
      const item = {
        seq: event.seq,
        at: event.time,
        shape,
        command: commandLabel(call?.command ?? ''),
        omittedBytes: omitted,
        previewBytes: Math.max(0, Buffer.byteLength(text, 'utf8') - noticeBytes(text)),
      }
      return {
        ...state,
        calls,
        rewritten: state.rewritten + 1,
        savedBytes: state.savedBytes + omitted,
        previewBytes: state.previewBytes + item.previewBytes,
        byShape: { ...state.byShape, [shape]: { count: previous.count + 1, savedBytes: previous.savedBytes + omitted } },
        items: [...state.items, item].slice(-MAX_ITEMS),
        lastShape: shape,
      }
    },
    wire: { viewSchema: ViewSchema, view: viewOf, summary: false },
  })
}
