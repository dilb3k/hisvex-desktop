const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript')
const native = 'desktop' === 'mobile',
  file = 'src/screens/ProcurementInsights.tsx'
const compile = (p) =>
  ts.transpileModule(fs.readFileSync(p, 'utf8'), {
    fileName: p,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
function mount(component, props = {}, scope = 'full', initialMode = 'ok') {
  const user = {
      id: 'owner',
      _id: 'owner',
      scope,
      tier: 'pro',
      isPayed: true,
      role: 'admin',
    },
    auth = { user, token: 'session' }
  const store = Object.assign((f) => f(auth), { getState: () => auth })
  const states = [],
    effects = [],
    memos = [],
    calls = []
  let cursor = 0,
    dirty = false,
    tree,
    mode = initialMode
  const hooks = {
    useState(initial) {
      const i = cursor++
      if (!(i in states))
        states[i] = typeof initial === 'function' ? initial() : initial
      return [
        states[i],
        (v) => {
          const next = typeof v === 'function' ? v(states[i]) : v
          if (!Object.is(next, states[i])) {
            states[i] = next
            dirty = true
          }
        },
      ]
    },
    useRef(initial) {
      const i = cursor++
      return (states[i] ??= { current: initial })
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = effects[i]
      if (!old || deps.some((d, n) => !Object.is(d, old.deps[n])))
        effects[i] = { fn, deps, pending: true, cleanup: old?.cleanup }
    },
    useMemo(fn, deps) {
      const i = cursor++,
        old = memos[i]
      if (!old || deps.some((d, n) => !Object.is(d, old.deps[n])))
        memos[i] = { deps, value: fn() }
      return memos[i].value
    },
  }
  const sample = {
    from: '2026-10-01',
    to: '2026-10-03',
    totalProcurementSpend: 100,
    totalItemsProcured: { dona: 2, kg: 0.5 },
    totalBatchesCount: 1,
    averageBatchValue: 100,
    inventoryValue: 450,
    totalRevenue: 200,
    grossProfit: 80,
    costOfGoodsSold: 120,
    cashFlowBalance: 100,
    costTrends: [
      {
        date: '2026-10-01',
        spend: 100,
        revenue: 200,
        batches: 1,
        grossProfit: 80,
      },
    ],
    topCostProducts: [
      {
        productId: 'a',
        name: 'Olma',
        unit: 'kg',
        quantity: 0.5,
        totalCost: 100,
        averageBuyPrice: 200,
        latestBuyPrice: 200,
        priceChangePercent: 25,
      },
    ],
  }
  const analytics = async (q) => {
    calls.push({ kind: 'analytics', query: q })
    if (mode === 'fail') throw Error('network')
    return sample
  }
  const summary = async () => {
    calls.push({ kind: 'summary' })
    if (mode === 'fail') throw Error('network')
    return {
      todaySpend: 100,
      monthSpend: 200,
      lastBatch: { quantities: { dona: 2, kg: 0.5 } },
    }
  }
  const receipts = [
    {
      localId: 'r',
      date: '2026-10-03',
      totalCost: 100,
      supplier: 'Chorsu',
      createdByScope: 'procurement',
      createdByUsername: 'market-operator',
      items: [
        {
          name: 'Olma',
          productId: 'a',
          unit: 'kg',
          quantity: 0.5,
          buyPrice: 200,
          lineCost: 100,
        },
      ],
    },
  ]
  const list = async (q) => {
    calls.push({ kind: 'list', query: q })
    return receipts
  }
  const colors = {
    text: '#111',
    textSecondary: '#555',
    textTertiary: '#777',
    primary: '#0080ff',
    surface: '#fff',
    background: '#eee',
    border: '#ccc',
    danger: 'red',
    warning: 'orange',
    success: 'green',
  }
  const types = { exports: {} }
  vm.runInNewContext(compile('src/utils/procurementTypes.ts'), types)
  const context = {
    exports: {},
    setTimeout,
    clearTimeout,
    window: { addEventListener() {}, removeEventListener() {}, print() {} },
    require(name) {
      if (name === 'react') return hooks
      if (name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native')
        return new Proxy(
          { StyleSheet: { create: (x) => x }, Platform: { OS: 'ios' } },
          { get: (t, k) => t[k] ?? String(k) },
        )
      if (name === 'react-native-safe-area-context')
        return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }
      if (name.endsWith('procurementInsights.css')) return {}
      if (name.endsWith('procurementTypes')) return types.exports
      if (name.endsWith('BarcodeScannerModal'))
        return { BarcodeScannerModal: 'BarcodeScannerModal' }
      if (name.endsWith('procurementExport'))
        return { shareProcurement: async () => {} }
      if (name.endsWith('themeStore')) return { useTheme: () => ({ colors }) }
      if (name.endsWith('authStore')) return { useAuthStore: store }
      if (name === '../store') return { useStore: store }
      if (name.endsWith('/api') || name.endsWith('/api/client'))
        return {
          procurementApi: { analytics, summary, list },
          apiClient: {
            getToken: () => auth.token,
            getProcurementAnalytics: analytics,
            getProcurementSummary: summary,
            listProcurements: list,
          },
        }
      throw Error('Unknown import ' + name)
    },
  }
  vm.runInNewContext(compile(file), context)
  function render() {
    for (let pass = 0; pass < 30; pass++) {
      cursor = 0
      dirty = false
      tree = context.exports[component](props)
      for (const e of effects.filter(Boolean))
        if (e.pending) {
          e.pending = false
          e.cleanup?.()
          e.cleanup = e.fn()
        }
      if (!dirty) return
    }
    throw Error('Render loop')
  }
  function find(fn, n) {
    if (arguments.length === 1) n = tree
    if (Array.isArray(n)) return n.flatMap((x) => find(fn, x))
    if (!n || typeof n !== 'object') return []
    return [...(fn(n) ? [n] : []), ...find(fn, n.props?.children)]
  }
  function text(n) {
    if (arguments.length === 0) n = tree
    if (Array.isArray(n)) return n.map((x) => text(x)).join(' ')
    if (n == null || typeof n === 'boolean') return ''
    if (typeof n !== 'object') return String(n)
    return text(n.props?.children)
  }
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r))
      render()
    }
  }
  render()
  return {
    settle,
    find,
    text,
    calls,
    render,
    setMode: (v) => (mode = v),
    setUser: (v) => Object.assign(user, v),
    unmount: () => effects.filter(Boolean).forEach((e) => e.cleanup?.()),
  }
}
test('procurement scope cannot mount finance analytics or initiate any network request', async () => {
  const ui = mount(
    'ProcurementAnalytics',
    { from: '2026-10-01', to: '2026-10-03' },
    'procurement',
  )
  await ui.settle()
  assert.equal(ui.calls.length, 0)
  assert.equal(ui.text(), '')
  ui.unmount()
})
test('free plan cannot fetch hidden supply finance analytics', async () => {
  const ui = mount(
    'ProcurementAnalytics',
    { from: '2026-10-01', to: '2026-10-03' },
    'procurement',
  )
  ui.setUser({ scope: 'full', tier: 'tekin', isPayed: false })
  ui.render()
  await ui.settle()
  assert.equal(ui.calls.length, 0)
  assert.equal(ui.text(), '')
  ui.unmount()
})
test('supply analytics render server-authoritative valuation and cost changes rather than cart estimates', async () => {
  const ui = mount('ProcurementAnalytics', {
    from: '2026-10-01',
    to: '2026-10-03',
  })
  await ui.settle()
  assert.equal(ui.calls[0].query.period, 'custom')
  assert.match(ui.text(), /450/)
  assert.match(ui.text(), /\+25%/)
  assert.match(ui.text(), /naqd pul emas/)
  assert.match(ui.text(), /0\.5\s+kg/)
  ui.unmount()
})
test('operational KPI failure never displays invented zero spend', async () => {
  const ui = mount('ProcurementKpis', { revision: 1 }, 'full', 'fail')
  await ui.settle()
  assert.match(ui.text(), /Yuklanmadi/)
  assert.doesNotMatch(ui.text(), /0 so‘m/)
  ui.unmount()
})
test('history expands a confirmed batch with supplier, actor and exact item cost', async () => {
  const ui = mount('ProcurementHistory', {
    initial: [],
    products: [],
    error: '',
    loading: false,
  })
  await ui.settle()
  const button = ui.find(
    (n) =>
      n.props?.['aria-expanded'] === false ||
      n.props?.accessibilityState?.expanded === false,
  )[0]
  assert.ok(button)
  ;(native ? button.props.onPress : button.props.onClick)()
  ui.render()
  assert.match(ui.text(), /Chorsu/)
  assert.match(ui.text(), /market-operator/)
  assert.match(ui.text(), /Bozorchi/)
  assert.match(ui.text(), /Olma/)
  assert.match(ui.text(), /200/)
  assert.equal(ui.calls[0].query.limit, 50)
  ui.unmount()
})

