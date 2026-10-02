const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
function load(api) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/authStorage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window:{electronAPI:api},atob,Date});return exports;
}
const token=id=>'header.'+Buffer.from(JSON.stringify({userId:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
test('credential persistence and clearing failures are visible, never converted into success',async()=>{
 const h=load({setAuth:async()=>{throw Error('keychain failure')},clearAuth:async()=>{throw Error('disk failure')},getAuth:async()=>{throw Error('decryption failure')}});
 await assert.rejects(h.writeStoredAuth({token:token('A'),refreshToken:'r',user:{_id:'A'}}),/keychain/);await assert.rejects(h.clearStoredAuth(),/disk/);await assert.rejects(h.readStoredAuth(),/decryption/);
});
test('atomic auth read requires matching owner and keeps valid cached identity without a PIN',async()=>{
 const user={_id:'A',username:'owner'};const stored={token:token('A'),refreshToken:'r',user};const h=load({getAuth:async()=>stored});assert.equal((await h.readStoredAuth()).user._id,'A');assert.ok(h.tokenExpiry(stored.token)>Date.now());
 stored.user={_id:'B'};await assert.rejects(h.readStoredAuth(),/mos emas/);stored.user=null;await assert.rejects(h.readStoredAuth(),/mos emas/);
});
test('atomic token refresh forwards the expected prior credential and surfaces compare-and-swap rejection',async()=>{
 let sent;const h=load({setTokens:async value=>{sent=value;throw Error('Stored session changed')}});await assert.rejects(h.setStoredTokens('new','refresh','old'),/changed/);assert.equal(sent.expectedToken,'old');
});
