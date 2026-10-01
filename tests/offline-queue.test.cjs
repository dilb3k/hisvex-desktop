const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const source = ts.transpileModule(readFileSync('src/store/offlineQueue.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function setup(store = new Map(), options = {}) {
  const context = { exports: {}, structuredClone, crypto: {randomUUID},
    localStorage: {getItem: key => store.get(key) ?? null, setItem: (key, value) => {if(options.diskFailure) throw Error('disk full'); store.set(key,value)}},
    window: {electronAPI: {
      safeStorageEncrypt: async value => { if(options.beforeEncrypt) await options.beforeEncrypt(value); if(options.encryptFailure) throw Error('key unavailable'); return Buffer.from(value).toString('base64') },
      safeStorageDecrypt: async value => Buffer.from(value, 'base64').toString(),
    }},
  }
  vm.runInNewContext(source, context)
  return context.exports
}
function op(id = randomUUID()) { const at = new Date().toISOString(); return {kind:'sale',id,localId:id,deviceId:'test',occurredAt:at,updatedAt:at,date:'2026-09-30',lines:[{productId:'p',quantity:1,lineRevenue:20}]} }
const key = owner => `hisvex_offline_queue:${owner}`

test('normal persistence survives restart; logout never clears pending writes', async () => {
  const store = new Map(); const queue = setup(store); queue.setActiveUser('A')
  const item = op(); await queue.enqueue('operation',item)
  queue.setActiveUser(null)
  assert.equal(queue.getPendingCount(),0)
  const reopened = setup(store); reopened.setActiveUser('A'); await reopened.waitForQueue()
  assert.equal(reopened.getPendingCount(),1); assert.equal(reopened.getQueueSnapshot().operation[0].id,item.id)
})
test('parallel enqueues serialize encryption and never overwrite a newer snapshot', async () => {
  const store = new Map(); const queue = setup(store); queue.setActiveUser('A')
  await Promise.all(Array.from({length:30}, () => queue.enqueue('operation',op())))
  assert.equal(queue.getPendingCount(),30)
  assert.equal(Object.keys(JSON.parse(Buffer.from(store.get(key('A')),'base64').toString()).operation).length,30)
})
test('duplicate immutable operation is one entry; changed payload is refused', async () => {
  const queue=setup(); queue.setActiveUser('A'); const item=op()
  await queue.enqueue('operation',item); await queue.enqueue('operation',item)
  assert.equal(queue.getPendingCount(),1)
  await assert.rejects(queue.enqueue('operation',{...item,lines:[{productId:'p',quantity:2,lineRevenue:40}]}),/ID/)
})
test('disk/encryption failures do not report success or erase previous operations', async () => {
  const store=new Map(); const options={}; const queue=setup(store,options); queue.setActiveUser('A')
  await queue.enqueue('operation',op()); const original=store.get(key('A'))
  options.diskFailure=true; await assert.rejects(queue.enqueue('operation',op()),/disk full/)
  options.diskFailure=false; options.encryptFailure=true; await assert.rejects(queue.enqueue('operation',op()),/key unavailable/)
  assert.equal(queue.getPendingCount(),1); assert.equal(store.get(key('A')),original)
})
test('logout during encryption completes under original account and never leaks to next account', async () => {
  const store=new Map(); let release; let started
  const start=new Promise(r=>started=r); const barrier=new Promise(r=>release=r)
  const options={beforeEncrypt: async()=>{started();await barrier}}
  const queue=setup(store,options); queue.setActiveUser('A')
  const pending=queue.enqueue('operation',op()); await start
  queue.setActiveUser('B'); release(); await assert.rejects(pending,/Hisob o‘zgardi/)
  assert.equal(queue.getPendingCount(),0); assert.ok(store.has(key('A'))); assert.ok(!store.has(key('B')))
  queue.setActiveUser('A'); await queue.waitForQueue(); assert.equal(queue.getPendingCount(),1)
})
test('acknowledging older product version cannot delete a newer queued edit', async () => {
  const queue=setup(); queue.setActiveUser('A')
  const product={_id:'p',localId:'p',deviceId:'test',updatedAt:'2026-09-30T00:00:00.000Z',name:'First',serverVersion:7}
  await queue.enqueue('product',product)
  const sent=queue.getQueueSnapshot().product[0]
  await queue.enqueue('product',{...product,name:'Second'})
  await queue.removeSynced('product',[sent],'A')
  assert.equal(queue.getPendingCount(),1)
  const latest=queue.getQueueSnapshot().product[0]
  assert.equal(latest.baseVersion,7); assert.notEqual(latest.operationId,sent.operationId)
  await queue.removeSynced('product',[latest],'A'); assert.equal(queue.getPendingCount(),0)
})
test('corrupt or unavailable encrypted data is preserved; no empty fallback overwrites it', async () => {
  const store=new Map([[key('A'),'unreadable']]); const queue=setup(store); queue.setActiveUser('A')
  await assert.rejects(queue.waitForQueue())
  await assert.rejects(queue.enqueue('operation',op()))
  assert.equal(store.get(key('A')),'unreadable')
})
test('unscoped legacy queue stays quarantined instead of being adopted by another account', async () => {
  const store=new Map([['hisvex_offline_queue','legacy data']]); const queue=setup(store);queue.setActiveUser('B');await queue.waitForQueue()
  assert.equal(queue.getPendingCount(),0);assert.equal(store.get('hisvex_offline_queue'),'legacy data')
})
