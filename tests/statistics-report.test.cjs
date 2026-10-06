const { test } = require('node:test'), assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');
const { statisticsReportRows, statisticsReportCsv } = loadSource('src/utils/statisticsReport.ts');
const product = { _id: 'p', name: '=dangerous', unit: 'kg', buyPrice: 1000, sellPrice: 3000 };
test('statistics CSV sums negotiated sale flows once and takes only the latest stock per product', () => {
  const items = [{ product, date: '2026-10-03', sold: 3, revenue: 15000, realizedProfit: 12000, currentQuantity: 10 }, { product, date: '2026-10-04', sold: .1 + .2, revenue: 1000, realizedProfit: 700, currentQuantity: 9.7 }];
  const rows = statisticsReportRows(items, Array.from({ length: 9 }, (_, i) => 'column-' + i), 'Jami');
  assert.equal(rows.length, 3); assert.equal(rows[1][5], 16000); assert.equal(rows[1][6], 12700);
  assert.equal(rows[1][7], '9.7 kg'); assert.equal(rows[1][8], 29100);
  assert.equal(rows[2][4], '0 dona / 3.3 kg'); assert.equal(rows[2][5], 16000);
  const csv = statisticsReportCsv(items, ['Product'], 'Jami');
  assert.ok(csv.includes('"\'=dangerous"')); assert.equal(csv.includes('000000000000'), false);
});
