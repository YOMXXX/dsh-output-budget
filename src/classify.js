/** Identify the command shape that decides which digest applies. */

/** Tools whose payload is a shell command. */
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'shell'])

/** Tools that already return search-shaped output. */
const SEARCH_TOOLS = new Set(['grep', 'rg', 'search'])

/** @param {unknown} args @returns {string | null} */
export function commandOf(args) {
  if (typeof args === 'string') return args
  if (args === null || typeof args !== 'object') return null
  for (const key of ['command', 'cmd', 'script', 'line']) {
    const value = /** @type {Record<string, unknown>} */ (args)[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/** Strip runner prefixes so the first real word is the command. */
function normalizeCommand(command) {
  let rest = command.trim()
  for (let guard = 0; guard < 8; guard += 1) {
    const stripped = rest
      .replace(/^\(\s*/, '')
      .replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/, '')
      .replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+/, '')
      .replace(/^(?:nohup|time|command|sudo)\s+/, '')
      .replace(/^\(\s*$/, '')
    if (stripped === rest) break
    rest = stripped
  }
  return rest
}

/**
 * First non-option git argument, skipping global options that take a value.
 * @param {readonly string[]} args tokens after `git`
 * @returns {string}
 */
function gitSubcommand(args) {
  const takesValue = new Set(['-C', '--git-dir', '--work-tree', '-c', '--namespace', '--exec-path'])
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (takesValue.has(token)) {
      index += 1
      continue
    }
    if (token.startsWith('-')) continue
    return token
  }
  return ''
}

/** @param {string} token */
function programOf(token) {
  const parts = token.split('/')
  return parts[parts.length - 1] ?? token
}

/**
 * Classify a shell command into a digest shape.
 * @param {string} command
 * @returns {string}
 */
export function classifyCommand(command) {
  const rest = normalizeCommand(command)
  const tokens = rest.split(/\s+/).filter(Boolean)
  const program = programOf(tokens[0] ?? '')

  if (program === 'git') {
    const sub = gitSubcommand(tokens.slice(1))
    if (sub === 'status') return 'git-status'
    if (sub === 'log') return 'git-log'
    if (sub === 'diff' || sub === 'show') return 'git-diff'
    return 'bash'
  }
  if (['ls', 'find', 'tree', 'fd', 'du', 'stat'].includes(program)) return 'listing'
  if (['grep', 'rg', 'ag', 'ack'].includes(program)) return 'search'
  if (['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'poetry', 'gem', 'cargo', 'go'].includes(program)) {
    const sub = tokens[1] ?? ''
    const isTest = sub.startsWith('test') || tokens.includes('pytest')
      || (sub === 'run' && (tokens[2] ?? '').startsWith('test'))
    if (isTest) return 'test'
    if (['install', 'add', 'i', 'ci', 'update', 'upgrade', 'sync'].includes(sub)) return 'package'
    return 'bash'
  }
  if (['vitest', 'jest', 'pytest', 'mocha', 'playwright'].includes(program)) return 'test'
  if (/(^|\s)(test|vitest|jest|pytest)(\s|$)/.test(rest)) return 'test'
  return 'bash'
}

/**
 * Pick the digest shape for one tool call, or null when the result must stay untouched.
 * @param {string} toolName
 * @param {unknown} args
 * @returns {string | null}
 */
export function classify(toolName, args) {
  if (SHELL_TOOLS.has(toolName)) {
    const command = commandOf(args)
    return command === null ? 'bash' : classifyCommand(command)
  }
  if (SEARCH_TOOLS.has(toolName)) return 'search'
  return null
}
