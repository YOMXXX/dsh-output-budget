/**
 * Shape-aware digests. Every digest is a pure function of text and returns a
 * denser rendering of the same information, or null when nothing is gained.
 * Omitted regions are always replaced by an explicit line-count marker.
 */
import { collapseCarriageReturns, splitLines, stripAnsi, takeLines, truncateAtChars } from './text.js'

/** `git status` advice rows, which carry no state. */
const GIT_HINT = /^\s{2,}\(use /

/** Lines that must never be dropped, and that pull a context window with them. */
const ERROR_HINT = /(^|[\s:([/_-])(error|errors|failed|failure|fail|fatal|exception|traceback|panic|err!|error\s+ts\d+|cannot|denied|✗|×|FAILED)([\s:)\].,!_-]|$)/i

/** @param {string} line */
export function isErrorLine(line) {
  return ERROR_HINT.test(line)
}

/** @param {number} count @returns {string} */
function omission(count) {
  return `[... ${count} line${count === 1 ? '' : 's'} omitted ...]`
}

/**
 * Turn a keep mask into text with omission markers.
 * @param {readonly string[]} lines
 * @param {readonly boolean[]} keep
 * @returns {{ text: string, omittedLines: number, keptLines: number }}
 */
export function renderMasked(lines, keep) {
  const out = []
  let pending = 0
  let totalOmitted = 0
  let kept = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (keep[index]) {
      if (pending > 0) {
        out.push(omission(pending))
        totalOmitted += pending
        pending = 0
      }
      out.push(lines[index])
      kept += 1
    } else {
      pending += 1
    }
  }
  if (pending > 0) {
    out.push(omission(pending))
    totalOmitted += pending
  }
  return { text: out.join('\n'), omittedLines: totalOmitted, keptLines: kept }
}

/** @param {number} length @param {number} head @param {number} tail */
function headTailMask(length, head, tail) {
  const keep = new Array(length).fill(false)
  for (let index = 0; index < Math.min(head, length); index += 1) keep[index] = true
  for (let index = Math.max(head, length - tail); index < length; index += 1) keep[index] = true
  return keep
}

/** @param {readonly string[]} lines @param {(line: string) => boolean} match @param {number} context */
function markedMask(lines, match, context) {
  const keep = new Array(lines.length).fill(false)
  for (let index = 0; index < lines.length; index += 1) {
    if (!match(lines[index])) continue
    const from = Math.max(0, index - context)
    const to = Math.min(lines.length - 1, index + context)
    for (let cursor = from; cursor <= to; cursor += 1) keep[cursor] = true
  }
  return keep
}

/** @param {readonly boolean[]} left @param {readonly boolean[]} right */
function orMask(left, right) {
  return left.map((value, index) => value || right[index] === true)
}

/** Fold runs of identical lines; blank runs collapse to one blank line. */
function foldRepeats(lines) {
  const out = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    let run = 1
    while (index + run < lines.length && lines[index + run] === line) run += 1
    if (run >= 3) {
      out.push(line)
      out.push(`[... repeated ${run} times ...]`)
      index += run - 1
    } else {
      for (let repeat = 0; repeat < run; repeat += 1) out.push(line)
      index += run - 1
    }
  }
  return out
}

