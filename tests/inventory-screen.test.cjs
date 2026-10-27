const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const web=fs.existsSync('src/lib/inventory.ts');
const product={_id:'p',localId:'p',name:'Test Product',quantity:37,unit:'dona',buyPrice:8900,sellPrice:23000};
const entry={_id:'e',productId:'p',date:'2026-10-27',startQuantity:40,currentQuantity:37,buyPrice:8900,sellPrice:23000,product};
function harness(row=entry, getByDate) {
 const states=[],memos=[],effects=[],modules=new Map(),sent=[];let cursor=0,tree;
 const memo=(fn,deps)=>{const i=cursor++,old=memos[i];if(!old||deps.some((x,j)=>x!==old.deps[j]))memos[i]={value:fn(),deps};return memos[i].value};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(initial){const i=cursor++;return states[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))effects[i]={fn,deps,pending:true}},forwardRef:fn=>fn};
 const state={products:[product],refreshKey:0,refreshAll:async()=>{},loadProducts(){},showToast(){}};
 const store=Object.assign(fn=>fn(state),{getState:()=>state});
 function load(file) {
  file=path.resolve(file);if(!fs.existsSync(file))file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
  if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
  const req=name=>{
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'Fragment'};
   if(/\/(inventory|inventoryAdjustment|quantities|formatters)$/.test(name)||['./inventory','./quantities','./formatters'].includes(name))return load(`src/${web?'lib':'utils'}/${name.split('/').pop()}.ts`);
   if(name.endsWith('/appStore'))return{useAppStore:store};
   if(name.endsWith('/authStore'))return{useAuthStore:fn=>fn({user:{blockCode:null}})};
   if(name.endsWith('/blockCode'))return{isBlockCodeDisabled:()=>false};
   if(name.endsWith('/businessDay'))return{getBusinessDate:()=>entry.date,isPastBusinessDate:()=>false,isFutureBusinessDate:()=>false,isTodayBusinessDate:()=>true};
   if(name.endsWith('/api')||name.endsWith('/api/client'))return{inventoryApi:{getByDate:getByDate??(async()=>({data:{items:[row]}})),bulkUpdate:async items=>{sent.push(items);return{status:200}}},clearApiCache(){},getDeviceId:()=> 'test'};
   if(name.endsWith('/offlineQueue'))return{getPendingProductIds:()=>new Set(),subscribe:()=>()=>{},enqueue:async(_kind,operation)=>sent.push(operation.items)};
   if(name.endsWith('/network'))return{isOnline:()=>false};
   if(name.endsWith('/sharedStyles')||name.endsWith('/styles/shared'))return{formatMoney:n=>String(n)};
   if(name.endsWith('/i18n'))return{t:key=>key};
   if(name==='dayjs')return require('dayjs');
   return new Proxy({},{get:(_t,key)=>typeof key==='string'&&key.startsWith('use')?()=>{}:String(key)});
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:req,console,Map,Set,Number,Math,Date,crypto:{randomUUID:()=> 'test-op'},setTimeout:()=>0,clearTimeout(){}});
  return module.exports;
 }
 const all=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children)];
 const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
 const render=()=>{cursor=0;const component=load(web?'src/app/dashboard/inventory/page.tsx':'src/screens/InventoryScreen.tsx');tree=web?component.default():component.InventoryScreen();for(const e of effects.filter(Boolean))if(e.pending){e.pending=false;e.fn()}return tree};
 return{render,state,async ready(){render();for(let i=0;i<5;i++){await new Promise(r=>setImmediate(r));render()}all(tree).find(n=>n.props.onClick&&(web?n.props.className==='list-row-hover':n.key==='p')).props.onClick();render()},all:()=>all(tree),text,sent};
}
test('inventory modal displays zero new units and disables unchanged save for 40 / 37',async()=>{
 const h=harness();await h.ready();
 const row=h.all().find(n=>n.type==='div'&&h.text(n)==='newSold0 dona');assert.ok(row);
 const save=()=>h.all().find(n=>n.type==='button'&&h.text(n).includes('save')&&!h.text(n).includes('preSave'));
 assert.equal(save().props.disabled,true);
 const quantity=h.all().find(n=>n.type==='input'&&n.props.value==='37');quantity.props.onChange({target:{value:'36'}});h.render();
 assert.ok(h.all().some(n=>n.type==='div'&&h.text(n)==='newSold1 dona'));
 assert.equal(save().props.disabled,false);
 await save().props.onClick();assert.equal(h.sent[0][0].currentQuantity,36);assert.equal(h.sent[0][0].lineRevenue,undefined);
});
test('discounted stock modal keeps original opening and sends the revised day total exactly once',async()=>{
 const h=harness({...entry,startQuantity:37,lockedSold:3,lockedRevenue:60000,lockedProfit:33300});await h.ready();
 assert.ok(h.all().some(n=>n.type==='div'&&h.text(n)==='start40 dona'));
 const revenue=()=>h.all().find(n=>n.type==='input'&&n.props['aria-label']==='expectedRevenue');
 assert.equal(Number(String(revenue().props.value).replace(/[^\d.]/g,'')),60000);
 revenue().props.onChange({target:{value:'50000'}});h.render();
 const save=h.all().find(n=>n.type==='button'&&h.text(n).includes('save')&&!h.text(n).includes('preSave'));
 assert.equal(save.props.disabled,false);await save.props.onClick();assert.equal(h.sent.length,1);assert.equal(h.sent[0][0].lineRevenue,50000);
});

test('revenue without sold units is blocked with an explanation and remains editable', async () => {
 const h=harness({...entry,startQuantity:40,currentQuantity:40}); await h.ready();
 const revenue=()=>h.all().find(n=>n.type==='input'&&n.props['aria-label']==='expectedRevenue');
 revenue().props.onChange({target:{value:'100'}});h.render();
 assert.ok(h.all().some(n=>n.props.role==='alert'&&h.text(n)==='revenueRequiresSales'));
 const save=h.all().find(n=>n.type==='button'&&h.text(n).includes('save')&&!h.text(n).includes('preSave'));
 assert.equal(save.props.disabled,true);assert.equal(!!revenue().props.disabled,false);
});

test('a delayed inventory response cannot overwrite a newer refresh', async () => {
 const requests=[];const h=harness(entry,()=>new Promise(resolve=>requests.push(resolve)));
 h.render();h.state.refreshKey++;h.render();assert.equal(requests.length,2);
 requests[1]({data:{items:[{...entry,product:{...product,name:'Fresh inventory'}}]}});
 await new Promise(r=>setImmediate(r));h.render();
 assert.ok(h.text(h.render()).includes('Fresh inventory'));
 requests[0]({data:{items:[{...entry,product:{...product,name:'Obsolete inventory'}}]}});
 await new Promise(r=>setImmediate(r));h.render();
 assert.ok(h.text(h.render()).includes('Fresh inventory'));assert.equal(h.text(h.render()).includes('Obsolete inventory'),false);
});
