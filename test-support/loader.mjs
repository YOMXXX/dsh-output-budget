/**
 * Test-only module loader: maps the harness-only `@deepseek-ai/schemastery`
 * peer to a stub so the Cordis glue in index.js can be imported by plain Node.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/schemastery') {
    return { url: new URL('./schemastery.mjs', import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