/** @param {string} text @param {number} maxEntries */
function digestGitStatus(text, maxEntries) {
  const lines = splitLines(text)
  const isHeader = (line) => /:\s*$/.test(line) && !GIT_HINT.test(line)
  const isEntry = (line) => (/^[\t ]+\S/.test(line) || /^[ MADRCU?!]{1,2} \S/.test(line)) && !GIT_HINT.test(line)
  const firstContent = lines.find((line) => line.trim() !== '') ?? ''

  if (/^[ MADRCU?!]{1,2} \S/.test(firstContent)) {
    const entries = lines.filter((line) => line.trim() !== '')
    if (entries.length <= 60) return null
    const counts = new Map()
    for (const line of entries) {
      const code = line.slice(0, 2).trim() || '?'
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code}: ${count}`)
    return {
      text: [`porcelain summary: ${summary.join(', ')}`, ...entries.slice(0, 20), `[... +${entries.length - 20} more paths ...]`].join('\n'),
    }
  }

  // Preserve the original order, drop advice rows, and cap each entry run.
  const out = []
  let run = []
  let dropped = 0
  const flush = () => {
    if (run.length === 0) return
    if (run.length > maxEntries) {
      out.push(...run.slice(0, maxEntries))
      out.push(`[... +${run.length - maxEntries} more in this group ...]`)
      dropped += run.length - maxEntries
    } else {
      out.push(...run)
    }
    run = []
  }
  for (const line of lines) {
    if (GIT_HINT.test(line)) continue
    if (isHeader(line)) {
      flush()
      out.push(line)
      continue
    }
    if (isEntry(line)) {
      run.push(line)
      continue
    }
    flush()
    out.push(line)
  }
  flush()
  if (dropped === 0) return null
  return { text: out.join('\n') }
}

/** @param {string} text @param {number} maxCommits */
function digestGitLog(text, maxCommits) {
  const lines = splitLines(text)
  const oneline = lines.every((line) => line === '' || /^[0-9a-f]{7,40}\s/.test(line))
  if (oneline) {
    const entries = lines.filter((line) => line !== '')
    if (entries.length <= maxCommits) return null
    return { text: [...entries.slice(0, maxCommits), `[... +${entries.length - maxCommits} more commits ...]`].join('\n') }
  }
  const commitStarts = lines.map((line, index) => (/^commit [0-9a-f]{7,40}/.test(line) ? index : -1)).filter((index) => index >= 0)
  if (commitStarts.length === 0) return digestBashGeneric(text, maxCommits * 12)
  if (commitStarts.length <= maxCommits) return null
  const out = []
  for (const start of commitStarts.slice(0, maxCommits)) {
    const end = commitStarts.find((index) => index > start) ?? lines.length
    const block = lines.slice(start, end).filter((line) => line.trim() !== '')
    out.push(...block.slice(0, 4))
    if (block.length > 4) out.push(`  [... ${block.length - 4} more lines in this commit ...]`)
  }
  out.push(`[... +${commitStarts.length - maxCommits} more commits ...]`)
  return { text: out.join('\n') }
}

/** @param {string} text @param {number} linesPerHunk */
function digestGitDiff(text, linesPerHunk) {
  const lines = splitLines(text)
  const fileStarts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith('diff --git ')) fileStarts.push(index)
  }
  if (fileStarts.length === 0) return digestBashGeneric(text, Math.max(120, linesPerHunk * 20))
  const out = []
  let dropped = 0
  for (const [fileIndex, start] of fileStarts.entries()) {
    const end = fileStarts[fileIndex + 1] ?? lines.length
    const section = lines.slice(start, end)
    const added = section.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length
    const removed = section.filter((line) => line.startsWith('-') && !line.startsWith('---')).length
    const path = section[0].replace(/^diff --git a\//, '').replace(/ b\/.*$/, '')
    out.push(`diff ${path}  (+${added}/-${removed})`)
    let inHunk = 0
    let hunkDropped = 0
    for (const line of section.slice(1)) {
      if (line.startsWith('@@')) {
        if (hunkDropped > 0) out.push(`  [... ${hunkDropped} lines omitted ...]`)
        out.push(line)
        inHunk = 0
        hunkDropped = 0
        continue
      }
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
        out.push(line)
        continue
      }
      inHunk += 1
      if (inHunk <= linesPerHunk) out.push(line)
      else hunkDropped += 1
    }
    if (hunkDropped > 0) {
      dropped += hunkDropped
      out.push(`  [... ${hunkDropped} lines omitted ...]`)
    }
  }
  if (dropped === 0) return null
  return { text: out.join('\n') }
}

/** @param {string} text @param {number} maxEntries */
function digestListing(text, maxEntries) {
  const lines = splitLines(text).filter((line) => line.trim() !== '' && line.trim() !== '.' && line.trim() !== '..')
  if (lines.length <= maxEntries) return null
  return { text: [...lines.slice(0, maxEntries), `[... +${lines.length - maxEntries} more entries ...]`].join('\n') }
}

/** @param {string} text @param {object} options */
function digestSearch(text, options) {
  const { maxFiles, perFile, maxChars } = options
  const lines = splitLines(text)
  const matches = /^(.+?):(\d+):(.*)$/
  const files = new Map()
  for (const line of lines) {
    const match = matches.exec(line)
    if (match === null) continue
    const [, path, lineNumber, body] = match
    const entry = files.get(path) ?? []
    entry.push({ lineNumber, body })
    files.set(path, entry)
  }
  const total = [...files.values()].reduce((sum, entries) => sum + entries.length, 0)
  if (files.size === 0 || total <= 40) return null
  const out = [`search digest: ${total} matches in ${files.size} files`]
  const ranked = [...files.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxFiles)
  for (const [path, entries] of ranked) {
    out.push(`${path} (${entries.length})`)
    for (const entry of entries.slice(0, perFile)) out.push(`  ${entry.lineNumber}: ${truncateAtChars(entry.body, 160)}`)
    if (entries.length > perFile) out.push(`  [... +${entries.length - perFile} more matches in this file ...]`)
  }
  if (files.size > ranked.length) out.push(`[... +${files.size - ranked.length} more files with matches ...]`)
  return { text: takeLines(out, maxChars).join('\n') }
}

/** @param {string} text */
function digestPackage(text) {
  const lines = splitLines(text)
  const noisy = lines.filter((line) => /(warn|error|err!|deprecat|fail|vulnerab|cannot|denied)/i.test(line))
  const tail = lines.slice(-20)
  const keep = orMask(markedMask(lines, (line) => /(warn|error|err!|deprecat|fail|vulnerab|cannot|denied)/i.test(line), 1), headTailMask(lines.length, 0, 20))
  if (noisy.length === 0) return { text: [...tail, `[... ${lines.length - tail.length} earlier lines omitted ...]`].join('\n') }
  return renderMasked(lines, keep)
}

/** @param {string} text @param {number} maxChars */
function digestTest(text, maxChars) {
  const lines = splitLines(text)
  const failureBlock = markedMask(lines, (line) => /^\s*(FAIL|FAILED|✗|×|●|FAIL\s)/.test(line), 24)
  const errorLines = markedMask(lines, isErrorLine, 2)
  const summary = markedMask(lines, (line) => /(tests?|suites?|files?)\s+(passed|failed)|duration|snapshot|\bpassed\b|\bfailed\b/i.test(line), 0)
  const mask = orMask(orMask(failureBlock, errorLines), orMask(summary, headTailMask(lines.length, 3, 12)))
  const rendered = renderMasked(lines, mask)
  if (rendered.keptLines >= lines.filter((line) => line.trim() !== '').length) return null
  return { text: truncateAtChars(rendered.text, maxChars) }
}

/** @param {string} text @param {number} maxChars */
function digestBashGeneric(text, maxChars) {
  const folded = foldRepeats(splitLines(text))
  const mask = orMask(headTailMask(folded.length, 40, 40), markedMask(folded, isErrorLine, 5))
  const rendered = renderMasked(folded, mask)
  if (rendered.omittedLines === 0) return null
  return { text: truncateAtChars(rendered.text, maxChars) }
}

/**
 * Build a digest for one shape.
 * @param {string} shape
 * @param {string} rawText
 * @param {{ maxChars: number, minChars: number }} options
 * @returns {{ shape: string, text: string } | null}
 */
export function digest(shape, rawText, options) {
  const maxChars = Math.max(200, options.maxChars)
  const cleaned = collapseCarriageReturns(stripAnsi(rawText))
  if (cleaned.length < Math.max(0, options.minChars)) return null

  let result = null
  switch (shape) {
    case 'git-status':
      result = digestGitStatus(cleaned, 10)
      break
    case 'git-log':
      result = digestGitLog(cleaned, 30)
      break
    case 'git-diff':
      result = digestGitDiff(cleaned, 6)
      break
    case 'listing':
      result = digestListing(cleaned, 100)
      break
    case 'search':
      result = digestSearch(cleaned, { maxFiles: 10, perFile: 5, maxChars })
      break
    case 'package':
      result = digestPackage(cleaned)
      break
    case 'test':
      result = digestTest(cleaned, Math.round(maxChars * 2))
      break
    default:
      result = digestBashGeneric(cleaned, Math.round(maxChars * 1.5))
  }
  if (result === null) return null
  const text = result.text
  if (text.trim() === '' || text.length >= cleaned.length) return null
  return { shape, text: truncateAtChars(text, Math.round(maxChars * 1.5)) }
}
