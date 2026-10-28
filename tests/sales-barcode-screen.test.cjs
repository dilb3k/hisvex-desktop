const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const web=fs.existsSync('src/lib/inventory.ts');
const product={_id:'mongo-p',localId:'p',barcodes:['036000291452'],name:'Test Product',quantity:37,unit:'dona',buyPrice:8900,sellPrice:23000};
const entry={_id:'e',productId:'p',date:'2026-10-27',startQuantity:40,currentQuantity:37,buyPrice:8900,sellPrice:23000,product};
function harness(row=entry) {
 const states=[],memos=[],effects=[],modules=new Map(),sent=[];let cursor=0,tree;
 const memo=(fn,deps)=>{const i=cursor++,old=memos[i];if(!old||deps.some((x,j)=>x!==old.deps[j]))memos[i]={value:fn(),deps};return memos[i].value};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(initial){const i=cursor++;return states[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))effects[i]={fn,deps,pending:true}},forwardRef:fn=>fn};
 const state={products:[product],refreshKey:0,refreshAll:async()=>{},loadProducts(){},showToast(){}};
 const store=Object.assign(fn=>fn?fn(state):state,{getState:()=>state});
 function load(file) {
  file=path.resolve(file);if(!fs.existsSync(file))file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
  if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
  const req=name=>{
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'Fragment'};
   if(/\/(inventory|inventoryAdjustment|quantities|formatters|barcodes)$/.test(name)||['./inventory','./quantities','./formatters'].includes(name))return load(`src/${web?'lib':'utils'}/${name.split('/').pop()}.ts`);
   if(name.endsWith('/appStore'))return{useAppStore:store};
   if(name.endsWith('/authStore'))return{useAuthStore:fn=>fn({user:{blockCode:null}})};
   if(name.endsWith('/blockCode'))return{isBlockCodeDisabled:async()=>false};
   if(name.endsWith('/businessDay'))return{getBusinessDate:()=>entry.date,isPastBusinessDate:()=>false,isFutureBusinessDate:()=>false,isTodayBusinessDate:()=>true};
   if(name.endsWith('/api')||name.endsWith('/api/client'))return{inventoryApi:{getByDate:async()=>({data:{items:[row]}}),bulkUpdate:async items=>{sent.push(items);return{status:200}}},getProductImageSrc:()=>'',clearApiCache(){},getDeviceId:()=> 'test'};
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
 const render=()=>{cursor=0;const component=load(web?'src/app/dashboard/sales/page.tsx':'src/screens/SalesScreen.tsx');tree=web?component.default():component.SalesScreen();for(const e of effects.filter(Boolean))if(e.pending){e.pending=false;e.fn()}return tree};
 return{render,async ready(){render();for(let i=0;i<5;i++){await new Promise(r=>setImmediate(r));render()}render()},all:()=>all(tree),text,sent};
}

test('desktop scanner accepts padded retail code and uses the inventory identity',async()=>{
 const h=harness({...entry,currentQuantity:2});await h.ready();
 h.all().find(n=>n.type==='button'&&h.text(n)==='barcode').props.onClick();h.render();
 const scan=code=>{let input=h.all().find(n=>n.type==='input'&&n.props.placeholder==='barcode');input.props.onChange({target:{value:code}});h.render();input=h.all().find(n=>n.type==='input'&&n.props.placeholder==='barcode');input.props.onKeyDown({key:'Enter'});h.render();};
 scan('0036000291452');scan('036000291452');scan('036000291452');
 assert.ok(h.all().some(n=>h.text(n)==='maxStockReached'));
});
