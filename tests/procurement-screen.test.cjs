const { loadSource } = require('./helpers/load-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const platform = 'desktop';
const native = platform === 'mobile';
const componentFile = 'src/screens/ProcurementScreen.tsx';
const intentFile = 'src/utils/procurementIntent.ts';
const compile = (path) =>
  ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const product = {
  id: 'apple',
  name: 'Olma Golden',
  unit: 'kg',
  quantity: 12,
  buyPrice: 10000,
};
const line = {
  productId: 'apple',
  name: 'Olma Golden',
  unit: 'kg',
  quantity: 2,
  buyPrice: 10000,
};
const copy = (x) => JSON.parse(JSON.stringify(x));

// Run the actual component and durable intent against local, deterministic adapters.
// No network writes, Electron keystore calls, or production SQLite accounts are used.
function screen({
  saved = { items: [] },
  catalogFails = false,
  historyFails = false,
  storageFails = false,
} = {}) {
  let storage = copy(saved),
    send = async (id) => ({ localId: id }),
    writes = 0,
    ids = 0;
  const submissions = [],
    states = [],
    effects = [],
    memos = [],
    events = new Map();
  let cursor = 0,
    dirty = false,
    tree;
  const auth = { user: { _id: 'owner', id: 'owner' }, token: 'session' };
  function memo(work, deps) {
    const index = cursor++,
      old = memos[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i])))
      memos[index] = { value: work(), deps };
    return memos[index].value;
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === 'function' ? initial() : initial;
      return [
        states[index],
        (value) => {
          const next =
            typeof value === 'function' ? value(states[index]) : value;
          if (!Object.is(next, states[index])) {
            states[index] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (states[index] ??= { current: initial });
    },
    useMemo: memo,
    useCallback: (work, deps) => memo(() => work, deps),
    useEffect(work, deps) {
      const index = cursor++,
        old = effects[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i])))
        effects[index] = { work, deps, pending: true, cleanup: old?.cleanup };
    },
  };
  const write = async (value) => {
    if (storageFails) throw Error('disk failed');
    writes++;
    storage = copy(value);
  };
  const api = {
    products: async () => {
      if (catalogFails) throw Error('catalog unavailable');
      return [product];
    },
    list: async () => {
      if (historyFails) throw Error('history unavailable');
      return [
        { localId: 'old', date: '2026-10-03T10:00:00Z', totalCost: 25000 },
      ];
    },
    submit: async (id, items, supplier) => {
      submissions.push({ id, items: copy(items), ...(supplier ? {supplier} : {}) });
      return send(id, items);
    },
  };
  const intentContext = { exports: {} };
  vm.runInNewContext(compile(intentFile), intentContext);
  const store = Object.assign((select) => select(auth), {
    getState: () => auth,
  });
  const colors = {
    text: '#fff',
    textSecondary: '#aaa',
    textTertiary: '#888',
    background: '#111',
    surface: '#181818',
    surfaceHover: '#222',
    border: '#333',
    primary: '#7c3aed',
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
  };
  const nativeApi = {
    ...api,
    getToken: () => auth.token,
    getProcurementProducts: api.products,
    listProcurements: api.list,
    submitProcurement: api.submit,
  };
  const context = {
    exports: {},
    navigator: { locks: { request: async (_key, work) => work() } },
    crypto: { randomUUID: () => `batch-${++ids}` },
    localStorage: {
      getItem: () => (storage ? JSON.stringify(storage) : null),
      setItem: (_key, value) => {
        if (storageFails) throw Error('disk failed');
        writes++;
        storage = JSON.parse(value);
      },
    },
    window: {
      addEventListener: (name, work) => events.set(name, work),
      removeEventListener: (name) => events.delete(name),
      electronAPI: {
        safeStorageDecrypt: async (x) => x,
        safeStorageEncrypt: async (x) => {
          if (storageFails) throw Error('disk failed');
          return x;
        },
      },
    },
    require(name) {
      if (name.endsWith('QuantityStack')) return { QuantityStack: 'QuantityStack' };
      if (name.endsWith('/quantities') || name === './quantities') return loadSource('src/utils/quantities.ts');
      if (name.endsWith('/inventory')) return loadSource('src/utils/inventory.ts');

      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'lucide-react' || name === 'lucide-react-native')
        return new Proxy({}, { get: (_t, key) => String(key) });
      if (name === 'next/link') return { default: 'a' };
      if (name === 'react-router-dom') return { Link: 'a' };
      if (name.endsWith('procurement.css')) return {};
      if (name.endsWith('ProcurementInsights')) return { ProcurementKpis: 'ProcurementKpis', ProcurementTools: 'ProcurementTools', PriceAlert: 'PriceAlert', ProcurementHistory: 'ProcurementHistory' };
      if (name.endsWith('procurementTypes')) return { procurementQuantity: items => items.reduce((v,i) => ({...v,[i.unit]:v[i.unit]+i.quantity}),{dona:0,kg:0}) };
      if (name.endsWith('procurementIntent')) return intentContext.exports;
      if (name.endsWith('/api') || name.endsWith('/api/client'))
        return { procurementApi: api, apiClient: nativeApi };
      if (name.endsWith('authStore')) return { useAuthStore: store };
      if (name === '../store') return { useStore: store };
      if (name.endsWith('themeStore')) return { useTheme: () => ({ colors }) };
      if (name === 'react-native')
        return new Proxy(
          {
            StyleSheet: { create: (x) => x },
            Platform: { OS: 'ios' },
            Keyboard: { dismiss() {} },
          },
          { get: (target, key) => target[key] ?? String(key) },
        );
      if (name === '@react-navigation/elements')
        return { useHeaderHeight: () => 56 };
      if (name === 'react-native-safe-area-context')
        return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === 'expo-router') return { useRouter: () => ({ push() {} }) };
      if (name.endsWith('/db/account'))
        return {
          captureAccount: () => ({
            owner: 'owner',
            assertActive() {
              if (auth.token !== 'session') throw Error('session changed');
            },
          }),
        };
      if (name.endsWith('/db/localStore'))
        return {
          one: async () => copy(storage),
          localTransaction: async (work) => work({}),
          putRow: async (_db, _account, _table, _key, value) => write(value),
        };
      if (name.endsWith('/asyncLock'))
        return { withKeyLock: async (_key, work) => work() };
      if (name === 'uuid') return { v4: () => `batch-${++ids}` };
      throw Error('Unexpected import: ' + name);
    },
  };
  vm.runInNewContext(compile(componentFile), context);
  function render() {
    for (let pass = 0; pass < 30; pass++) {
      dirty = false;
      cursor = 0;
      tree = context.exports.ProcurementScreen({});
      for (const effect of effects.filter(Boolean))
        if (effect.pending) {
          effect.pending = false;
          effect.cleanup?.();
          effect.cleanup = effect.work();
        }
      if (!dirty) return;
    }
    throw Error('Render did not settle');
  }
  function find(predicate, node) {
    if (arguments.length === 1) node = tree;
    if (Array.isArray(node))
      return node.flatMap((child) => find(predicate, child));
    if (!node || typeof node !== 'object') return [];
    return [
      ...(predicate(node) ? [node] : []),
      ...find(predicate, node.props?.children ?? null),
    ];
  }
  function text(node) {
    if (arguments.length === 0) node = tree;
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (node === null || node === undefined || typeof node === 'boolean')
      return '';
    if (typeof node === 'string' || typeof node === 'number')
      return String(node);
    return text(node.props?.children ?? null);
  }
  async function settle() {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      render();
    }
  }
  const button = (label) =>
    find(
      (n) =>
        (n.type === 'button' || n.type === 'Pressable') &&
        text(n).includes(label),
    )[0];
  const press = (node) => {
    assert.ok(node, 'Control exists');
    (native ? node.props.onPress : node.props.onClick)?.();
    render();
  };
  const input = (label, value) => {
    const node = native
      ? find(
          (n) => n.type === 'TextInput' && n.props.accessibilityLabel === label,
        )[0]
      : label === 'Miqdor'
        ? find((n) => n.type === 'input' && n.props.type === 'number')[0]
        : label === 'Xarid narxi'
          ? find((n) => n.type === 'input' && n.props.type === 'number')[1]
          : label === 'Mahsulot nomi'
            ? find((n) => n.type === 'input' && n.props.maxLength === 200)[0]
            : find(
                (n) => n.type === 'input' && n.props['aria-label'] === label,
              )[0];
    assert.ok(node, 'Input exists: ' + label);
    native
      ? node.props.onChangeText(value)
      : node.props.onChange({ target: { value } });
    render();
  };
  render();
  return {
    settle,
    find,
    text,
    button,
    press,
    input,
    submissions,
    saved: () => copy(storage),
    writes: () => writes,
    setSend: (work) => (send = work),
    async chooseExisting() {
      if (native) {
        press(
          find((n) => n.props?.accessibilityLabel === 'Mahsulot tanlash')[0],
        );
        const list = find((n) => n.type === 'FlatList')[0];
        press(list.props.renderItem({ item: product }));
      } else
        press(find((n) => n.props?.className?.startsWith('pc-picker-row'))[0]);
      await settle();
    },
    async save() {
      const node = native
        ? button('Savatga qo‘shish') || button('O‘zgarishni saqlash')
        : find((n) => n.type === 'form')[0];
      if (native) press(node);
      else node.props.onSubmit({ preventDefault() {} });
      render();
      await settle();
    },
    async confirm() {
      press(
        button('Kirimni tasdiqlash') || button('Tasdiqni qayta tekshirish'),
      );
      await settle();
    },
    unmount() {
      effects.filter(Boolean).forEach((effect) => effect.cleanup?.());
    },
  };
}

