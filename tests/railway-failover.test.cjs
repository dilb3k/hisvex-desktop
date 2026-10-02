const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript')
const {webcrypto}=require('node:crypto')
const {AxiosError}=require('axios')

// Same load() shape as tests/security.test.cjs, loading the real
// src/api/client.ts (not a mock of it) so this exercises the actual
// isFailoverTriggering/isRailwayPlatformNotFound logic end to end through
// axios's real interceptor pipeline.
function load(file,mocks={},extra={}) {
  const exports={},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  // setInterval/clearInterval are no-ops: client.ts's health-recheck timer
  // isn't what this suite is testing, and a real 3-minute interval would
  // otherwise keep the test process alive.
  vm.runInNewContext(code,{exports,require:name=>mocks[name]??(name==='../utils/manualMutationIntent'?load('src/utils/manualMutationIntent.ts'):require(name)),crypto:webcrypto,TextEncoder,console,setInterval:()=>0,clearInterval:()=>{},...extra})
  return exports
}

// A custom axios adapter is responsible for its OWN validateStatus/settle
// behavior — axios's shared dispatch pipeline does not apply it for you
// (only the built-in http/xhr adapters do). Mirrors what the real
// nativeAdapter.ts does, so this test exercises the same contract.
function mockAdapter(responses) {
  let i=0
  return async config => {
    const next=responses[Math.min(i,responses.length-1)]; i++
    const response={data:next.data,status:next.status,statusText:next.statusText??'',headers:next.headers??{},config}
    if(config.validateStatus && !config.validateStatus(response.status)) throw new AxiosError(`Request failed with status code ${response.status}`,AxiosError.ERR_BAD_REQUEST,config,undefined,response)
    return response
  }
}

function setup(responses, storage = new Map()) {
  const mods=load('src/api/client.ts',{
    './nativeAdapter':{nativeBackendAdapter:async()=>{throw Error('not used in this test')}},
    '../store/offlineQueue':{getActiveUser:()=>'owner-1'},
    '../constants':{API_BASE_URL:'https://primary.test/api',API_BACKUP_URL:'https://backup.test/api'},
    '../utils/businessDay':{getBusinessDate:()=>'2026-10-01'},
    '../utils/authStorage':{setStoredToken:async()=>{},setStoredRefreshToken:async()=>{},setStoredStaleToken:async()=>{}},
  },{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}})
  const api=mods.default
  const calls=[]
  const adapter=mockAdapter(responses)
  api.defaults.adapter=async config=>{calls.push({baseURL:config.baseURL,method:config.method,id:config.headers['Idempotency-Key']});return adapter(config)}
  return {api,calls,storage}
}

const RAILWAY_404_BODY={status:'error',code:404,message:'Application not found',request_id:'vQjzBoa2QEiUe6rGs_GTAg'}

test('a real Railway "Application not found" 404 fails over to the backup host exactly once',async()=>{
  const {api,calls}=setup([
    {status:404,data:RAILWAY_404_BODY},
    {status:200,data:{success:true,data:{ok:true}}},
  ])
  const res=await api.get('/auth/me')
  assert.equal(res.data.ok,true)
  assert.equal(calls.length,2)
  assert.equal(calls[0].baseURL,'https://primary.test/api')
  assert.equal(calls[1].baseURL,'https://backup.test/api')
})

test('a Railway 404 recognized via the x-railway-router header also fails over',async()=>{
  const {api,calls}=setup([
    {status:404,data:{message:'not found'},headers:{'x-railway-router':'edge'}},
    {status:200,data:{success:true,data:{ok:true}}},
  ])
  const res=await api.get('/auth/me')
  assert.equal(res.data.ok,true)
  assert.equal(calls.length,2)
})

test('an ordinary business 404 from a live backend is never retried on the backup host',async()=>{
  const {api,calls}=setup([
    {status:404,data:{success:false,error:{message:'Mahsulot topilmadi'}}},
  ])
  // client.ts's generic error handler (by design) turns the AxiosError into
  // a plain Error carrying just the backend's message/code — so the
  // observable contract here is the message, not a surviving .response.
  await assert.rejects(api.get('/products/missing'),e=>e.message==='Mahsulot topilmadi')
  assert.equal(calls.length,1)
  assert.equal(calls[0].baseURL,'https://primary.test/api')
})

test('a 404 on a write request is never inspected for platform-failover and never replayed',async()=>{
  const {api,calls}=setup([
    {status:404,data:RAILWAY_404_BODY},
  ])
  await assert.rejects(api.post('/debtors',{}),e=>e.message==='Application not found')
  assert.equal(calls.length,1)
})

test('502/503/504 still fail over exactly as before (regression guard)',async()=>{
  const {api,calls}=setup([
    {status:503,data:'down'},
    {status:200,data:{success:true,data:{ok:true}}},
  ])
  const res=await api.get('/auth/me')
  assert.equal(res.data.ok,true)
  assert.equal(calls.length,2)
})
test('a business error mentioning Application not found cannot masquerade as a platform outage',async()=>{
 const {api,calls}=setup([{status:404,data:{success:false,error:{message:'Application not found'}},headers:{'x-railway-router':'edge'}}]);
 await assert.rejects(api.get('/products/missing'),/Application not found/);assert.equal(calls.length,1);
});

test('manual restock timeout retains ID across renderer restart and known success ends the intent',async()=>{
 const first=setup([{status:503,data:{success:false,error:{code:'WRITE_OUTCOME_UNKNOWN'}}}]);
 await assert.rejects(first.api.patch('/products/p/restock',{quantity:2}));const id=first.calls[0].id;assert.ok(id);assert.equal(first.storage.size,1);
 const retry=setup([{status:200,data:{success:true,data:{ok:true}}}],first.storage);
 await retry.api.patch('/products/p/restock',{quantity:2});assert.equal(retry.calls[0].id,id);assert.equal(first.storage.size,0);
 await retry.api.patch('/products/p/restock',{quantity:2});assert.notEqual(retry.calls[1].id,id);
});
test('changed manual payload never leaves renderer while the previous result is unknown',async()=>{
 const h=setup([{status:503,data:{success:false,error:{code:'WRITE_OUTCOME_UNKNOWN'}}}]);
 await assert.rejects(h.api.post('/debtors/d/adjust',{type:'add',amount:10}));
 await assert.rejects(h.api.post('/debtors/d/adjust',{type:'add',amount:20}),/oldingi/);assert.equal(h.calls.length,1);
});
test('platform write failure switches future explicit same-ID retry to Render without replaying the first request',async()=>{
 const h=setup([{status:404,data:RAILWAY_404_BODY},{status:200,data:{success:true,data:{ok:true}}}]);
 const config={headers:{'Idempotency-Key':'test-stable-batch'}};await assert.rejects(h.api.post('/procurements',{items:[]},config));assert.equal(h.calls.length,1);
 await h.api.post('/procurements',{items:[]},config);assert.equal(h.calls.length,2);assert.equal(h.calls[1].baseURL,'https://backup.test/api');assert.equal(h.calls[1].id,h.calls[0].id);
});
test('a read started on the already active backup is attempted once even when that host is down',async()=>{
 const h=setup([{status:503,data:'down'}]);await assert.rejects(h.api.get('/auth/me'));assert.equal(h.calls.length,2);
 await assert.rejects(h.api.get('/auth/me'));assert.equal(h.calls.length,3);
});
