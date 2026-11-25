#!/usr/bin/env node
/**
 * Offline A/B: replay recorded tool outputs through the digest layer and report
 * what a rewrite would have saved, while asserting that no failure line is lost.
 *
 *   node scripts/ab.mjs records.jsonl [--max-chars 6000] [--min-chars 1200]
 *
 * Each input line: {"command": "git status", "output": "<raw tool text>"}
 * (a line may also be a bare string, treated as generic shell output).
 */
import { readFileSync } from 'node:fs'
import { classifyCommand } from '../src/classify.js'
import { digest } from '../src/digest.js'
import { isErrorLine } from '../src/digest.js'

const args = process.argv.slice(2)
const file = args.find((value) => !value.startsWith('--'))
if (file === undefined) {
  console.error('usage: node scripts/ab.mjs records.jsonl [--max-chars N] [--min-chars N]')
  process.exit(2)
}
const flag = (name, fallback) => {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const parsed = Number(args[index + 1])
  return Number.isFinite(parsed) ? parsed : fallback
}
const maxChars = flag('--max-chars', 6000)
const minChars = flag('--min-chars', 1200)

const rows = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '')
  .map((line) => {
    try {
      const parsed = JSON.parse(line)
      if (typeof parsed === 'string') return { command: undefined, output: parsed }
      return { command: parsed.command, output: parsed.output ?? '' }
    } catch {
      return { command: undefined, output: line }
    }
  })

let before = 0
let after = 0
let rewritten = 0
let lost = 0
const byShape = new Map()

for (const [index, row] of rows.entries()) {
  const shape = row.command === undefined ? 'bash' : classifyCommand(row.command)
  const result = digest(shape, row.output, { maxChars, minChars })
  const next = result === null ? row.output : result.text
  before += row.output.length
  after += next.length
  if (result !== null) {
    rewritten += 1
    byShape.set(result.shape, (byShape.get(result.shape) ?? 0) + 1)
  }
  const missing = row.output
    .split('\n')
    .filter((line) => isErrorLine(line))
    .filter((line) => !next.includes(line.trim()))
  if (missing.length > 0) {
    lost += missing.length
    console.error(`#${index} lost ${missing.length} failure line(s): ${missing[0].slice(0, 100)}`)
  }
}

const percent = before === 0 ? 0 : ((before - after) / before) * 100
console.log(`records        ${rows.length}`)
console.log(`rewritten      ${rewritten}`)
console.log(`chars          ${before} → ${after} (saved ${before - after}, ${percent.toFixed(1)}%)`)
console.log(`est. tokens    ~${Math.round(before / 4)} → ~${Math.round(after / 4)}`)
console.log(`shapes         ${[...byShape.entries()].map(([shape, count]) => `${shape}×${count}`).join(', ') || '—'}`)
console.log(`failure lines  ${lost === 0 ? 'all preserved' : `${lost} LOST`}`)
process.exit(lost === 0 ? 0 : 1)
