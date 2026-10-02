const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript')
function load(file,mocks={},extra={}) {
 const exports={},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 vm.runInNewContext(code,{exports,require:name=>mocks[name]??require(name),URL,Headers,Response,FormData,Blob,Uint8Array,Buffer,AbortSignal,process:{env:{NODE_ENV:'production'}},console,__dirname:path.resolve('build'),...extra})
 return exports
}
const trust=load('electron/trust.ts')
const local=require('node:url').pathToFileURL(path.resolve('build/renderer/index.html')).href

test('IPC trust accepts only the packaged renderer or explicit dev origin',()=>{
 assert.equal(trust.trustedRendererUrl(local+'#/dashboard',false),true)
 for(const url of ['https://attacker.test',local.replace('index.html','other.html'),'file:///etc/passwd','http://localhost:5173'])assert.equal(trust.trustedRendererUrl(url,false),false)
 assert.equal(trust.trustedRendererUrl('http://localhost:5173/#/login',true),true)
 assert.equal(trust.trustedRendererUrl('http://localhost:5173.attacker.test',true),false)
})
test('native backend transport cannot be used as arbitrary fetch or redirected SSRF',async()=>{
 let calls=0,seen
 const backend=load('electron/backend-request.ts',{'./trust':trust},{fetch:async(url,config)=>{calls++;seen=config;return new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}})}})
 for(const url of ['file:///etc/passwd','https://attacker.test/api/x','https://hisvex-api.onrender.com@attacker.test/api/x','https://hisvex-api.onrender.com/not-api','http://localhost:5000/api/x']) await assert.rejects(backend.requestBackend({url},false))
 assert.equal(calls,0)
 const result=await backend.requestBackend({url:'https://hisvex-api.onrender.com/api/health',headers:{Origin:'null',Authorization:'Bearer test'},timeout:10000},false)
 assert.equal(result.status,200);assert.equal(seen.redirect,'error');assert.equal(seen.headers.has('Origin'),false);assert.equal(seen.headers.get('Authorization'),'Bearer test')
})
test('all sensitive IPC handlers reject a remote frame and child frames; encryption failure writes nothing',async()=>{
 const handlers=new Map(),storage=new Map();let available=false
 const electron={app:{isPackaged:true,getVersion:()=> 'test'},safeStorage:{isEncryptionAvailable:()=>available,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)},BrowserWindow:{fromWebContents:()=>null},nativeTheme:{},shell:{openExternal(){}},dialog:{}}
 const ipc=load('electron/ipc.ts',{'electron':electron,'./trust':trust,'./backend-request':{requestBackend:async()=>({})}})
 ipc.initIpcHandlers({handle:(name,fn)=>handlers.set(name,fn)},{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>storage.set(key,value)})
 const frame={url:local},event={senderFrame:frame,sender:{mainFrame:frame}}
 for(const name of ['store:getToken','store:setToken','safeStorage:decrypt','file:saveCsv','api:request']) {
   assert.throws(()=>handlers.get(name)({...event,senderFrame:{url:'https://attacker.test'}},'test'),/Untrusted/)
   assert.throws(()=>handlers.get(name)({...event,senderFrame:{url:local}},'test'),/Untrusted/)
 }
 assert.throws(()=>handlers.get('store:setToken')(event,'secret'),/unavailable/);assert.equal(storage.size,0)
 assert.throws(()=>handlers.get('safeStorage:encrypt')(event,'pending sale'),/unavailable/)
 available=true;handlers.get('store:setToken')(event,'secret');assert.notEqual(storage.get('token'),'secret');assert.equal(handlers.get('store:getToken')(event),'secret')
})
test('auth bundle is one encrypted write; partial encryption and stale refresh never overwrite stored session',()=>{
 const handlers=new Map(),storage=new Map();let writes=0,failRefresh=false;
 const electron={app:{isPackaged:true},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>{if(failRefresh&&s==='refresh')throw Error('keychain failure');return Buffer.from('encrypted:'+s)},decryptString:b=>b.toString().slice(10)},BrowserWindow:{fromWebContents:()=>null},nativeTheme:{},shell:{},dialog:{}};
 const ipc=load('electron/ipc.ts',{'electron':electron,'./trust':trust,'./backend-request':{requestBackend:async()=>({})}});
 ipc.initIpcHandlers({handle:(name,fn)=>handlers.set(name,fn)},{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>{writes++;if(typeof key==='object')for(const [k,v]of Object.entries(key))storage.set(k,v);else storage.set(key,value)}});
 const frame={url:local},event={senderFrame:frame,sender:{mainFrame:frame}},bundle={token:'access',refreshToken:'refresh',user:{_id:'A',blockCode:'1234',verifiedDeviceIds:['trusted']}};
 failRefresh=true;assert.throws(()=>handlers.get('store:setAuth')(event,bundle),/unavailable/);assert.equal(storage.size,0);assert.equal(writes,0);
 failRefresh=false;handlers.get('store:setAuth')(event,bundle);assert.equal(writes,1);assert.notEqual(storage.get('token'),'access');assert.equal(storage.get('user').blockCode,undefined);assert.equal(storage.get('user').verifiedDeviceIds,undefined);
 assert.equal(handlers.get('store:getAuth')(event).token,'access');
 assert.throws(()=>handlers.get('store:setTokens')(event,{token:'stale',refreshToken:'stale',expectedToken:'foreign'}),/changed/);assert.equal(writes,1);
 handlers.get('store:setTokens')(event,{token:'next',refreshToken:'nextRefresh',expectedToken:'access'});assert.equal(writes,2);assert.equal(handlers.get('store:getAuth')(event).token,'next');
 handlers.get('store:clearAuth')(event);assert.equal(writes,3);assert.equal(handlers.get('store:getAuth')(event).token,'');
})
test('a second Desktop process never opens shared storage and instead restores the existing window',()=>{
 function launch(ownsLock) {
   let stores=0,quits=0,ready;const events=new Map(),calls=[];
   const app={isPackaged:true,requestSingleInstanceLock:()=>ownsLock,quit:()=>quits++,whenReady:()=>({then:fn=>{ready=fn}}),on:(name,fn)=>events.set(name,fn)};
   class Window {constructor(){this.webContents={setWindowOpenHandler(){},on(){},send(){}}}loadFile(){}once(){}on(){}isMinimized(){return true}restore(){calls.push('restore')}show(){calls.push('show')}focus(){calls.push('focus')}static getAllWindows(){return []}}
   class Store {constructor(){stores++}get(key,fallback){return key==='windowBounds'?{width:1280,height:800}:fallback}set(){}}
   load('electron/main.ts',{'electron':{app,BrowserWindow:Window,ipcMain:{},Menu:{setApplicationMenu(){}},nativeTheme:{}},'electron-store':Store,'./trust':trust,'./ipc':{initIpcHandlers(){}}});
   return {events,calls,getStores:()=>stores,getQuits:()=>quits,getReady:()=>ready};
 }
 const secondary=launch(false);assert.equal(secondary.getStores(),0);assert.equal(secondary.getQuits(),1);assert.equal(secondary.getReady(),undefined);
 const primary=launch(true);assert.equal(primary.getStores(),1);primary.getReady()();primary.events.get('second-instance')();assert.deepEqual(primary.calls,['restore','show','focus']);
})
test('native Axios adapter preserves multipart, HTTP conflicts and timeout classification',async()=>{
 const axios=require('axios');let request;let result={status:200,statusText:'OK',headers:{'content-type':'application/json'},data:'{"ok":true}'}
 const {nativeBackendAdapter}=load('src/api/nativeAdapter.ts',{}, {window:{electronAPI:{requestBackend:async r=>{request=r;return result}}}})
 const api=axios.create({baseURL:'https://hisvex-api.onrender.com/api',adapter:nativeBackendAdapter})
 assert.equal((await api.get('/health',{params:{a:'x y'}})).data.ok,true);assert.match(request.url,/a=x\+y/)
 const form=new FormData();form.append('image',new Blob(['image'],{type:'image/png'}),'photo.png');await api.post('/products/p/image',form)
 assert.equal(request.multipart[0].filename,'photo.png');assert.equal(request.multipart[0].bytes.length,5)
 result={...result,status:409};await assert.rejects(api.post('/inventory/operations',{}),e=>e.response.status===409)
 result={networkError:true,timeout:true};await assert.rejects(api.post('/inventory/operations',{}),e=>e.code==='ECONNABORTED')
})
test('CSV formula strings, leading controls, quotes and numeric losses are exported safely',()=>{
 const {escapeCsvCell}=load('src/utils/csv.ts')
 for(const text of ['=1+1','+SUM(A1)','-2+1','@HYPERLINK("x")',' \t=1','\r=1']) assert.ok(escapeCsvCell(text).startsWith('"\''))
 assert.equal(escapeCsvCell(-12.5),'"-12.5"');assert.equal(escapeCsvCell('a,"b"'),'"a,""b"""')
})
