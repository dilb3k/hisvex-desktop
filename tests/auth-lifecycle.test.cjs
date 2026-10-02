const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function harness(overrides={}) {
 let active=null,apiToken=null,blockReads=0;
 const storage={readStoredAuth:async()=>null,writeStoredAuth:async()=>{},setStoredUser:async()=>{},clearStoredAuth:async()=>{},tokenExpiry:()=>Date.now()+3600000,...overrides};
 const api={setApiToken:token=>apiToken=token,setRefreshToken:()=>{},clearApiCache:()=>{},authApi:{getMe:async()=>({data:{_id:'A'}}),logout:async()=>{},...overrides.authApi}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/store/authStore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>({'../api/client':api,'../utils/authStorage':storage,'../utils/businessDay':{syncBusinessDayFromServer(){}},'./offlineQueue':{setActiveUser:value=>active=value},'./appStore':{useAppStore:{getState:()=>({reset(){}})}}}[name]??require(name)),window:{electronAPI:{blockGet:async()=>{blockReads++;return '1234'},blockClear:async()=>{}}},Date,console});
 return {store:exports.useAuthStore,clear:exports.clearSession,storage,getActive:()=>active,getToken:()=>apiToken,getBlockReads:()=>blockReads};
}
test('Desktop login waits for durable auth and a storage failure never marks login successful',async()=>{
 const gate=deferred(),h=harness({writeStoredAuth:()=>gate.promise});const login=h.store.getState().setAuth('A-token','r',{_id:'A'});assert.equal(h.store.getState().isAuthenticated,false);gate.reject(Error('disk failure'));await assert.rejects(login,/disk/);assert.equal(h.store.getState().isAuthenticated,false);assert.equal(h.getToken(),null);assert.equal(h.getActive(),null);
});
test('a delayed old hydration cannot replace a newly authenticated account',async()=>{
 const gate=deferred(),h=harness({readStoredAuth:()=>gate.promise});const old=h.store.getState().hydrate();await h.store.getState().setAuth('B-token','r',{_id:'B'});gate.resolve({token:'A-token',refreshToken:'r',user:{_id:'A'}});await old;assert.equal(h.store.getState().user._id,'B');assert.equal(h.getActive(),'B');assert.equal(h.getToken(),'B-token');assert.equal(h.store.getState().isLoading,false);
});
test('limited session hydration never inherits the full owner local PIN or activates a financial queue',async()=>{
 const user={_id:'A',scope:'procurement',blockCode:null};const h=harness({readStoredAuth:async()=>({token:'limited',refreshToken:'',user}),authApi:{getMe:async()=>({data:user})}});await h.store.getState().hydrate();assert.equal(h.store.getState().isAuthenticated,true);assert.equal(h.store.getState().user.blockCode,null);assert.equal(h.getBlockReads(),0);assert.equal(h.getActive(),null);
});
test('auth outage restores only an unexpired matching cached session, without clearing disk data',async()=>{
 const outage=Object.assign(Error('database unavailable'),{code:'AUTH_UNAVAILABLE'});let clears=0;const common={readStoredAuth:async()=>({token:'cached',refreshToken:'r',user:{_id:'A'}}),clearStoredAuth:async()=>clears++,authApi:{getMe:async()=>{throw outage}}};
 const valid=harness(common);await valid.store.getState().hydrate();assert.equal(valid.store.getState().isAuthenticated,true);
 const expired=harness({...common,tokenExpiry:()=>Date.now()-1});await expired.store.getState().hydrate();assert.equal(expired.store.getState().isAuthenticated,false);assert.equal(clears,0);
});