test('editing a saved cart changes one line without sending a procurement or adding a duplicate', async () => {
  const ui = screen({ saved: { items: [line] } });
  await ui.settle();
  ui.press(
    ui.find(
      (n) =>
        (n.props?.['aria-label'] || n.props?.accessibilityLabel) ===
        'Olma Goldenni tahrirlash',
    )[0],
  );
  assert.equal(ui.button('Kirimni tasdiqlash').props.disabled, true);
  ui.input('Miqdor', native ? '3,5' : '3.5');
  await ui.save();
  assert.equal(ui.saved().items.length, 1);
  assert.equal(ui.saved().items[0].quantity, 3.5);
  assert.equal(ui.submissions.length, 0);
  assert.equal(ui.button('Kirimni tasdiqlash').props.disabled, false);
  ui.unmount();
});
test('catalog selection and a new product are saved in one durable cart before one confirmation', async () => {
  const ui = screen();
  await ui.settle();
  await ui.chooseExisting();
  ui.input('Miqdor', '2');
  await ui.save();
  ui.press(ui.button('Yangi mahsulot'));
  ui.input('Mahsulot nomi', 'Asal');
  ui.input('Xarid narxi', '45000');
  await ui.save();
  assert.equal(ui.saved().items.length, 2);
  assert.equal(ui.submissions.length, 0);
  assert.equal(ui.saved().id, undefined);
  await ui.confirm();
  assert.equal(ui.submissions.length, 1);
  assert.equal(ui.submissions[0].items.length, 2);
  assert.equal(ui.saved().items.length, 0);
  assert.match(ui.text(), /Kirim tasdiqlandi/);
  ui.unmount();
});
test('unknown server outcome locks editing and retries the same ID and body', async () => {
  const ui = screen({ saved: { items: [line] } });
  await ui.settle();
  ui.setSend(async () => {
    throw Error('network response lost');
  });
  await ui.confirm();
  const first = ui.submissions[0];
  assert.equal(ui.saved().id, first.id);
  const edit = ui.find(
    (n) =>
      (n.props?.['aria-label'] || n.props?.accessibilityLabel) ===
      'Olma Goldenni tahrirlash',
  )[0];
  assert.equal(edit.props.disabled, true);
  assert.ok(ui.button('Tasdiqni qayta tekshirish'));
  ui.setSend(async (id) => ({ localId: id }));
  await ui.confirm();
  assert.deepEqual(ui.submissions[1], first);
  assert.equal(ui.saved().items.length, 0);
  ui.unmount();
});
test('failed local persistence never sends a procurement and leaves the cart editable', async () => {
  const ui = screen({ saved: { items: [line] }, storageFails: true });
  await ui.settle();
  await ui.confirm();
  assert.equal(ui.submissions.length, 0);
  assert.equal(ui.saved().id, undefined);
  assert.match(ui.text(), /disk failed/);
  const edit = ui.find(
    (n) =>
      (n.props?.['aria-label'] || n.props?.accessibilityLabel) ===
      'Olma Goldenni tahrirlash',
  )[0];
  assert.equal(edit.props.disabled, false);
  ui.unmount();
});
test('history failure does not hide a successfully loaded catalog or claim empty history', async () => {
  const ui = screen({ historyFails: true });
  await ui.settle();
  await ui.chooseExisting();
  assert.match(ui.text(), /Olma Golden/);
  assert.match(ui.find(n=>n.type==='ProcurementHistory')[0].props.error, /Kirimlar tarixi yuklanmadi/);
  assert.doesNotMatch(ui.text(), /Hali tasdiqlangan kirim yo‘q/);
  ui.unmount();
});
test('repeated confirmation taps cannot dispatch two requests while the first is in flight', async () => {
  const ui = screen({ saved: { items: [line] } });
  await ui.settle();
  let done;
  ui.setSend(
    (id) =>
      new Promise((resolve) => {
        done = () => resolve({ localId: id });
      }),
  );
  const node = ui.button('Kirimni tasdiqlash');
  ui.press(node);
  ui.press(node);
  await ui.settle();
  assert.equal(ui.submissions.length, 1);
  done();
  await ui.settle();
  assert.equal(ui.saved().items.length, 0);
  ui.unmount();
});

test('Kirimlar omits the supplier and scanner section while keeping the existing cart flow', async () => {
  const ui = screen({ saved: { items: [line] } });
  await ui.settle();
  assert.equal(ui.find(n => n.type === 'ProcurementTools').length, 0);
  await ui.confirm();
  assert.equal(ui.submissions.length, 1);
  assert.equal(ui.submissions[0].items[0].name, line.name);
  ui.unmount();
});
