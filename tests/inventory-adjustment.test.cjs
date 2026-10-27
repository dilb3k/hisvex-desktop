const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadSource } = require('./helpers/load-source.cjs');
const base = fs.existsSync('src/lib/inventoryAdjustment.ts') ? 'src/lib' : 'src/utils';
const { inventoryAdjustment: adjust } = loadSource(`${base}/inventoryAdjustment.ts`);
const entry = { startQuantity: 40, currentQuantity: 37, buyPrice: 8900, sellPrice: 23000 };
test('40 opening and 37 remaining means zero new sales when unchanged', () => {
  const p = adjust(entry, 37);
  assert.equal(p.soldNow, 0); assert.equal(p.sold, 3);
  assert.equal(p.revenue, 69000); assert.equal(p.realizedProfit, 42300);
  assert.equal(adjust(entry, 36).soldNow, 1);
  assert.equal(adjust(entry, 38).soldNow, -1);
});
test('reopening a discounted entry preserves revenue, cost and opening stock', () => {
  const discounted = { ...entry, ...adjust(entry, 37, 60000) };
  const reopened = adjust(discounted, 37);
  assert.equal(reopened.soldNow, 0); assert.equal(reopened.sold, 3);
  assert.equal(reopened.revenue, 60000); assert.equal(reopened.realizedProfit, 33300);
  assert.equal(reopened.startQuantity + reopened.lockedSold, 40);
  const next = adjust(discounted, 36);
  assert.equal(next.sold, 4); assert.equal(next.revenue, 83000); assert.equal(next.realizedProfit, 47400);
});
test('repeated day-total discounts replace revenue without counting old revenue twice', () => {
  const first = { ...entry, ...adjust(entry, 37, 60000) };
  const second = adjust(first, 37, 50000);
  assert.equal(second.revenue, 50000); assert.equal(second.realizedProfit, 23300);
  const third = adjust({ ...first, ...second }, 36, 70000);
  assert.equal(third.sold, 4); assert.equal(third.revenue, 70000); assert.equal(third.realizedProfit, 34400);
});
test('historical cost survives a new cost price and free sales retain their loss', () => {
  const prior = { ...entry, ...adjust(entry, 37, 60000), buyPrice: 10000 };
  assert.equal(adjust(prior, 36, 70000).realizedProfit, 33300);
  const free = adjust(prior, 37, 0);
  assert.equal(free.revenue, 0); assert.equal(free.realizedProfit, -26700);
});
test('gram quantities and fractional prices retain precision through adjustments', () => {
  const p = adjust({ startQuantity: 1, currentQuantity: 0.875, buyPrice: 1000, sellPrice: 2000 }, 0.75, 400);
  assert.equal(p.soldNow, 0.125); assert.equal(p.sold, 0.25);
  assert.equal(p.revenue, 400); assert.equal(p.realizedProfit, 150);
});

test('inventory total opening stock includes earlier negotiated-price sales', () => {
  const { getInventoryTotals } = loadSource(`${base}/inventory.ts`);
  const item = { ...entry, ...adjust(entry, 37, 60000), productId:'p', date:'2026-10-27', unit:'dona', product:{_id:'p',id:'p',localId:'p',buyPrice:8900,sellPrice:23000,unit:'dona'} };
  const totals = getInventoryTotals([item]);
  assert.equal(totals.start, 40); assert.equal(totals.current, 37); assert.equal(totals.sold, 3);
});