test('purchase inflation warning handles increases, decreases and missing baseline without inventing a percent', async () => {
  const up = mount('PriceAlert', { previous: 10, next: '11' })
  assert.match(up.text(), /\+\s*10\s*%/)
  up.unmount()
  const down = mount('PriceAlert', { previous: 10, next: '9' })
  assert.match(down.text(), /-\s*10\s*%/)
  down.unmount()
  const none = mount('PriceAlert', { previous: 0, next: '11' })
  assert.equal(none.text(), '')
  none.unmount()
})
test('USB or camera scanner selects the matching catalog product and leaves the batch unsent', async () => {
  let chosen
  const products = [
    {
      id: 'a',
      name: 'Olma',
      unit: 'kg',
      quantity: 3,
      buyPrice: 10,
      barcodes: ['SCAN-001'],
    },
  ]
  const ui = mount('ProcurementTools', {
    products,
    locked: false,
    supplier: '',
    onSupplier() {},
    onChoose: (p) => {
      chosen = p
    },
    onAdd: async () => {
      throw Error('must not submit')
    },
  })
  if (native) {
    assert.equal(ui.find((n) => n.type === 'BarcodeScannerModal').length, 0)
    const control = ui.find(
      (n) => n.props?.text === 'Kamera bilan skanerlash',
    )[0]
    control.props.action()
    ui.render()
    const scanner = ui.find((n) => n.type === 'BarcodeScannerModal')[0]
    assert.ok(scanner)
    scanner.props.onBarcodeDetected('SCAN-001')
  } else {
    let input = ui.find(
      (n) => n.props?.['aria-label'] === 'Kirim shtrix-kodi',
    )[0]
    input.props.onChange({ target: { value: 'SCAN-001' } })
    ui.render()
    input = ui.find((n) => n.props?.['aria-label'] === 'Kirim shtrix-kodi')[0]
    input.props.onKeyDown({ key: 'Enter', preventDefault() {} })
  }
  ui.render()
  assert.equal(chosen.id, 'a')
  assert.equal(ui.calls.length, 0)
  ui.unmount()
})
