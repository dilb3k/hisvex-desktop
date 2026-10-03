const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/procurementIntent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {createProcurementIntent,validateProcurementItems}=context.exports;
const item={name:'Apples',unit:'kg',quantity:0.333,buyPrice:12.34};
function fixture(){let saved=null,ids=0,active=true,tail=Promise.resolve();const storage={read:async()=>saved&&JSON.parse(JSON.stringify(saved)),write:async next=>{saved=JSON.parse(JSON.stringify(next))},lock:work=>{const next=tail.then(work,work);tail=next.catch(()=>{});return next}};return {storage,make:()=>createProcurementIntent(storage,()=>`batch-${++ids}`,()=>{if(!active)throw Error('account changed')}),saved:()=>saved,deactivate:()=>{active=false}};}
test('batch stays a draft until one confirmation persists a single ID before network dispatch',async()=>{
 const f=fixture(),c=f.make();await c.load();await c.saveDraft([item,{...item,name:'Pears'}]);let calls=0;
 await c.confirm(async(id,items)=>{calls++;assert.equal(f.saved().id,id);assert.equal(items.length,2);return {localId:'receipt'}});
 assert.equal(calls,1);assert.equal(f.saved().items.length,0);assert.equal((await f.make().load()).items.length,0);
});
test('unknown outcome survives restart with exactly the same ID and immutable body',async()=>{
 const f=fixture(),c=f.make();await c.saveDraft([item]);let first;
 await assert.rejects(c.confirm(async(id,items)=>{first={id,items};throw Error('lost response')}),/lost/);
 await assert.rejects(c.saveDraft([{...item,quantity:4}]),/tasdig/);
 const restarted=f.make();await restarted.load();await restarted.confirm(async(id,items)=>{assert.equal(id,first.id);assert.equal(JSON.stringify(items),JSON.stringify(first.items));return {localId:'receipt'}});
});
test('storage failure cannot dispatch a write or claim success',async()=>{
 const f=fixture(),c=f.make();await c.saveDraft([item]);f.storage.write=async()=>{throw Error('disk unavailable')};let calls=0;
 await assert.rejects(c.confirm(async()=>{calls++;return {localId:'receipt'}}),/disk/);assert.equal(calls,0);
});
test('lost local ACK preserves original pending intent for safe receipt replay',async()=>{
 const f=fixture(),c=f.make();await c.saveDraft([item]);const write=f.storage.write;let id;
 await assert.rejects(c.confirm(async sent=>{id=sent;f.storage.write=async()=>{throw Error('ack disk failure')};return {localId:'receipt'}}),/ack disk/);
 f.storage.write=write;const r=f.make();await r.load();await r.confirm(async sent=>{assert.equal(sent,id);return {localId:'receipt'}});
});
test('two controllers/tabs serialize confirmation and cannot create two financial operations',async()=>{
 const f=fixture(),a=f.make();await a.saveDraft([item]);const b=f.make();await b.load();let calls=0;
 const results=await Promise.allSettled([a.confirm(async()=>{calls++;return {localId:'r'}}),b.confirm(async()=>{calls++;return {localId:'r'}})]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('stale tab cannot overwrite a newer cart',async()=>{
 const f=fixture(),a=f.make();await a.saveDraft([item]);const b=f.make();await b.load();await a.saveDraft([item,{...item,name:'New'}]);
 await assert.rejects(b.saveDraft([{...item,name:'Stale'}]),/boshqa oynada/);assert.equal(f.saved().items.length,2);
});
test('account/scope switch during response cannot ACK or delete the old owner intent',async()=>{
 const f=fixture(),c=f.make();await c.saveDraft([item]);
 await assert.rejects(c.confirm(async()=>{f.deactivate();return {localId:'r'}}),/account changed/);assert.ok(f.saved().id);
});
test('invalid whole pieces, sub-gram quantities and incomplete server ACK never erase a cart',async()=>{
 for(const invalid of [{...item,unit:'dona',quantity:1.5},{...item,quantity:0.0001},{...item,buyPrice:Infinity}])assert.throws(()=>validateProcurementItems([invalid]));
 const f=fixture(),c=f.make();await c.saveDraft([item]);await assert.rejects(c.confirm(async()=>({})),/tasdiqlamadi/);assert.ok(f.saved().id);
});

test('supplier and scanner barcode persist offline and remain immutable on unknown receipt replay',async()=>{
 const f=fixture(),c=f.make();await c.load();await c.saveSupplier(' Chorsu ');await c.saveDraft([{...item,barcodes:['ASAL-001']}]);
 assert.equal(f.saved().supplier,'Chorsu');let first;
 await assert.rejects(c.confirm(async(id,items,supplier)=>{first={id,items,supplier};throw Error('lost response')}),/lost/);
 await assert.rejects(c.saveSupplier('Other'),/tasdig/);
 const restarted=f.make();await restarted.load();await restarted.confirm(async(id,items,supplier)=>{assert.equal(JSON.stringify({id,items,supplier}),JSON.stringify(first));return {localId:'r'}});
 assert.equal(f.saved().supplier,undefined);
});
test('supplier autosave never replaces cart items and stale tabs cannot rewrite metadata',async()=>{
 const f=fixture(),a=f.make();await a.saveDraft([item]);const b=f.make();await b.load();await a.saveSupplier('A');
 assert.equal(f.saved().items.length,1);await assert.rejects(b.saveSupplier('B'),/boshqa oynada/);
 await a.saveSupplier('');assert.equal(f.saved().supplier,undefined);await assert.rejects(a.saveSupplier('X'.repeat(121)),/uzun/);
});
