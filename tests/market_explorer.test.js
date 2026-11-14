'use strict';
// Run offline: node tests/market_explorer.test.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('../logic.js');
require('../market_accuracy.js');
const root=path.join(__dirname,'..');
const marketCode=fs.readFileSync(path.join(root,'market_explorer.js'),'utf8');
const resourceCode=fs.readFileSync(path.join(root,'resource_catalog.js'),'utf8');
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,
  options:[],selectedOptions:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},
  appendChild(child){this.options.push(child);},
  classList:{add(){},remove(){}}});
 return elements.get(id);
}
const document={
 getElementById:el,
 createElement(tag){return {tagName:tag,selected:false,value:'',textContent:'',click(){},remove(){},appendChild(){}};},
 body:{appendChild(){}}
};
const storage=new Map(),localStorage={
 getItem(k){return storage.get(k)??null;},setItem(k,v){storage.set(k,String(v));}
};
const listeners=new Map(),window={ICLogic:globalThis.ICLogic,ICMarketAccuracy:globalThis.ICMarketAccuracy,
 addEventListener(name,fn){listeners.set(name,fn);},
 dispatchEvent(e){listeners.get(e.type)?.(e);}
};
const fakeNames=new Map([
 [1001,'Veldspar'],[1002,'Cobaltite'],[1003,'Clear Icicle'],[1004,'Fullerite-C28'],
 [1005,'Badger'],[1006,'Tritanium'],[1007,'Compressed Veldspar'],
 ...Array.from({length:24},(_,i)=>[2000+i,'Market Item '+i])
]);
const marketGroups=[
 {market_group_id:10,name:'Materials'},
 {market_group_id:11,name:'Asteroid Ores',parent_group_id:10,types:[1001]},
 {market_group_id:12,name:'Moon Ores',parent_group_id:10,types:[1002]},
 {market_group_id:13,name:'Ice',parent_group_id:10,types:[1003]},
 {market_group_id:14,name:'Gas Clouds',parent_group_id:10,types:[1004]},
 {market_group_id:15,name:'Industrial Ships',types:[1005]},
 {market_group_id:16,name:'Minerals',parent_group_id:10,types:[1006,...Array.from({length:24},(_,i)=>2000+i)]},
 {market_group_id:17,name:'Compressed Ores',parent_group_id:10,types:[1007]}
];
const orders=(id,values)=>({order_id:id,type_id:1006,price:10,volume_remain:10,volume_total:20,
 min_volume:1,range:'station',location_id:60000001,system_id:30000142,is_buy_order:false,issued:'2026-11-14T00:00:00Z',duration:90,...values});
