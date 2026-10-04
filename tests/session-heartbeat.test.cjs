const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')

function harness() {
  let tick, cleared=false, interval
  const scope={exports:{},setInterval:(callback,ms)=>{tick=callback;interval=ms;return 1},clearInterval:()=>{cleared=true}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sessionHeartbeat.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope)
  return {start:scope.exports.startSessionHeartbeat,tick:()=>tick(),cleared:()=>cleared,interval:()=>interval}
}
test('presence only runs for an active client, never overlaps, and stops on logout/unmount',async()=>{
  const h=harness();let active=false,calls=0,finish
  const heartbeat=h.start(()=>{calls++;return new Promise(resolve=>finish=resolve)},()=>active)
  assert.equal(calls,0);assert.equal(h.interval(),60000)
  active=true;const first=heartbeat.ping();h.tick();await heartbeat.ping()
  assert.equal(calls,1)
  finish();await first
  active=false;await heartbeat.ping();assert.equal(calls,1)
  heartbeat.stop();active=true;h.tick();await heartbeat.ping();assert.equal(calls,1);assert.equal(h.cleared(),true)
})
test('a failed presence request releases the guard and can recover without clearing auth',async()=>{
  const h=harness();let calls=0
  const heartbeat=h.start(async()=>{calls++;throw Error('offline')},()=>true)
  await new Promise(resolve=>setImmediate(resolve))
  await heartbeat.ping();assert.equal(calls,2);heartbeat.stop()
})
