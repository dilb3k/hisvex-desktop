const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const web=fs.existsSync('src/lib/inventory.ts');
const inventoryFile=web?'src/lib/inventory.ts':'src/utils/inventory.ts';
const salesFile=web?'src/app/dashboard/sales/page.tsx':'src/screens/SalesScreen.tsx';
const statisticsFile=web?'src/app/dashboard/page.tsx':'src/screens/StatisticsScreen.tsx';
const product={_id:'p',localId:'p',name:'test',quantity:68,unit:'dona',buyPrice:1000,sellPrice:3000};
const entry={_id:'e',productId:'p',date:'2026-10-04',startQuantity:86,currentQuantity:68,sellPrice:3000,buyPrice:1000,sold:18,revenue:54000,realizedProfit:36000,product};

function harness({pin=null,screen="sales",entries=[entry],tier="pro",scope,exportBody}={}) {
  const modules=new Map(), states=[], effects=[], memos=[], sent=[], saved=[]; let cursor=0,tree;
  const state={products:[product],refreshKey:0,showToast(){},refreshAll:async()=>{},applyLocalSale(){}};
  const store=Object.assign(select=>select?select(state):state,{getState:()=>state});
  const memo=(work,deps)=>{const i=cursor++,old=memos[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))memos[i]={value:work(),deps};return memos[i].value;};
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},
    useRef(initial){const i=cursor++;return states[i]??={current:initial};},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))effects[i]={fn,deps,pending:true};},forwardRef:fn=>fn};
  const t=x=>x==='salesHint'?'Mahsulot qoldiqlaridan sotish':x;
  const api={procurementApi:{export:async(params,format)=>{sent.push({params,format});return exportBody ? exportBody() : new Uint8Array([65,66]).buffer;}},inventoryApi:{getByDate:async()=>({data:{items:entries}}),recordSales:async(_date,lines)=>{sent.push(lines);return{status:202,data:{}};}},clearApiCache(){},getDeviceId:()=> 'device'};
  function load(file,extra='') {
    file=path.resolve(file);if(!fs.existsSync(file))file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
    if(modules.has(file))return modules.get(file).exports;
    const module={exports:{}};modules.set(file,module);
    const req=name=>{
      if(name.endsWith('/quantities')||name==='./quantities')return load('src/utils/quantities.ts');
      if(name.endsWith('/QuantityStack'))return load('src/components/QuantityStack.tsx');
      if(name==='react')return react;
      if(name==='zustand')return{create(init){let value;const get=()=>value,set=next=>{value={...value,...(typeof next==='function'?next(value):next)};};value=init(set,get);return Object.assign(select=>select?select(value):value,{getState:get,setState:set});}};
      if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
      if(name.endsWith('/inventory'))return load(inventoryFile);
      if(name.endsWith('/formatters'))return load('src/utils/formatters.ts');
      if(name.endsWith('/sharedStyles')||name.endsWith('/styles/shared'))return{formatMoney:n=>Number(n).toLocaleString('en-US')+" so'm",formatInputAmount:n=>String(n),parseFormattedAmount:n=>Number(String(n).replace(/[^\d.]/g,''))||0};
      if(name.endsWith('/appStore'))return{useAppStore:store};
      if(name.endsWith('/authStore'))return{useAuthStore:Object.assign(select=>select({user:{blockCode:pin,tier,scope},token:'test-token'}),{getState:()=>({token:'test-token'})})};
      if(name.endsWith('/businessDay'))return{getBusinessDate:()=>entry.date};
      if(name.endsWith('/api')||name.endsWith('/api/client'))return api;
      if(name.endsWith('/blockCode'))return{isBlockCodeDisabled:()=>false};
      if(name.endsWith('/offlineQueue'))return{getPendingProductIds:()=>new Set(),subscribe:()=>()=>{},enqueue:async(_kind,operation)=>sent.push(operation.lines)};
      if(name.endsWith('/syncEngine'))return{syncNow:async()=>({ok:false})};
      if(name.endsWith('/network'))return{isOnline:()=>false,isNetworkError:()=>false};
      if(name.endsWith('/i18n'))return{t};
      if(name.endsWith('/statsBuckets'))return load('src/utils/statsBuckets.ts');
      if(name==='dayjs')return require('dayjs');
      return new Proxy({}, {get:(_target,key)=>typeof key==='string'&&key.startsWith('use')?()=>{}:String(key)});
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8')+(file===path.resolve(statisticsFile)?'\nexport {buildProductRankings};':'')+extra,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
      {module,exports:module.exports,require:req,console,Map,Set,Date,JSON,Number,Math,Error,Blob,TextDecoder, URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},document:{createElement:()=>({click(){saved.push(this.download);}})},window:{electronAPI:{saveCsv:async(name,body)=>saved.push({name,body})}},crypto:{randomUUID:()=> 'operation-id'},setTimeout:()=>0,clearTimeout(){}});
    return module.exports;
  }
  const Sales=()=>{const component=load(screen==="statistics"?statisticsFile:salesFile);return web?component.default():screen==="statistics"?component.StatisticsScreen():component.SalesScreen();};
  const all=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(child=>all(child))];
  const text=node=>{if(node==null)return'';if(Array.isArray(node))return node.map(text).join('');if(typeof node!=='object')return String(node);return(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).map(text).join('');};
  const render=()=>{cursor=0;tree=Sales();for(const effect of effects.filter(Boolean))if(effect.pending){effect.pending=false;effect.fn();}return tree;};
  const settle=async()=>{for(let i=0;i<6;i++){await new Promise(r=>setImmediate(r));render();}};
  return{load,render,settle,all:()=>all(tree),text,sent,saved};
}