const requests=[];
async function fetch(url,opts={}){
 const address=new URL(url);const pathname=address.pathname,method=opts.method||'GET';
 requests.push(method+' '+pathname);
 let data;
 if(pathname==='/markets/groups/')data=marketGroups.map(x=>x.market_group_id);
 else if(/^\/markets\/groups\/\d+\/$/.test(pathname))data=marketGroups.find(x=>x.market_group_id===Number(pathname.split('/')[3]));
 else if(pathname==='/universe/names/'){
  data=JSON.parse(opts.body).filter(id=>fakeNames.has(id)).map(id=>({id,name:fakeNames.get(id)}));
 }else if(pathname==='/universe/ids/')data={inventory_types:[{id:1006,name:'Tritanium'}]};
 else if(/^\/universe\/types\/\d+\/$/.test(pathname)){
  const id=Number(pathname.split('/')[3]);
  const group=marketGroups.find(g=>(g.types||[]).includes(id));
  data={type_id:id,name:fakeNames.get(id),volume:id===1005?2000:1,
   market_group_id:group?.market_group_id||0,published:true};
 }else if(pathname==='/universe/regions/')data=[10000002,10000043,11000001];
 else if(pathname.startsWith('/markets/10000002/orders/'))data=[
  orders(1,{price:20,volume_remain:200,volume_total:250}),
  orders(2,{price:18,volume_remain:80,volume_total:100,is_buy_order:true,range:'region',location_id:60000002})
 ];
 else if(pathname.startsWith('/markets/10000043/orders/'))data=[
  orders(3,{price:25,volume_remain:150,volume_total:200,location_id:60000101,system_id:30002187}),
  orders(4,{price:30,volume_remain:70,volume_total:90,location_id:60000102,system_id:30002187,is_buy_order:true,min_volume:10,range:'solarsystem'})
 ];
 else throw Error('Unexpected URL '+url);
 return {ok:true,headers:{get:()=>null},json:async()=>data};
}
const run=new Function('window','document','localStorage','fetch','setTimeout','clearTimeout','AbortController','CustomEvent','URL',marketCode);
run(window,document,localStorage,fetch,setTimeout,clearTimeout,AbortController,class{constructor(type){this.type=type;}},URL);
const runResources=new Function('window','document','localStorage',resourceCode);
runResources(window,document,localStorage);
const M=window.ICMarketExplorer,R=window.ICResourceBrowser;
(async()=>{
 M.init();R.init('both');
 const items=await M.loadCatalog();
 assert.equal(items.length,fakeNames.size);
 assert.equal(M.catalogState().complete,true);
 assert.equal(JSON.parse(storage.get('4nik8.market.catalog.v1')).items.length,fakeNames.size);
 assert.deepEqual(M.resourceItems('both').map(x=>x.name),['Clear Icicle','Cobaltite','Veldspar']);
 assert.deepEqual(M.resourceItems('gas').map(x=>x.name),['Fullerite-C28']);
 assert.equal(M.compressedFor({name:'Veldspar'}).id,1007);
 // Preset list is deliberately absent from our tiny mock; choose Veldspar manually.
 el('resourceFilter').value='veld';
 el('resourcePickMatches').listeners.click();
 assert.deepEqual(R.selected(),[1001]);
 const ore=await R.loadResources('ore');
 assert.equal(ore.length,1);
 assert.equal(ore[0].name,'Veldspar');
 assert.equal(ore[0].compressedId,1007);
 assert.equal(ore[0].compressedVolume,1);
 assert.equal((await M.itemFromSearch('Tritanium')).id,1006);
 const visible=(await M.regions()).map(x=>x.id);
 assert.deepEqual(visible,[10000002,10000043]);
 el('marketItemSearch').value='Tritanium';
 el('marketQuantity').value='15';
 el('marketAccessFilter').value='all';
 el('marketAuditSide').value='buy';
 el('marketExplorerScope').value='all';
 await M.explore();
 assert(el('marketBestBuy').textContent.includes('20'),'buy price is the lowest sell ask');
 assert(el('marketBestSell').textContent.includes('30'),'sell price is highest buy bid');
 assert(el('marketExplorerTable').innerHTML.includes('The Forge'),'market explorer regional table created');
 assert(el('marketAuditTable').innerHTML.includes('30.00'),'regional highest bid matches ESI cents');
 assert(el('marketAuditTable').innerHTML.includes('Solar System'),'raw range preserved');
 assert(el('marketAuditTable').innerHTML.includes('70'),'remaining quantity preserved');
 assert(el('marketQuantitySummary').innerHTML.includes('15 units'),'quantity quote generated');

 assert(el('marketExplorerStatus').textContent.includes('2/2'),'both known-space regions scanned');
 assert(!el('marketExplorerStatus').textContent.includes('3/3'),'wormhole regions excluded from public markets');
 assert(requests.some(x=>x.includes('/markets/groups/')));
 assert(requests.some(x=>x.includes('/markets/10000043/orders/')));
 console.log('PASS complete all-item market groups, mining category paths, compressed matching, regional highest bids/lowest asks, full region coverage and price visualization');
})().catch(e=>{console.error(e);process.exitCode=1;});
