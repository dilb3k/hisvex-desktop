const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Same load() shape as tests/security.test.cjs: transpile the real TS
// source and run it in a sandboxed context with mocked module deps.
function load(mocks, extra = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync('src/store/syncEngine.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  // Share the outer realm's Error/Promise/Object/Array/Set/Map so that
  // `error instanceof Error` etc. inside the sandboxed module recognizes
  // values constructed by our (outer-realm) mocks — vm.runInNewContext
  // otherwise gives the sandbox its own disjoint set of intrinsics.
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? require(name), console, setInterval: () => 0, clearInterval: () => {}, Error, Promise, Object, Array, Set, Map, ...extra })
  return exports
}

function makeLocalStorage(store = new Map()) {
  return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
}

// A non-empty pending operation so the push phase actually runs — the point
// of this suite is proving the reset path never touches this, not just that
// an empty queue survives trivially.
const pendingOp = { kind: 'sale', id: 'op-1', localId: 'op-1', deviceId: 'd', occurredAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', date: '2026-09-30', lines: [{ productId: 'p', quantity: 1, lineRevenue: 20 }] }

function setup({ pullResponses, store = new Map() }) {
  const localStorage = makeLocalStorage(store)
  const removedCalls = []
  let pullCallCount = 0
  // Mutable, so removeSynced (below) reflects real acknowledgement instead
  // of the op staying "pending" forever regardless of what the code does.
  let operationQueue = [pendingOp]
  const syncApi = {
    sync: async (payload) => {
      if ('operations' in payload) {
        // Push phase — acknowledge the pending op so removeSynced fires,
        // proving that path is untouched by the cursor-reset logic below.
        return { data: { protocolVersion: 2, acknowledged: [{ entity: 'operation', localId: 'op-1' }], rejected: [] } }
      }
      const response = pullResponses[Math.min(pullCallCount, pullResponses.length - 1)]
      pullCallCount++
      if (response.throw) {
        throw Object.assign(new Error(response.throw.message), { code: response.throw.code })
      }
      return { data: response }
    },
  }
  const offlineQueue = {
    getQueueSnapshot: () => ({ product: [], inventory: [], daily: [], operation: [...operationQueue] }),
    getActiveUser: () => 'owner-1',
    waitForQueue: async () => {},
    removeSynced: async (kind, items) => {
      removedCalls.push({ kind, items })
      if (kind === 'operation') {
        const ids = new Set(items.map((item) => item.localId))
        operationQueue = operationQueue.filter((op) => !ids.has(op.localId))
      }
    },
  }
  let storeState = { products: [], inventory: [], snapshots: [] }
  const appStore = { useAppStore: { getState: () => storeState, setState: (fn) => { storeState = { ...storeState, ...fn(storeState) } } } }
  const engine = load(
    { '../utils/network': { isOnline: () => true, subscribeOnline: () => () => {} }, './offlineQueue': offlineQueue, '../api/client': { syncApi }, './appStore': appStore },
    { localStorage, window: {} },
  )
  return { engine, store, removedCalls, getPullCallCount: () => pullCallCount }
}

test('sync cursor reset recovers with exactly one bounded retry, never touching the offline queue', async () => {
  const { engine, store, removedCalls, getPullCallCount } = setup({
    pullResponses: [
      { throw: { code: 'SYNC_RESET_REQUIRED', message: 'Server revision moved backwards; start a fresh pull' } },
      { protocolVersion: 2, hasMore: false, checkpoint: 'fresh-checkpoint', products: [], inventory: [], daily: [], deletedProducts: [] },
    ],
  })
  store.set('hisvex_sync_v2:owner-1', 'stale-checkpoint')

  const result = await engine.syncNow()

  assert.equal(result.ok, true)
  assert.equal(getPullCallCount(), 2, 'exactly one retry after the reset, not a loop')
  assert.equal(store.get('hisvex_sync_v2:owner-1'), 'fresh-checkpoint', 'the stale checkpoint was replaced by a fresh one, not left dangling')
  // Zero-wipe policy: the pending offline operation still went through its
  // normal push/ACK path — proving the cursor-reset recovery never reached
  // into (let alone cleared) the offline queue itself. (removeSynced is
  // also called once per empty product/inventory/daily batch — that's the
  // existing per-kind loop in performSync, not something this test covers.)
  const ackedOps = removedCalls.filter((call) => call.kind === 'operation' && call.items.length > 0)
  assert.equal(ackedOps.length, 1)
  assert.equal(ackedOps[0].items[0].localId, 'op-1')
})

test('a cursor reset that fails again is not retried a second time', async () => {
  const { getPullCallCount, engine } = setup({
    pullResponses: [
      { throw: { code: 'INVALID_SYNC_CURSOR', message: 'Invalid sync cursor; start a fresh pull' } },
      { throw: { code: 'INVALID_SYNC_CURSOR', message: 'Invalid sync cursor; start a fresh pull' } },
    ],
  })

  const result = await engine.syncNow()

  assert.equal(result.ok, false)
  assert.match(result.error, /Invalid sync cursor/)
  assert.equal(getPullCallCount(), 2, 'bounded to a single retry — must not loop indefinitely')
})

test('SYNC_SCOPE_CHANGED mid-page also triggers exactly one reset-and-retry', async () => {
  const { engine, getPullCallCount } = setup({
    pullResponses: [
      { throw: { code: 'SYNC_SCOPE_CHANGED', message: 'Sync scope changed; restart pull' } },
      { protocolVersion: 2, hasMore: false, checkpoint: 'fresh-checkpoint-2', products: [], inventory: [], daily: [], deletedProducts: [] },
    ],
  })

  const result = await engine.syncNow()

  assert.equal(result.ok, true)
  assert.equal(getPullCallCount(), 2)
})
