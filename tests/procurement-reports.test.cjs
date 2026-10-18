const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mountReports } = require('./helpers/procurement-report-screen.cjs');

test('receipt overview contains only purchase amount, receipt count and separate count/weight totals', async () => {
  const ui = mountReports(); await ui.settle();
  assert.match(ui.text(), /25,000/);
  assert.match(ui.text(), /Jami xarid summasi/);
  assert.match(ui.text(), /Kirimlar soni/);
  assert.match(ui.text(), /Keltirilgan miqdor/);
  assert.doesNotMatch(ui.text(), /Yalpi foyda|kapital|CSV|PDF|Savdo −|qoldiq tannarxi/i);
  assert.equal(ui.find(n => n.props.className?.includes('pr-metric') && n.type === 'div' && !n.props.className.includes('skeleton')).length, 3);
  assert.deepEqual(ui.calls.filter(c => c.kind === 'list').map(c => c.query.from), ['2026-10-18']);
  assert.equal(ui.calls.some(c => c.kind === 'products'), false);
  ui.unmount();
});

test('preset dates update totals, list and full-ledger Excel export together; duplicate export taps send once', async () => {
  let finish;
  const ui = mountReports({ export: () => new Promise(resolve => { finish = resolve; }) }); await ui.settle();
  ui.button('7 kun').props.onClick(); ui.render(); await ui.settle();
  const latest = kind => ui.calls.filter(call => call.kind === kind).at(-1).query;
  assert.equal(latest('list').from, '2026-10-12');
  assert.equal(latest('list').to, '2026-10-18');
  assert.equal(latest('analytics').from, latest('list').from);
  const click = ui.button('Excel yuklab olish').props.onClick;
  click(); click(); ui.render();
  assert.equal(ui.calls.filter(call => call.kind === 'export').length, 1);
  assert.equal(latest('export').from, latest('list').from);
  assert.equal(latest('export').report, 'receipts');
  assert.equal(ui.calls.find(call => call.kind === 'export').format, 'xlsx');
  finish(new Uint8Array([65, 66]).buffer); await ui.settle();
  assert.deepEqual(ui.saves, ['kirimlar-2026-10-12-2026-10-18.xlsx']);
  ui.unmount();
});

test('custom dates apply once and invalid or inverted dates leave the active report unchanged', async () => {
  const ui = mountReports(); await ui.settle();
  ui.button('Sana tanlash').props.onClick(); ui.render();
  const dates = () => ui.find(node => node.type === 'input' && node.props.type === 'date');
  const submit = () => ui.find(node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  dates()[0].props.onChange({ target: { value: '2026-10-20' } }); ui.render(); submit(); ui.render(); await ui.settle();
  assert.match(ui.text(), /Boshlanish sanasi/);
  assert.equal(ui.calls.filter(c => c.kind === 'list').length, 1);
  dates()[0].props.onChange({ target: { value: '2026-02-30' } }); ui.render(); submit(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'list').length, 1);
  dates()[0].props.onChange({ target: { value: '2026-10-01' } }); ui.render(); submit(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'list').at(-1).query.from, '2026-10-01');
  assert.equal(ui.find(n => n.props.role === 'alert').length, 0);
  ui.unmount();
});

test('one supplier filter applies identically to the totals and receipts and can be cleared', async () => {
  const ui = mountReports(); await ui.settle();
  ui.button('Yetkazib beruvchi').props.onClick(); ui.render();
  ui.find(n => n.type === 'input' && n.props.maxLength === 120)[0].props.onChange({ target: { value: ' Chorsu ' } }); ui.render();
  ui.find(n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }); ui.render(); await ui.settle();
  for (const kind of ['analytics', 'list']) assert.equal(ui.calls.filter(c => c.kind === kind).at(-1).query.supplier, 'Chorsu');
  ui.button('Yetkazib beruvchi filtrini olib tashlash').props.onClick(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'list').at(-1).query.supplier, undefined);
  ui.unmount();
});

test('summary failure preserves receipt access and never invents zero purchase totals; refresh bypasses cached data', async () => {
  const ui = mountReports({ mode: 'analytics-failure' }); await ui.settle();
  assert.match(ui.text(), /Jami ko‘rsatkichlar yuklanmadi/);
  assert.equal(ui.find(n => n.props.className === 'pr-receipt').length, 1);
  assert.equal(ui.find(n => n.props.className === 'pr-metric pr-metric-main').length, 0);
  ui.setMode('ok'); ui.button('Qayta urinish').props.onClick(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'clear-cache').length, 1);
  assert.match(ui.text(), /Jami xarid summasi/);
  ui.unmount();
});