test('3 units at 5,000 display a green +6,000 and submit exactly 15,000; sale hint is absent',async()=>{
  const h=harness();h.render();await h.settle();
  for(let i=0;i<3;i++){h.all().find(n=>n.type==='button'&&n.props['aria-label']==="Ko'paytirish").props.onClick();h.render();}
  const field=h.all().find(n=>n.type==='input'&&n.props['aria-label']==='editPrice');
  field.props.onChange({target:{value:'5000'}});h.render();
  h.all().find(n=>n.type==='input'&&n.props['aria-label']==='editPrice').props.onBlur({target:{value:'5000'}});h.render();
  const change=h.all().find(n=>n.type==='span'&&h.text(n).startsWith('+')&&h.text(n).replace(/\D/g,'')==='6000');
  assert.ok(change);assert.equal(change.props.style.color,'var(--color-success)');
  assert.equal(h.text(h.render()).includes('−-'),false);
  assert.equal(h.text(h.render()).includes('Mahsulot qoldiqlaridan sotish'),false);
  await h.all().find(n=>n.type==='button'&&h.text(n).includes('confirmSale')).props.onClick();
  assert.equal(h.sent[0][0].quantity,3);assert.equal(h.sent[0][0].lineRevenue,15000);
});
test('statistics and charts use 54,000 + 15,000 = 69,000, including raw offline accumulators',()=>{
  const h=harness(), inventory=h.load(inventoryFile);
  const changed={...entry,startQuantity:83,currentQuantity:65,sold:21,revenue:69000,realizedProfit:48000,lockedSold:3,lockedRevenue:15000,lockedProfit:12000};
  const raw={...changed,sold:undefined,revenue:undefined,realizedProfit:undefined};
  for(const item of[changed,raw]) {
    const metrics=inventory.getInventoryMetrics(item);assert.equal(metrics.sold,21);assert.equal(metrics.revenue,69000);assert.equal(metrics.realizedProfit,48000);
    const stats=h.load(statisticsFile,web?'\nexport {computeTotals,aggregateBuckets};':'\nexport {buildTotals};');
    const total=web?stats.computeTotals([item]):stats.buildTotals(null,[item]);assert.equal(total.earnedRevenue,69000);
    if(web)assert.equal(stats.aggregateBuckets([item],'day').get(entry.date).revenue,69000);
    else assert.equal(h.load('src/utils/statsBuckets.ts').buildDayBuckets([item],[entry.date])[0].revenue,69000);
  }
});
test('lower and zero prices preserve signed revenue and loss; unchanged catalog prices remain unchanged',()=>{
  const h=harness(), {getInventoryMetrics}=h.load(inventoryFile);
  const raw={...entry,startQuantity:83,currentQuantity:65,sold:undefined,revenue:undefined,realizedProfit:undefined,lockedSold:3,lockedRevenue:6000,lockedProfit:3000};
  assert.equal(getInventoryMetrics(raw).revenue,60000);
  assert.equal(getInventoryMetrics({...raw,lockedRevenue:0,lockedProfit:-3000}).revenue,54000);
  assert.equal(getInventoryMetrics({...raw,lockedRevenue:0,lockedProfit:-3000}).realizedProfit,33000);
  assert.equal(getInventoryMetrics(entry).revenue,54000);assert.equal(product.sellPrice,3000);
});
if(!web)test('local checkout replaces stale server metrics and summary before a network acknowledgement',()=>{
  const h=harness(), store=h.load('src/store/appStore.ts').useAppStore;
  store.setState({selectedDate:entry.date,inventoryPerDateCache:{[entry.date]:{items:[entry],summary:{totalRevenue:54000}}},inventory:[entry]});
  store.getState().applyLocalSale(entry.date,[{productId:'p',quantity:3,lineRevenue:15000}]);
  const changed=store.getState().inventory[0];assert.equal(changed.revenue,69000);assert.equal(changed.sold,21);assert.equal(changed.realizedProfit,48000);
  assert.equal(store.getState().inventoryPerDateCache[entry.date].summary,undefined);
});

