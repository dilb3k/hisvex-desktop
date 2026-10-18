const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { loadSource } = require('./load-source.cjs');

function mountReports(options = {}) {
  const auth = { token: 'fixture-session', user: { _id: 'owner', scope: 'full', tier: 'pro', ...options.user } };
  const states = [], effects = [], calls = [], saves = [];
  const receipts = options.receipts ?? [{ localId: 'receipt-1', date: '2026-10-18', supplier: 'Chorsu', totalCost: 25000, createdByUsername: 'market-operator', items: [{ productId: 'apple', name: 'Olma', unit: 'kg', quantity: 2.5, buyPrice: 10000, lineCost: 25000 }] }];
  let cursor = 0, dirty = false, tree, mode = options.mode;
  let analyticsHandler = options.analytics ?? (async query => ({ from: query.from, to: query.to, totalProcurementSpend: 25000, totalBatchesCount: receipts.length, totalItemsProcured: { dona: 0, kg: 2.5 } }));
  let listHandler = options.list ?? (async () => receipts);
  let exportHandler = options.export ?? (async () => new Uint8Array([65, 66]).buffer);
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { const next = typeof value === 'function' ? value(states[i]) : value; if (!Object.is(next, states[i])) { states[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return states[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++, old = effects[i]; if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) effects[i] = { fn, deps, pending: true, cleanup: old?.cleanup }; },
  };
  const api = options.api ?? {
    list: async query => { calls.push({ kind: 'list', query }); if (mode === 'list-failure') throw Error('offline'); return listHandler(query); },
    analytics: async query => { calls.push({ kind: 'analytics', query }); if (mode === 'analytics-failure') throw Error('offline'); return analyticsHandler(query); },
    export: async (query, format) => { calls.push({ kind: 'export', query, format }); return exportHandler(query, format); },
  };
  const module = { exports: {} };
  const req = name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'dayjs') return require(name);
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
    if (name.endsWith('/authStore')) return { useAuthStore: Object.assign(selector => selector(auth), { getState: () => auth }) };
    if (name.endsWith('/api') || name.endsWith('/api/client')) return { procurementApi: api, clearApiCache: () => { calls.push({ kind: 'clear-cache' }); options.clearCache?.(); } };
    if (name.endsWith('/businessDay')) return { getBusinessDate: () => '2026-10-18' };
    if (name.endsWith('/quantities')) return loadSource('src/utils/quantities.ts');
    if (name.endsWith('.css')) return {};
    throw Error('Unknown import ' + name);
  };
  const code = ts.transpileModule(fs.readFileSync('src/screens/ProcurementReports.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: req, console, Blob, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, document: { createElement: () => ({ click() { saves.push(this.download); } }) }, window: { electronAPI: options.nativeSave ? { saveXlsx: options.nativeSave } : undefined, print() {}, addEventListener() {}, removeEventListener() {} }, setTimeout: () => 0, clearTimeout() {} });
  const props = { from: '2026-10-18', to: '2026-10-18', ...options.props };
  const render = () => {
    for (let pass = 0; pass < 30; pass++) {
      cursor = 0; dirty = false; tree = module.exports.ProcurementReportScreen(props);
      for (const effect of effects.filter(Boolean)) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.fn(); }
      if (!dirty) return tree;
    }
    throw Error('Render loop');
  };
  const walk = (predicate, node) => Array.isArray(node) ? node.flatMap(child => walk(predicate, child)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...walk(predicate, node.props?.children)];
  const getText = node => Array.isArray(node) ? node.map(child => getText(child)).join(' ') : node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : getText(node.props?.children);
  const find = (predicate, node = tree) => walk(predicate, node);
  const text = (node = tree) => getText(node);
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const button = label => find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node).trim() === label))[0];
  render();
  return { render, find, text, settle, button, calls, saves, auth, exports: module.exports, setMode(value) { mode = value; }, setList(fn) { listHandler = fn; }, setAnalytics(fn) { analyticsHandler = fn; }, unmount() { effects.filter(Boolean).forEach(effect => effect.cleanup?.()); } };
}
module.exports = { mountReports };