test('receipt failure has a retry state, and an actual empty range has a distinct empty state', async () => {
  const ui = mountReports({ mode: 'list-failure' }); await ui.settle();
  assert.match(ui.text(), /Kirimlar yuklanmadi/);
  assert.doesNotMatch(ui.text(), /Bu davrda kirim yo‘q/);
  ui.setMode('ok'); ui.setList(async () => []); ui.button('Qayta urinish').props.onClick(); ui.render(); await ui.settle();
  assert.match(ui.text(), /Bu davrda kirim yo‘q/);
  assert.equal(ui.button('Excel yuklab olish').props.disabled, true);
  ui.unmount();
});

test('changing receipt pages does not reload totals; pagination uses server count and expands immutable item details', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ localId: `r${i}`, date: '2026-10-18', supplier: 'Chorsu', totalCost: 5000, items: [{ productId: 'p', name: 'Olma', unit: 'kg', quantity: 0.5, buyPrice: 10000, lineCost: 5000 }] }));
  const ui = mountReports({ list: async q => q.page === 1 ? rows : rows.slice(0, 5), analytics: async () => ({ totalProcurementSpend: 125000, totalBatchesCount: 25, totalItemsProcured: { dona: 0, kg: 12.5 } }) }); await ui.settle();
  ui.find(n => n.props.className === 'pr-receipt')[0].props.onClick(); ui.render();
  const details = ui.find(n => n.type?.name === 'ReceiptDetails')[0];
  assert.match(ui.text(ui.exports.ReceiptDetails(details.props)), /Olma/);
  assert.match(ui.text(ui.exports.ReceiptDetails(details.props)), /10,000/);
  ui.button('Keyingi').props.onClick(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'analytics').length, 1);
  assert.equal(ui.calls.filter(c => c.kind === 'list').at(-1).query.page, 2);
  assert.equal(ui.find(n => n.props.className === 'pr-receipt').length, 5);
  assert.equal(ui.button('Keyingi').props.disabled, true);
  ui.unmount();
});

test('late response for an old filter cannot replace the active range', async () => {
  let previous;
  const ui = mountReports({ list: query => query.from === '2026-10-18' ? new Promise(resolve => { previous = resolve; }) : Promise.resolve([]) });
  ui.button('7 kun').props.onClick(); ui.render(); await ui.settle();
  assert.match(ui.text(), /Bu davrda kirim yo‘q/);
  previous([{ localId: 'stale', date: '2026-10-18', totalCost: 100000 }]); await ui.settle();
  assert.equal(ui.find(n => n.props.className === 'pr-receipt').length, 0);
  ui.unmount();
});

test('free accounts retain date filtering and receipt details without requesting finance analytics or exports', async () => {
  const ui = mountReports({ user: { tier: 'tekin' } }); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'analytics').length, 0);
  assert.equal(ui.button('Excel yuklab olish'), undefined);
  ui.button('Shu oy').props.onClick(); ui.render(); await ui.settle();
  assert.equal(ui.calls.filter(c => c.kind === 'list').at(-1).query.from, '2026-10-01');
  assert.equal(ui.find(n => n.props.className === 'pr-receipt').length, 1);
  ui.unmount();
});

test('account-keyed report remounts all state and an old account export cannot download after account switch', async () => {
  let finish;
  const ui = mountReports({ export: () => new Promise(resolve => { finish = resolve; }) }); await ui.settle();
  assert.equal(ui.exports.ProcurementReports({ from: '2026-10-18', to: '2026-10-18' }).key, 'fixture-session');
  ui.button('Excel yuklab olish').props.onClick();
  ui.auth.token = 'new-account';
  assert.equal(ui.exports.ProcurementReports({ from: '2026-10-18', to: '2026-10-18' }).key, 'new-account');
  finish(new Uint8Array([65, 66]).buffer); await ui.settle();
  assert.equal(ui.saves.length, 0);
  ui.unmount();
});


test('desktop Excel export uses the native save dialog with binary workbook bytes', async () => {
  const saved = [];
  const ui = mountReports({ export: async () => new Uint8Array([80,75,3,4,255,0]).buffer, nativeSave: async (filename, bytes) => { saved.push({ filename, bytes: Array.from(bytes) }); return { saved: true }; } });
  await ui.settle(); ui.button('Excel yuklab olish').props.onClick(); await ui.settle();
  assert.equal(saved[0].filename, 'kirimlar-2026-10-18-2026-10-18.xlsx');
  assert.deepEqual(saved[0].bytes, [80,75,3,4,255,0]); assert.equal(ui.saves.length, 0);
  ui.unmount();
});
