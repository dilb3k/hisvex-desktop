const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
const {createHash,randomUUID}=require('node:crypto');
const source=fs.readFileSync('src/utils/manualMutationIntent.ts','utf8');const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod);
const {createManualMutationRegistry,isDurableManualMutation,isDefinitiveMutationRejection}=mod.exports;
function harness(store=new Map(),assertActive=()=>{},failWrite=()=>false) {
 let tail=Promise.resolve();
 const registry=createManualMutationRegistry({read:async key=>store.get(key)??null,write:async(key,value)=>{if(failWrite())throw Error('disk failure');if(value)store.set(key,JSON.parse(JSON.stringify(value)));else store.delete(key)},lock:(_key,work)=>{const run=tail.then(work);tail=run.catch(()=>{});return run}},randomUUID,async value=>createHash('sha256').update(value).digest('hex'),assertActive);
 return {registry,store};
}
test('manual mutation timeout and process restart retain the original immutable ID',async()=>{
 const a=harness();const first=await a.registry.claim('post:/debtors/d/adjust',{amount:10,type:'add'});
 const b=harness(a.store);const retry=await b.registry.claim('post:/debtors/d/adjust',{type:'add',amount:10});assert.equal(retry.id,first.id);
 await assert.rejects(b.registry.claim('post:/debtors/d/adjust',{amount:20,type:'add'}),/oldingi/);
 await b.registry.acknowledge('post:/debtors/d/adjust',first.id);assert.notEqual((await b.registry.claim('post:/debtors/d/adjust',{amount:10,type:'add'})).id,first.id);
});
test('parallel duplicate manual submissions share one ID; an old ACK cannot delete a new operation',async()=>{
 const h=harness();const intents=await Promise.all(Array.from({length:20},()=>h.registry.claim('post:/products',{name:'item'})));assert.equal(new Set(intents.map(i=>i.id)).size,1);
 await h.registry.acknowledge('post:/products',intents[0].id);const next=await h.registry.claim('post:/products',{name:'item'});await h.registry.acknowledge('post:/products',intents[0].id);assert.equal(h.store.get('post:/products').id,next.id);
});
test('disk failure prevents ID claim and failed local ACK keeps the original identity',async()=>{
 let fail=true;const h=harness(new Map(),()=>{},()=>fail);await assert.rejects(h.registry.claim('post:/products',{name:'item'}),/disk/);assert.equal(h.store.size,0);
 fail=false;const intent=await h.registry.claim('post:/products',{name:'item'});fail=true;await assert.rejects(h.registry.acknowledge('post:/products',intent.id),/disk/);assert.equal(h.store.get('post:/products').id,intent.id);
});
test('account switch during response never acknowledges the outgoing account intent',async()=>{
 let active=true;const h=harness(new Map(),()=>{if(!active)throw Error('account changed')});const intent=await h.registry.claim('post:/debtors',{amount:20});active=false;await assert.rejects(h.registry.acknowledge('post:/debtors',intent.id),/account/);assert.equal(h.store.size,1);
});
test('identity storage contains no request data, password or password hash',async()=>{
 const h=harness();const first=await h.registry.claim('put:/auth/admins/admin',{tier:'pro',password:'test-private-password'});assert.equal(first.fingerprint,'credential-change');assert.equal(JSON.stringify([...h.store]).includes('test-private-password'),false);
 const retry=await h.registry.claim('put:/auth/admins/admin',{tier:'pro',password:'test-another-password'});assert.equal(retry.id,first.id,'server receipt rejects a changed secret payload without inventing a new operation');
});
test('only durable receipt endpoints are registered and ambiguous responses never release intent',()=>{
 for(const [method,url] of [['post','/products'],['patch','/products/p/restock'],['delete','/products/p'],['post','/debtors/d/adjust'],['put','/auth/admins/a'],['post','/subscriptions/activate']])assert.equal(isDurableManualMutation(method,url),true,url);
 for(const [method,url] of [['get','/products'],['post','/auth/login'],['post','/products/p/image'],['post','/sync'],['post','/procurements'],['post','/inventory/operations']])assert.equal(isDurableManualMutation(method,url),false,url);
 assert.equal(isDefinitiveMutationRejection(400,{success:false,error:{code:'VALIDATION_ERROR'}}),true);
 for(const code of ['IDEMPOTENCY_CONFLICT','OPERATION_IN_PROGRESS','LEGACY_RECEIPT_RECONCILIATION_REQUIRED'])assert.equal(isDefinitiveMutationRejection(409,{success:false,error:{code}}),false);
 assert.equal(isDefinitiveMutationRejection(404,{message:'Application not found'}),false);assert.equal(isDefinitiveMutationRejection(503,{success:false}),false);
});
