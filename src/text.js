/** Small text helpers shared by the digest layers. Pure, allocation-light. */

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-Z\\-_]/g

/**
 * Remove ANSI escape sequences (colors, cursor movement, OSC titles).
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return text.includes('\u001b') ? text.replace(ANSI, '') : text
}

/**
 * Collapse carriage-return progress frames: a line that overwrote itself with
 * `\r` keeps only its final state.
 * @param {string} text
 * @returns {string}
 */
export function collapseCarriageReturns(text) {
  if (!text.includes('\r')) return text
  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line
      const frames = line.split('\r')
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index].trim() !== '') return frames[index]
      }
      return ''
    })
    .join('\n')
}

/**
 * Split into lines without dropping a trailing empty line marker.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return text.split(/\r?\n/)
}

/**
 * Truncate at a character budget without splitting a surrogate pair.
 * @param {string} text
 * @param {number} max
 * @param {string} marker
 * @returns {string}
 */
export function truncateAtChars(text, max, marker = '…') {
  if (text.length <= max) return text
  const budget = Math.max(0, max - marker.length)
  let cut = budget
  if (cut > 0) {
    const code = text.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  }
  return text.slice(0, cut) + marker
}

/**
 * Byte length of a string in UTF-8, matching the spill notice accounting.
 * @param {string} text
 * @returns {number}
 */
export function byteLength(text) {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Join lines until a character budget is spent.
 * @param {string[]} lines
 * @param {number} maxChars
 * @returns {string[]}
 */
export function takeLines(lines, maxChars) {
  const out = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + 1
    if (used + cost > maxChars) break
    out.push(line)
    used += cost
  }
  return out
}
