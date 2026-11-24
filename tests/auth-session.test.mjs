import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import { transformSync } from '@swc/core'

function load(path, modules, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { code } = transformSync(source, {
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    Error,
    Promise,
    Symbol,
    console: { warn() {}, error() {} },
    require: name => {
      assert.ok(modules[name], `Unexpected import: ${name}`)
      return modules[name]
    },
    ...globals,
  })
  return exports
}

function setup({ clearAll }) {
  const calls = []
  const offlineDB = {
    clearAll: () => {
      calls.push('clearAll')
      return clearAll(calls.filter(c => c === 'clearAll').length)
    },
    reset: () => calls.push('reset'),
  }
  const session = load(
    '../src/utils/AuthSession.js',
    {
      '../queries/OfflineHydration': {
        hydrateQueriesFromOfflineCache: async () => {},
      },
      '../queries/QueryClient': {
        queryClient: { cancelQueries: async () => {}, clear: () => {} },
      },
      './OfflineDB': { offlineDB },
      './TokenStorage': {
        clearAllTokens: async () => calls.push('clearAllTokens'),
        saveTokens: async tokens => calls.push(['saveTokens', tokens]),
      },
    },
    // Fire the clear timeout right away instead of after 3 seconds.
    { setTimeout: fn => setImmediate(fn), clearTimeout: () => {} },
  )
  return { session, calls }
}

test('startSession saves tokens after clearing the offline cache', async () => {
  const { calls, session } = setup({ clearAll: async () => {} })
  await session.startSession({ accessToken: 'a' })
  assert.deepEqual(calls, [
    'clearAllTokens',
    'clearAll',
    ['saveTokens', { accessToken: 'a' }],
  ])
})

test('startSession does not hang when IndexedDB never answers', async () => {
  let deferredClear
  const { calls, session } = setup({
    // First clear hangs (wedged Safari IndexedDB); the retry after reset
    // completes once the database answers again.
    clearAll: n =>
      n === 1
        ? new Promise(() => {})
        : new Promise(resolve => {
            deferredClear = resolve
          }),
  })

  await session.startSession({ accessToken: 'a' })

  assert.deepEqual(calls, [
    'clearAllTokens',
    'clearAll',
    'reset',
    'clearAll',
    ['saveTokens', { accessToken: 'a' }],
  ])
  assert.equal(typeof deferredClear, 'function', 'cache clear is retried')
})

test('startSession still reports a failing offline cache clear', async () => {
  const { session } = setup({
    clearAll: async () => {
      throw new Error('quota')
    },
  })
  await assert.rejects(session.startSession({ accessToken: 'a' }), {
    name: 'SessionStorageError',
  })
})
