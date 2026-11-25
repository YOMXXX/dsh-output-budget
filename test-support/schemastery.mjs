/**
 * Minimal stand-in for `@deepseek-ai/schemastery`, used only by the glue test.
 * The real schema library is a harness peer and is not installed in a checkout.
 */

/** @param {unknown} value */
function chain(value) {
  /** @type {any} */
  const api = {
    value,
    default(next) {
      api.value = next
      return api
    },
    description() {
      return api
    },
    min() {
      return api
    },
    max() {
      return api
    },
  }
  return api
}

export default {
  object(shape) {
    return { kind: 'object', shape }
  },
  boolean() {
    return chain(true)
  },
  string() {
    return chain('apply')
  },
  natural() {
    return chain(1200)
  },
}
