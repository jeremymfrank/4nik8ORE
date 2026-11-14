/* 4NIK8 ORE – public ESI market type catalog, mining resources & regional price explorer */
(function(global){
'use strict';
const $=id=>document.getElementById(id), escape=s=>global.ICLogic.escape(String(s??''));
const KEY='4nik8.market.catalog.v1',DAY=86400000,MARKET_TTL=300000;
const HUBS=new Set([10000002,10000043,10000030,10000042,10000032]);
const KNOWN={'10000002':'The Forge · Jita','10000043':'Domain · Amarr','10000030':'Heimatar · Rens','10000042':'Metropolis · Hek','10000032':'Sinq Laison · Dodixie'};
let catalog=[],catalogFetched=0,catalogComplete=false,catalogErrors=0,catalogPromise=null;
let scanCount=0,regionCache=null;
const mem=new Map();
function notice(id,s){const el=$(id);if(el)el.textContent=s;}
function cache(key,ttl){
 const entry=mem.get(key);return entry&&Date.now()-entry.time<ttl?entry.data:null;
}
async function esi(path,options={}){
 const method=options.method||'GET',body=options.body||null,ttl=options.ttl??DAY,force=!!options.force;
 const key=method+' '+path+' '+(body||''),prior=cache(key,ttl);
 if(!force&&prior!==null)return prior;
 const url='https://esi.evetech.net'+path+(path.includes('?')?'&':'?')+'datasource=tranquility';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(url,{method,body,signal:controller.signal,headers:{
   'Accept':'application/json','X-Compatibility-Date':'2025-12-16',
   ...(body?{'Content-Type':'application/json'}:{})
  }});
  if(!r.ok)throw Error('ESI '+r.status+' '+(r.status===420||r.status===429?'rate limited':r.statusText));
  const data=await r.json();mem.set(key,{data,time:Date.now()});return data;
 }finally{clearTimeout(timer);}
}
async function pool(work,concurrency,onUpdate){
 let offset=0;await Promise.all(Array.from({length:Math.min(concurrency,work.length)},async()=>{
  while(offset<work.length){
   const index=offset++;let value=null,error=null;
   try{value=await work[index]();}catch(e){error=e;}
   if(onUpdate)onUpdate(index,value,error);
   await new Promise(r=>setTimeout(r,130));
  }
 }));
}
function savedCatalog(){
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'null');
  if(value?.version!==1||!Array.isArray(value.items)||value.items.length<20||
   value.items.length>80000||!value.items.every(s=>Number.isInteger(s.id)&&s.id>0&&
    typeof s.name==='string'&&typeof s.group==='string'&&typeof s.path==='string'))return;
  catalog=value.items;catalogFetched=+value.at||0;
  catalogErrors=0;catalogComplete=true;
 }catch(_){}
}
function itemCount(){return catalog.length;}
function catalogItems(){return catalog;}
function catalogState(){return {count:catalog.length,complete:catalogComplete,errors:catalogErrors,at:catalogFetched};}
function hasCatalog(){return catalog.length>0;}
function pathFor(group,groups){
 const names=[],seen=new Set();let g=group;
 for(let i=0;i<16&&g&&!seen.has(g.market_group_id);i++){
  seen.add(g.market_group_id);names.unshift(g.name);
  g=groups.get(+g.parent_group_id);
 }
 return names.join(' > ');
}
function familyOf(item){
 const path=String(item?.path||'').toLowerCase();
 const name=String(item?.name||'').toLowerCase();
 if(name.startsWith('compressed '))return '';
 if(/\bice products?\b/.test(path))return '';
 if(/\bmoon ores?\b/.test(path))return 'moon';
 if(/\basteroid ores?\b|\bcompressed ores?\b|\bores?\b/.test(path)&&!/\bmodules?\b/.test(path))return 'ore';
 if(/\bice\b/.test(path)&&!/\bice products?\b/.test(path))return 'ice';
 if(/\bgas clouds?\b|\bharvestable gas\b/.test(path))return 'gas';
 return '';
}
function resourceItems(mode='both'){
 if(!catalogComplete&&!catalog.length)return [];
 const list=catalog.filter(s=>s.name&&!s.name.startsWith('UNRESOLVED')&&familyOf(s));
 const allowed=mode==='both'?new Set(['ore','moon','ice']):mode==='ore'?new Set(['ore','moon']):new Set([mode]);
 return list.filter(x=>allowed.has(familyOf(x))).sort((a,b)=>a.name.localeCompare(b.name));
}
function compressedFor(item){
 const name=item?.name||'';
 return catalog.find(s=>s.name.toLowerCase()==='compressed '+name.toLowerCase())||null;
}
async function resolveNames(ids){
 const found=[];
 async function chunk(list){
  try{
   const result=await esi('/universe/names/',{method:'POST',body:JSON.stringify(list),ttl:DAY});
   if(!Array.isArray(result))throw Error('Invalid ESI names response');
   found.push(...result);
  }catch(e){
   if(!/\bESI (400|404)\b/.test(e.message))throw e;
   if(list.length===1)return;
   const mid=Math.floor(list.length/2);
   await chunk(list.slice(0,mid));await chunk(list.slice(mid));
  }
 }
 for(let i=0;i<ids.length;i+=400)await chunk(ids.slice(i,i+400));
 return found;
}
function populateSearch(){
 const select=$('marketCatalogSuggest');
 if(!select)return;
 const query=$('marketItemSearch').value.trim().toLowerCase();
 select.innerHTML='';
 if(query.length<2)return;
 const hits=catalog.filter(x=>x.name.toLowerCase().includes(query)).slice(0,90);
 for(const item of hits){
  const o=document.createElement('option');o.value=item.name;select.appendChild(o);
 }
 notice('marketCatalogSummary',catalog.length.toLocaleString()+' market-listed types indexed'+
  (catalogComplete?'':' · INCOMPLETE – retry sync')+
  (hits.length?' · '+hits.length+(hits.length===90?'+':'')+' search suggestions':'')+
  (catalogFetched?' · updated '+new Date(catalogFetched).toLocaleDateString():''));
}
function saveCatalog(items){
 catalog=items;catalogFetched=Date.now();catalogComplete=true;catalogErrors=0;
 try{localStorage.setItem(KEY,JSON.stringify({version:1,at:catalogFetched,items}));}catch(_){
  notice('marketCatalogSummary','Catalog loaded into memory; browser storage quota could not save it.');
 }
}
async function loadCatalog(force=false){
 if(catalogPromise)return catalogPromise;
 if(!force&&catalogComplete&&Date.now()-catalogFetched<7*DAY)return catalog;
 catalogPromise=(async()=>{
  const sync=$('marketCatalogSync');if(sync)sync.disabled=true;
  let failed=0,groups=[],done=0,partialNames=0;
  try{
   notice('marketCatalogSummary','Loading complete EVE market group index from CCP ESI…');
   const ids=await esi('/markets/groups/',{ttl:DAY,force});
   if(!Array.isArray(ids)||ids.length<1||ids.length>12000)throw Error('Unexpected market groups index');
   await pool(ids.map(id=>async()=>esi('/markets/groups/'+id+'/',{ttl:DAY,force})),5,(_,data,error)=>{
    done++;if(error||!data||!Number.isInteger(+data.market_group_id)||typeof data.name!=='string'||
      (data.types!==undefined&&!Array.isArray(data.types)))failed++;
    else groups.push({...data,types:data.types||[]});
    if(done%5===0||done===ids.length)notice('marketCatalogSummary','Fetching market groups '+done+'/'+ids.length+
     (failed?' · '+failed+' failed':'')+'. ESI limits may make the first sync lengthy.');
   });
   if(failed)throw Error('Incomplete group index ('+failed+'/'+ids.length+' group requests failed); old complete cache retained');
   const map=new Map(groups.map(x=>[+x.market_group_id,x]));
   const types=new Map();
   for(const g of groups)for(const id of g.types){
    if(!Number.isInteger(+id)||+id<=0||types.has(+id))continue;
    types.set(+id,{id:+id,group:g.name,path:pathFor(g,map)});
   }
   if(!types.size)throw Error('No market-listed item types returned from ESI');
   const entries=[...types.values()],idsToName=entries.map(x=>x.id);
   const chunk=idsToName.reduce((result,_,i)=>{if(i%400===0)result.push(idsToName.slice(i,i+400));return result;},[]);
   const named=new Map();done=0;
   await pool(chunk.map(set=>async()=>resolveNames(set)),3,(_,data,error)=>{
    done++;if(error)failed++;
    else for(const n of data)if(types.has(+n.id)&&typeof n.name==='string'&&n.name.trim())named.set(+n.id,n.name.trim());
    if(done%2===0||done===chunk.length)notice('marketCatalogSummary','Resolving item names '+done+'/'+chunk.length+
      ' · '+named.size.toLocaleString()+' resolved'+(failed?' · '+failed+' failures':''));
   });
   if(failed)throw Error('Name resolution incomplete ('+failed+' requests failed); old complete cache retained');
   const final=entries.map(x=>({...x,name:named.get(x.id)||'UNRESOLVED TYPE #'+x.id})).sort((a,b)=>a.name.localeCompare(b.name));
   partialNames=final.length-named.size;
   saveCatalog(final);populateSearch();global.dispatchEvent(new CustomEvent('ic-market-catalog-updated'));
   notice('marketCatalogSummary',final.length.toLocaleString()+' market item IDs indexed from '+groups.length+
    ' market groups'+(partialNames?' · '+partialNames+' unresolved names':'')+
    '. Use item search or scan ore/ice/moon resources.');
   return final;
  }catch(error){
   catalogComplete=!!catalog.length&&catalogComplete;catalogErrors=failed||1;
   notice('marketCatalogSummary','Full catalog sync failed: '+error.message+
    (catalog.length?' · retaining '+catalog.length.toLocaleString()+' previously cached item IDs.':' · Exact item-name lookup still works.'));
   if(!catalog.length)throw error;
   return catalog;
  }finally{
   catalogPromise=null;if(sync)sync.disabled=false;
  }
 })();
 return catalogPromise;
}
async function itemFromSearch(value){
 const raw=String(value||'').trim();if(!raw)throw Error('Enter an item name or EVE type ID');
 let id=Number(raw);
 let found=Number.isInteger(id)&&id>0?catalog.find(s=>s.id===id):catalog.find(s=>s.name.toLowerCase()===raw.toLowerCase());
 if(!found&&!Number.isInteger(id)){
  const named=await esi('/universe/ids/',{method:'POST',body:JSON.stringify([raw]),ttl:DAY});
  const type=(named.inventory_types||[]).find(t=>t.name.toLowerCase()===raw.toLowerCase());
  if(!type)throw Error('Item not found. Enter an exact EVE item name or choose an indexed suggestion.');
  id=type.id;
 }else if(found)id=found.id;
 if(!(id>0))throw Error('Unknown item ID');
 const detail=await esi('/universe/types/'+id+'/',{ttl:DAY});
 if(!detail.market_group_id)throw Error('EVE item exists, but is not listed on the player market.');
 if(detail.published===false)throw Error('This item type is unpublished.');
 return {id,name:detail.name||found?.name||raw,volume:+detail.volume||0};
}
async function regions(){
 if(regionCache)return regionCache;
 const list=await esi('/universe/regions/',{ttl:DAY});
 if(!Array.isArray(list))throw Error('Invalid ESI region list');
 // Normal public-market regions, including high-, low-, null-sec and Pochven.
 // W-space and nonstandard instance regions have no public regional market.
 const ids=list.filter(id=>Number.isInteger(+id)&&+id>=10000000&&+id<11000000);
 const named=new Map();
 try{for(const n of await resolveNames(ids))if(n&&n.name)named.set(+n.id,n.name);}catch(_){}
 regionCache=ids.map(id=>({id:+id,name:named.get(+id)||KNOWN[id]||'Region #'+id}));
 return regionCache;
}
function summarize(orders,region){
 let ask=null,bid=null,askCount=0,bidCount=0,askVolume=0,bidVolume=0;
 for(const o of orders){
  if(!Number.isFinite(+o.price)||+o.price<=0||!(+o.volume_remain>0)||!o.location_id)continue;
  const item={price:+o.price,volume:+o.volume_remain,minVolume:+o.min_volume||1,
   locationId:o.location_id,systemId:o.system_id};
  if(o.is_buy_order){
   bidCount++;bidVolume+=item.volume;
   if(!bid||item.price>bid.price)bid=item;
  }else{
   askCount++;askVolume+=item.volume;
   if(!ask||item.price<ask.price)ask=item;
  }
 }
 return {...region,ask,bid,askCount,bidCount,askVolume,bidVolume};
}
async function describeMarketLocations(rows){
 const systems=[...new Set(rows.flatMap(r=>[r.ask?.systemId,r.bid?.systemId]).filter(x=>Number.isInteger(+x)&&+x>0).map(Number))];
 let nameById=new Map();
 try{nameById=new Map((await resolveNames(systems)).map(x=>[+x.id,x.name]));}catch(_){}
 for(const r of rows)for(const order of [r.ask,r.bid])if(order){
  order.systemName=nameById.get(+order.systemId)||'System #'+order.systemId;
 }
 const bestAsk=rows.filter(r=>r.ask).sort((a,b)=>a.ask.price-b.ask.price)[0]?.ask;
 const bestBid=rows.filter(r=>r.bid).sort((a,b)=>b.bid.price-a.bid.price)[0]?.bid;
 const orders=[...new Set([bestAsk,bestBid].filter(Boolean))];
 await pool(orders.map(order=>async()=>{
  const id=+order.locationId;
  if(id>=60000000&&id<64000000){
   const data=await esi('/universe/stations/'+id+'/',{ttl:DAY});
   return {order,name:data.name};
  }
  return {order,name:order.systemName+' · structure #'+id+' (access unverified)'};
 }),2,(_,result)=>{if(result)result.order.stationName=result.name;});
}
function orderLocation(order){
 return order?(order.stationName||order.systemName+' · location #'+order.locationId):'—';
}
function fmt(n,d=2){return Number(n).toLocaleString('en-US',{maximumFractionDigits:d});}
function orderRow(r){
 const buy=r.ask?.price, sell=r.bid?.price;
 const diff=buy&&sell?sell-buy:null;
 return '<tr><td>'+escape(r.name)+'</td><td class="num">'+(buy?fmt(buy):'—')+
  '</td><td class="market-location">'+escape(orderLocation(r.ask))+
  '</td><td class="num">'+(sell?fmt(sell):'—')+
  '</td><td class="market-location">'+escape(orderLocation(r.bid))+'</td><td class="num">'+
  (diff===null?'—':fmt(diff))+'</td><td class="num">'+
  fmt(r.askVolume,0)+' / '+fmt(r.bidVolume,0)+'</td><td class="num">'+
  r.askCount+' / '+r.bidCount+'</td></tr>';
}
function barRows(rows,kind){
 const key=kind==='buy'?'ask':'bid';
 const relevant=rows.filter(r=>r[key]?.price>0).sort((a,b)=>kind==='buy'?a.ask.price-b.ask.price:b.bid.price-a.bid.price).slice(0,12);
 const max=Math.max(...relevant.map(x=>x[key].price),1);
 if(!relevant.length)return '<p class="muted">No '+(kind==='buy'?'sell':'buy')+' orders reported in completed regions.</p>';
 return relevant.map(r=>{
  const width=Math.max(1,100*r[key].price/max);
  return '<div class="market-bar-row"><span title="'+escape(r.name)+'">'+escape(r.name)+'</span>'+
   '<div class="market-bar-track"><div class="market-bar-fill '+(kind==='buy'?'ask':'bid')+
   '" style="width:'+width.toFixed(2)+'%"></div></div><b>'+fmt(r[key].price)+' ISK</b></div>';
 }).join('');
}
function showResults(item,rows,failed,total,stamp){
 const sorted=rows.filter(r=>r.ask||r.bid);
 const cheapest=[...sorted].filter(r=>r.ask).sort((a,b)=>a.ask.price-b.ask.price)[0];
 const bestbid=[...sorted].filter(r=>r.bid).sort((a,b)=>b.bid.price-a.bid.price)[0];
 $('marketItemHeadline').textContent=item.name+' · TYPE '+item.id+' · '+fmt(item.volume,3)+' m³/unit';
 $('marketBestBuy').textContent=cheapest?fmt(cheapest.ask.price)+' ISK':'NO PUBLIC SELL ORDERS';
 $('marketBestBuyLocation').textContent=cheapest?cheapest.name+' · '+fmt(cheapest.ask.volume,0)+' units · '+orderLocation(cheapest.ask):'No executable ask found';
 $('marketBestSell').textContent=bestbid?fmt(bestbid.bid.price)+' ISK':'NO PUBLIC BUY ORDERS';
 $('marketBestSellLocation').textContent=bestbid?bestbid.name+' · '+fmt(bestbid.bid.volume,0)+' units · min '+fmt(bestbid.bid.minVolume,0)+' · '+orderLocation(bestbid.bid):'No executable bid found';
 $('marketExplorerCharts').innerHTML='<div class="market-chart-column"><h4>LOWEST ASK · WHERE TO BUY</h4>'+
  barRows(sorted,'buy')+'</div><div class="market-chart-column"><h4>HIGHEST BID · WHERE TO SELL</h4>'+barRows(sorted,'sell')+'</div>';
 const byRegion=[...rows].sort((a,b)=>Number(!!b.ask||!!b.bid)-Number(!!a.ask||!!a.bid)||
  (a.ask?.price??Infinity)-(b.ask?.price??Infinity));
 $('marketExplorerTable').innerHTML='<table class="market-prices-table"><thead><tr><th>REGION</th><th>LOWEST ASK<br>BUY HERE</th><th>BUY LOCATION</th><th>HIGHEST BID<br>SELL HERE</th><th>SELL LOCATION</th><th>RAW SPREAD*</th><th>ASK / BID<br>UNITS</th><th>ASK / BID<br>ORDERS</th></tr></thead><tbody>'+
  byRegion.map(orderRow).join('')+'</tbody></table>';
 notice('marketExplorerStatus','Checked '+(total-failed)+'/'+total+' ESI public regions at '+new Date(stamp).toLocaleString()+
  ' · '+sorted.length+' regions with current orders · '+failed+' failed/unavailable · visible quantities are from public orders only.');
}
async function explore(){
 const button=$('marketExplorerGo');if(button.disabled)return;
 button.disabled=true;const token=++scanCount,stamp=Date.now();
 $('marketExplorerCharts').innerHTML='';
 $('marketExplorerTable').innerHTML='';
 $('marketItemHeadline').textContent='Loading selected market item…';
 $('marketBestBuy').textContent='—';$('marketBestSell').textContent='—';
 try{
  const item=await itemFromSearch($('marketItemSearch').value);
  const all=await regions();
  const scope=$('marketExplorerScope').value;
  const selected=scope==='hubs'?all.filter(x=>HUBS.has(x.id)):all;
  if(!selected.length)throw Error('No supported regions were returned by ESI.');
  const data=[];let errors=0,done=0;
  notice('marketExplorerStatus','Querying '+selected.length+' public regional order books for '+item.name+'…');
  await pool(selected.map(reg=>async()=>esi('/markets/'+reg.id+'/orders/?order_type=all&type_id='+item.id,{ttl:MARKET_TTL})),3,(i,orders,error)=>{
   done++;if(error||!Array.isArray(orders))errors++;
   else data.push(summarize(orders,selected[i]));
   if(token===scanCount)notice('marketExplorerStatus','Regional price scan '+done+'/'+selected.length+
    ' · '+errors+' unavailable or failed. Do not interpret incomplete coverage as a global best.');
  });
  if(token!==scanCount)return;
  if(!data.length)throw Error('No public region queries succeeded; no prices can be verified.');
  await describeMarketLocations(data);
  showResults(item,data,errors,selected.length,stamp);
 }catch(error){
  if(token===scanCount)notice('marketExplorerStatus','Market explorer: '+error.message+' No prices were invented.');
 }finally{button.disabled=false;}
}
function init(){
 savedCatalog();populateSearch();
 if(catalog.length)notice('marketCatalogSummary',catalog.length.toLocaleString()+
  ' market-listed EVE items cached · '+(Date.now()-catalogFetched>=7*DAY?'refresh recommended':'catalog ready'));
 $('marketCatalogSync').addEventListener('click',()=>loadCatalog(true).catch(()=>{}));
 $('marketItemSearch').addEventListener('input',populateSearch);
 $('marketExplorerForm').addEventListener('submit',e=>{e.preventDefault();explore();});
 $('marketExplorerRefresh').addEventListener('click',()=>{loadCatalog(true).catch(()=>{});});
}
global.ICMarketExplorer={loadCatalog,catalogItems,resourceItems,compressedFor,catalogState,itemFromSearch,
 regions,summarize,init,explore,familyOf,esi,marketGroupCount:itemCount};
})(window);