test('statistics render unit summaries as elements without exposing source text',async()=>{
  const h=harness({screen:'statistics'});h.render();await h.settle();
  const stacks=h.all().filter(node=>node.type?.name==='QuantityStack');
  assert.ok(stacks.length>0);
  assert.ok(stacks.some(node=>node.props.quantities.dona===18&&node.props.quantities.kg===0));
  assert.equal(h.text(h.render()).includes('<QuantityStack'),false);
});

test('editing a fractional sale price preserves the decimal rather than multiplying it by 100',async()=>{
  const h=harness();h.render();await h.settle();
  for(let i=0;i<3;i++){h.all().find(n=>n.type==='button'&&n.props['aria-label']==="Ko'paytirish").props.onClick();h.render();}
  const field=h.all().find(n=>n.type==='input'&&n.props['aria-label']==='editPrice');
  field.props.onChange({target:{value:'5000.50'}});h.render();
  h.all().find(n=>n.type==='input'&&n.props['aria-label']==='editPrice').props.onBlur({target:{value:'5000.50'}});h.render();
  await h.all().find(n=>n.type==='button'&&h.text(n).includes('confirmSale')).props.onClick();
  assert.equal(h.sent[0][0].quantity,3);assert.equal(h.sent[0][0].lineRevenue,15001.5);
});


test('rankings display and order actual sales revenue even when quantity and profit favour another product',async()=>{
  const rows=[{...entry,product:{...product,_id:'cheap',name:'cheap'},sold:20,revenue:10000,realizedProfit:9000},{...entry,product:{...product,_id:'premium',name:'premium'},sold:1,revenue:15000,realizedProfit:1000}];
  const h=harness({screen:'statistics',entries:rows});h.render();await h.settle();
  const stats=h.load(statisticsFile);
  const ranks=stats.buildProductRankings(rows);assert.equal(ranks.find(p=>p.name==='premium').revenue,15000);
  if(web) {const text=h.text(h.render());assert.ok(text.indexOf('premium') < text.indexOf('cheap'));assert.ok(text.includes('15,000'));}
  else {const card=h.all().find(n=>n.props?.title==='topProductsLabel');assert.equal(card.props.items[0].name,'premium');assert.equal(card.props.items[0].revenue,15000);}
});
test('download opens a report choice and receipts export matches the selected day even with no statistics rows',async()=>{
  const h=harness({screen:'statistics',entries:[]});h.render();await h.settle();
  const button=h.all().find(n=>n.type==='button'&&h.text(n).includes('downloadStatistics'));assert.equal(!!button.props.disabled,false);
  button.props.onClick();h.render();const dialog=h.all().find(n=>n.type==='ReportDownloadDialog');assert.equal(dialog.props.visible,true);assert.equal(dialog.props.canExportStatistics,false);
  dialog.props.onSelect('receipts');dialog.props.onSelect('receipts');await h.settle();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].params.report,'receipts');assert.equal(h.sent[0].params.from,entry.date);assert.equal(h.sent[0].params.to,entry.date);
  assert.equal(h.sent[0].format,web?'xlsx':'csv');assert.equal(h.saved.length,1);
  assert.equal(h.all().find(n=>n.type==='ReportDownloadDialog').props.visible,false);
});
