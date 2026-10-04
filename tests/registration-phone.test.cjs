const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const FILE = 'src/utils/useRegistrationPhone.ts';
function harness() {
  let cursor = 0, dirty = false, flow, now = 100000, calls = 0, beginCalls = 0;
  const state = [], effects = [], timers = new Map(), intervals = new Map(), values = [];
  let serial = 0, statusWork = async () => ({ verified: false, phone: null });
  const onVerified = value => values.push(value);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useCallback(callback, deps) { const i = cursor++; if (!state[i] || deps.some((d, j) => d !== state[i].deps[j])) state[i] = { callback, deps }; return state[i].callback; },
    useEffect(fn, deps) { const i = cursor++, previous = effects[i]; if (!previous || deps.some((d, j) => d !== previous.deps[j])) effects[i] = { fn, deps, cleanup: previous?.cleanup, pending: true }; },
  };
  const begin = async () => { beginCalls++; return { token: 'A'.repeat(43), botUrl: 'https://t.me/hisvex_bot?start=reg_' + 'B'.repeat(43), expiresAt: new Date(now + 600000).toISOString() }; };
  const status = async token => { calls++; assert.equal(token, 'A'.repeat(43)); return statusWork(); };
  const authApi = { beginRegistrationPhone: async () => ({ data: await begin() }), registrationPhoneStatus: async token => ({ data: await status(token) }) };
  const apiClient = { beginRegistrationPhone: begin, registrationPhoneStatus: status };
  class TestDate extends Date { static now() { return now; } }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(FILE, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, require: name => name === 'react' ? react : { authApi, apiClient }, Date: TestDate,
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { const id = ++serial; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
  });
  function render() { for (let i = 0; i < 30; i++) { cursor = 0; dirty = false; flow = exports.useRegistrationPhone(onVerified); for (const e of effects.filter(Boolean)) if (e.pending) { e.pending = false; e.cleanup?.(); e.cleanup = e.fn(); } if (!dirty) return; } throw Error('render loop'); }
  async function settle() { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  render();
  return { settle, render, get flow() { return flow; }, values, calls: () => calls, beginCalls: () => beginCalls, status: fn => statusWork = fn,
    tick: () => [...intervals.values()].forEach(fn => fn()), expire: () => { now += 600001; [...timers.values()].forEach(t => t.fn()); render(); },
    unmount: () => effects.filter(Boolean).forEach(e => e.cleanup?.()), intervalCount: () => intervals.size };
}
test('bot contact automatically fills the form and returns the private proof, then stops polling', async () => {
  const h = harness(); await h.settle(); assert.ok(h.flow.challenge); assert.equal(h.calls(), 0);
  h.flow.wait(); h.render(); await h.settle(); assert.equal(h.flow.waiting, true);
  h.status(async () => ({ verified: true, phone: '998901234567' })); h.tick(); await h.settle();
  assert.equal(h.flow.phone, '998901234567'); assert.equal(h.values.at(-1).token, 'A'.repeat(43)); assert.equal(h.intervalCount(), 0);
  h.expire(); assert.equal(h.flow.phone, ''); assert.equal(h.values.at(-1), null); h.unmount();
});
test('slow checks cannot overlap, and an unmounted form ignores the old verification response', async () => {
  const h = harness(); await h.settle(); let complete;
  h.status(() => new Promise(resolve => complete = resolve)); h.flow.wait(); h.render(); h.tick(); h.tick(); assert.equal(h.calls(), 1);
  h.unmount(); complete({ verified: true, phone: '998901234567' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.values.filter(Boolean).length, 0); assert.equal(h.intervalCount(), 0);
});
test('expiry and restart invalidate an old proof; a transient error allows the next check', async () => {
  const h = harness(); await h.settle(); h.status(async () => { throw Error('offline'); }); h.flow.wait(); h.render(); await h.settle(); assert.equal(h.flow.error, 'offline');
  h.status(async () => ({ verified: true, phone: '998901234567' })); h.tick(); await h.settle(); assert.equal(h.flow.error, '');
  await h.flow.prepare(); await h.settle(); assert.equal(h.flow.phone, ''); assert.equal(h.values.at(-1), null); assert.equal(h.beginCalls(), 2);
  h.expire(); assert.equal(h.flow.challenge, null); assert.match(h.flow.error, /muddati/); h.unmount();
});
test('the desktop verification button opens Telegram through the native external-browser bridge', async () => {
  const file = 'src/components/RegistrationPhone.tsx', exports = {}, opened = [];
  let waited = false, prevented = false;
  const challenge = { botUrl: 'https://t.me/hisvex_bot?start=reg_' + 'B'.repeat(43) };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: { useState: () => ['', () => {}] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../i18n': { t: key => key },
    './TelegramIcon': { TelegramIcon: () => null },
    '../utils/useRegistrationPhone': { useRegistrationPhone: () => ({ challenge, wait: () => waited = true, error: '', phone: '' }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => mocks[name], window: { electronAPI: { openExternal: async url => { opened.push(url); return true; } } },
  });
  const tree = exports.RegistrationPhone({ onVerified() {} });
  const link = tree.props.children.find(node => node?.type === 'a');
  link.props.onClick({ preventDefault: () => prevented = true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(waited, true); assert.equal(prevented, true); assert.deepEqual(opened, [challenge.botUrl]);
});
