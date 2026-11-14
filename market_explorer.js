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
function exportCatalog(){
 if(!catalog.length)return;
 const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
 const rows=[['type_id','item_name','market_group','market_path'],...catalog.map(x=>[x.id,x.name,x.group,x.path])];
 const csv='\uFEFF'+rows.map(row=>row.map(q).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),address=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=address;a.download='4nik8-eve-market-items-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(address),1200);
}
function populateSearch(){
 const select=$('marketCatalogSuggest');
 if(!select)return;
 $('marketCatalogExport').disabled=!catalog.length;
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

const Accuracy=global.ICMarketAccuracy;
let lastScan=null,auditPage=0;
const PAGE_SIZE=50;
const pretty=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
const isk=n=>Accuracy.price(n);
const pathMarket=(regionId,typeId,page)=>'/markets/'+regionId+'/orders/?order_type=all&type_id='+typeId+
 (page>1?'&page='+page:'');
async function fetchMarketPage(regionId,typeId,page=1){
 const path=pathMarket(regionId,typeId,page),key='marketpage|'+path,prior=cache(key,MARKET_TTL);
 if(prior!==null)return prior;
 const url='https://esi.evetech.net'+path+'&datasource=tranquility';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetch(url,{headers:{'Accept':'application/json','X-Compatibility-Date':'2025-12-16'},
   signal:controller.signal});
  if(!response.ok)throw Error('ESI '+response.status+' '+(response.status===420||response.status===429?
   'market rate limit':response.statusText));
  const body=await response.json();
  if(!Array.isArray(body))throw Error('Market orders response is not an array');
  const xPages=Number(response.headers?.get?.('X-Pages')||1);
  if(!Number.isInteger(xPages)||xPages<1||xPages>500)throw Error('Unreasonable ESI X-Pages header: '+xPages);
  const result={body,xPages,observedAt:Date.now(),modified:response.headers?.get?.('Last-Modified')||'',
   expires:response.headers?.get?.('Expires')||''};
  mem.set(key,{data:result,time:Date.now()});return result;
 }finally{clearTimeout(timer);}
}
async function fetchCompleteOrders(region,typeId){
 const first=await fetchMarketPage(region.id,typeId,1);
 const batches=[first.body],pageErrors=[];
 if(first.xPages>1){
  const pages=Array.from({length:first.xPages-1},(_,i)=>i+2);
  await pool(pages.map(page=>async()=>fetchMarketPage(region.id,typeId,page)),2,(index,result,error)=>{
   if(error)pageErrors.push('page '+pages[index]+' '+error.message);
   else batches.push(result.body);
  });
 }
 if(pageErrors.length)throw Error(region.name+' missing '+pageErrors.length+' of '+first.xPages+' order pages; region excluded');
 const full=Accuracy.validateBook(batches.flat(),typeId).map(o=>({...o,regionId:region.id,regionName:region.name}));
 return {orders:full,pages:first.xPages,observedAt:first.observedAt,modified:first.modified,expires:first.expires};
}
function summarize(orders,region,filter='all'){
 const mapped=orders?.length&&orders[0].orderId?orders:
  Accuracy.validateBook(orders||[],orders?.[0]?.type_id);
 return Accuracy.regionSummary(mapped.map(o=>({...o,regionId:region.id,regionName:region.name})),region,filter);
}
async function localOperatingContext(){
 const text=$('systemInput')?.value?.trim();
 if(!text)return null;
 try{
  const found=await esi('/universe/ids/',{method:'POST',body:JSON.stringify([text]),ttl:DAY});
  const match=(found.systems||[]).find(x=>x.name.toLowerCase()===text.toLowerCase());
  if(!match)return null;
  const sys=await esi('/universe/systems/'+match.id+'/',{ttl:DAY});
  const constellation=await esi('/universe/constellations/'+sys.constellation_id+'/',{ttl:DAY});
  return {regionId:+constellation.region_id,systemId:+match.id,systemName:sys.name||text};
 }catch(_){return null;}
}
async function deliveryFromInputs(local){
 if(!local)return null;
 const raw=$('marketDeliveryStation').value.trim();
 const base={...local,locationId:null};
 if(!raw)return base;
 const id=Number(raw);
 if(!Number.isSafeInteger(id)||id<1||!Accuracy.isNpcStation(id))
  throw Error('Delivery station must be a valid NPC station ID (60000000–63999999). Structure docking/access cannot be verified.');
 const detail=await esi('/universe/stations/'+id+'/',{ttl:DAY});
 if(Number(detail.system_id)!==local.systemId)
  throw Error('Delivery station #'+id+' is not in '+local.systemName+'. Correct the station ID or operating system.');
 return {...base,locationId:id,stationName:detail.name||'Station #'+id};
}
function orderLocation(o){
 return o?.stationName||o?.systemName&&o.systemName+' · '+(o.isStructure?'structure':'location')+' #'+o.locationId||
  (o?'Location #'+o.locationId:'—');
}
async function describeOrders(rows){
 const orders=rows.flatMap(r=>[r.ask,r.bid]).filter(Boolean);
 const systems=[...new Set(orders.map(o=>o.systemId))];
 let names=[];
 try{names=await resolveNames(systems);}catch(_){}
 const lookup=new Map(names.filter(x=>x&&x.name).map(x=>[+x.id,x.name]));
 for(const o of orders)o.systemName=lookup.get(o.systemId)||'System #'+o.systemId;
 const leaders=rows.flatMap(r=>[r.ask,r.bid]).filter(Boolean).sort((a,b)=>b.price-a.price).slice(0,4);
 await pool(leaders.filter(o=>o.isNpcStation).map(o=>async()=>{
  const d=await esi('/universe/stations/'+o.locationId+'/',{ttl:DAY});
  return {o,name:d.name};
 }),2,(_,r)=>{if(r)r.o.stationName=r.name;});
}
function fmtOrder(o){
 return o?isk(o.price):'—';
}
function fmt(n,d=2){return Number(n).toLocaleString('en-US',{maximumFractionDigits:d});}
function orderRow(r){
 const ask=r.ask,bid=r.bid,diff=ask&&bid?bid.price-ask.price:null;
 return '<tr><td>'+escape(r.name)+'</td><td class="num">'+fmtOrder(ask)+
  '</td><td class="market-location">'+escape(orderLocation(ask))+
  '</td><td class="num">'+fmtOrder(bid)+
  '</td><td class="market-location">'+escape(orderLocation(bid))+
  '</td><td class="num">'+(diff===null?'—':isk(diff))+
  '</td><td class="num">'+pretty(r.askVolume)+' / '+pretty(r.bidVolume)+
  '</td><td class="num">'+r.askCount+' / '+r.bidCount+'</td></tr>';
}
function barRows(rows,kind){
 const key=kind==='buy'?'ask':'bid',ascending=kind==='buy';
 const relevant=rows.filter(r=>r[key]?.price>0)
  .sort((a,b)=>ascending?a.ask.price-b.ask.price:b.bid.price-a.bid.price).slice(0,12);
 if(!relevant.length)return '<p class="muted">No public '+(ascending?'sell':'buy')+' orders in these completed regions.</p>';
 const best=relevant[0][key].price;
 return relevant.map(r=>{
  // Longest bar = most favorable price, on BOTH sides of the market.
  const width=ascending?100*best/r[key].price:100*r[key].price/best;
  return '<div class="market-bar-row"><span title="'+escape(r.name)+'">'+escape(r.name)+'</span>'+
   '<div class="market-bar-track"><div class="market-bar-fill '+(ascending?'ask':'bid')+
   '" style="width:'+Math.min(100,Math.max(1,width)).toFixed(2)+'%"></div></div><b>'+isk(r[key].price)+' ISK</b></div>';
 }).join('');
}
function advertisedBest(rows,side){
 return rows.filter(r=>side==='ask'?r.ask:r.bid).sort((a,b)=>side==='ask'?
  a.ask.price-b.ask.price:b.bid.price-a.bid.price)[0]||null;
}
function allOrders(){return lastScan?.regions.flatMap(r=>r.orders)||[];}
function getInputs(){
 const quantity=Math.floor(+$('marketQuantity').value);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000000)
  throw Error('Enter a whole-number quantity between 1 and 1,000,000,000 units');
 return {quantity,filter:$('marketAccessFilter').value==='npc'?'npc':'all'};
}
function renderRegionalTable(rows){
 const byRegion=[...rows].sort((a,b)=>Number(!!b.ask||!!b.bid)-Number(!!a.ask||!!a.bid)||
  (a.ask?.price??Infinity)-(b.ask?.price??Infinity));
 $('marketExplorerTable').innerHTML='<table class="market-prices-table"><thead><tr>'+
  '<th>REGION</th><th>LOWEST ASK<br>BUY HERE</th><th>BUY LOCATION</th>'+
  '<th>HIGHEST BID<br>SELL HERE</th><th>SELL LOCATION</th><th>RAW SPREAD*</th>'+
  '<th>ASK / BID<br>UNITS</th><th>ASK / BID<br>ORDERS</th></tr></thead><tbody>'+
  byRegion.map(orderRow).join('')+'</tbody></table>';
}
function renderLocalComparison(rows,lowest,highest){
 const local=lastScan.local;
 const region=rows.find(r=>r.id===local?.regionId);
 const el=$('marketExplorerLocal');
 if(!local){el.textContent='Local market comparison unavailable: enter a valid operating system in System Navigation.';return;}
 if(!region){el.textContent=local.systemName+' · local region #'+local.regionId+
  ' was not included in this scan. Select ALL PUBLIC REGIONS or OPERATING REGION ONLY.';return;}
 el.innerHTML='<b>OPERATING REGION · '+escape(region.name)+'</b> · '+escape(local.systemName)+
  ' · Lowest local ask: <strong>'+fmtOrder(region.ask)+'</strong> · Highest local bid: <strong>'+
  fmtOrder(region.bid)+'</strong> · Global lowest ask: <strong>'+fmtOrder(lowest?.ask)+'</strong>'+
  ' · Global highest bid: <strong>'+fmtOrder(highest?.bid)+'</strong>. Location and range still govern execution.';
}
function quantityLine(fill,quantity,side){
 if(!fill)return 'No eligible '+side+' orders for this quantity.';
 return (fill.full?'FULL '+pretty(quantity)+' units':'PARTIAL '+pretty(fill.filled)+'/'+pretty(quantity)+' units')+
  ' · '+isk(fill.average)+' ISK/unit volume-weighted · '+isk(fill.total)+' ISK gross · '+
  fill.legs.length+' order'+(fill.legs.length===1?'':'s')+
  (fill.locationId?' · issuing location #'+fill.locationId:'');
}
function renderQuantity(rows,quantity,filter){
 const orders=allOrders(),asks=Accuracy.bestStationFill(orders,quantity,'ask',filter);
 const bids=Accuracy.bestStationFill(orders,quantity,'bid',filter);
 const div=$('marketQuantitySummary');
 let html='<b>QUANTITY-CHECKED STATION BOOKS · '+pretty(quantity)+' UNITS</b>'+
  '<div><span>Buy from single seller station:</span> '+escape(quantityLine(asks,quantity,'ask'))+'</div>'+
  '<div><span>Sell to single issuing-station book:</span> '+escape(quantityLine(bids,quantity,'bid'))+'</div>';
 if(lastScan.delivery){
  const localBuys=lastScan.regions.find(x=>x.id===lastScan.delivery.regionId);
  if(localBuys){
   const eligible=Accuracy.volumeFill(localBuys.orders,quantity,'bid',filter,lastScan.delivery);
   const unknown=localBuys.orders.filter(x=>x.isBuy&&Accuracy.eligibility(x,lastScan.delivery)==='unknown').length;
   html+='<div><span>Buy orders accepting delivery in '+escape(lastScan.local.systemName)+':</span> '+
    escape(quantityLine(eligible,quantity,'bid'))+' · '+unknown+
    ' orders have unverified range eligibility (including jump-radius routes)</div>';
  }
 }
 div.innerHTML=html+'<small>Volume fills use original ESI remaining quantity and minimum-volume rules. Orders from different stations are not combined unless a known delivery location satisfies their range. Prices and locations may change before execution; structures remain access-unverified.</small>';
}
function auditOptions(){
 const select=$('marketAuditRegion'),remember=select.value;
 select.innerHTML='<option value="all">ALL SCANNED REGIONS</option>'+
  lastScan.regions.map(r=>'<option value="'+r.id+'">'+escape(r.name)+'</option>').join('');
 select.value=lastScan.regions.some(r=>String(r.id)===remember)?remember:'all';
}
function auditEntries(){
 const select=$('marketAuditRegion').value,side=$('marketAuditSide').value;
 return allOrders().filter(o=>(select==='all'||String(o.regionId)===select)&&
   (side==='all'||o.isBuy===(side==='buy')))
  .sort((a,b)=>side==='sell'?a.price-b.price:b.price-a.price);
}
function renderAudit(){
 if(!lastScan)return;
 const rows=auditEntries(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 auditPage=Math.min(Math.max(0,auditPage),pages-1);
 const page=rows.slice(auditPage*PAGE_SIZE,(auditPage+1)*PAGE_SIZE);
 $('marketAuditSummary').textContent=rows.length.toLocaleString()+
  ' public order records matching the audit filters · '+allOrders().length.toLocaleString()+
  ' total validated ESI records across '+lastScan.regions.length+
  ' completed regions · exact order ID / price / volume / range retained · snapshot '+new Date(lastScan.stamp).toLocaleString();
 const delivery=lastScan.delivery;
 $('marketAuditTable').innerHTML='<table class="market-prices-table market-orders-table"><thead><tr>'+
  '<th>REGION</th><th>ORDER ID</th><th>SIDE</th><th>UNIT PRICE · ISK</th><th>REMAINING</th>'+
  '<th>ORIGINAL</th><th>MIN QTY</th><th>BUY RANGE</th><th>ISSUING LOCATION</th>'+
  '<th>SYSTEM</th><th>ACCESS / DELIVERY</th></tr></thead><tbody>'+
  page.map(o=>{
   const eligible=delivery&&o.isBuy?Accuracy.eligibility(o,delivery):null;
   const status=o.isStructure?'STRUCTURE · ACCESS UNVERIFIED':o.isNpcStation?'NPC STATION':'OTHER LOCATION';
   return '<tr><td>'+escape(o.regionName)+'</td><td class="num">'+o.orderId+
    '</td><td>'+(o.isBuy?'BUY BID':'SELL ASK')+'</td><td class="num">'+isk(o.price)+
    '</td><td class="num">'+pretty(o.volumeRemain)+'</td><td class="num">'+pretty(o.volumeTotal)+
    '</td><td class="num">'+pretty(o.minVolume)+'</td><td>'+escape(Accuracy.rangeLabel(o.range))+
    '</td><td class="num">'+o.locationId+'</td><td class="num">'+o.systemId+
    '</td><td>'+escape(status)+(eligible?' · DELIVERY '+eligible.toUpperCase():'')+'</td></tr>';
  }).join('')+'</tbody></table>';
 $('marketAuditPage').textContent=(auditPage+1)+' / '+pages;
 $('marketAuditPrev').disabled=auditPage<=0;
 $('marketAuditNext').disabled=auditPage>=pages-1;
 $('marketExportOrders').disabled=!lastScan.regions.length;
}
function exportOrders(){
 if(!lastScan)return;
 const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
 const headers=['region_id','region','order_id','type_id','is_buy_order','price_isk','volume_remain',
  'volume_total','min_volume','range','location_id','system_id','issued','duration','structure_access_unverified'];
 const csv='\uFEFF'+[headers,...allOrders().map(o=>[
  o.regionId,o.regionName,o.orderId,o.typeId,o.isBuy,o.price,o.volumeRemain,
  o.volumeTotal,o.minVolume,o.range,o.locationId,o.systemId,o.issued,o.duration,o.isStructure
 ])].map(a=>a.map(q).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 const node=document.createElement('a');node.href=url;node.download='4nik8-public-orders-'+
  lastScan.item.id+'-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(node);node.click();node.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function renderResults(){
 if(!lastScan)return;
 const {quantity,filter}=getInputs(),rows=lastScan.regions.map(r=>summarize(r.orders,{id:r.id,name:r.name},filter));
 for(const r of rows){
  const original=lastScan.regions.find(x=>x.id===r.id);
  const reference=original?.orders||[];
  for(const o of [r.ask,r.bid])if(o){
   const source=reference.find(x=>x.orderId===o.orderId);
   if(source){o.systemName=source.systemName;o.stationName=source.stationName;}
  }
 }
 const sorted=rows.filter(r=>r.ask||r.bid);
 const cheapest=advertisedBest(sorted,'ask'),highest=advertisedBest(sorted,'bid');
 $('marketItemHeadline').textContent=lastScan.item.name+' · TYPE '+lastScan.item.id+
  ' · '+fmt(lastScan.item.volume,3)+' m³/unit · '+pretty(quantity)+' units requested';
 $('marketBestBuy').textContent=cheapest?isk(cheapest.ask.price)+' ISK':'NO PUBLIC SELL ORDERS';
 $('marketBestBuyLocation').textContent=cheapest?cheapest.name+' · '+pretty(cheapest.ask.volumeRemain)+
  ' units · '+orderLocation(cheapest.ask):'No advertised ask found';
 $('marketBestSell').textContent=highest?isk(highest.bid.price)+' ISK':'NO PUBLIC BUY ORDERS';
 $('marketBestSellLocation').textContent=highest?highest.name+' · '+pretty(highest.bid.volumeRemain)+
  ' units · min '+pretty(highest.bid.minVolume)+' · '+Accuracy.rangeLabel(highest.bid.range)+
  ' · '+orderLocation(highest.bid)+(highest.bid.isStructure?' · STRUCTURE ACCESS UNVERIFIED':''):'No advertised bid found';
 $('marketExplorerCharts').innerHTML='<div class="market-chart-column"><h4>LOWEST ASK · WHERE TO BUY · LONGEST BAR = BEST</h4>'+
  barRows(sorted,'buy')+'</div><div class="market-chart-column"><h4>HIGHEST BID · WHERE TO SELL · LONGEST BAR = BEST</h4>'+
  barRows(sorted,'sell')+'</div>';
 renderRegionalTable(rows);
 renderLocalComparison(rows,cheapest,highest);
 renderQuantity(rows,quantity,filter);
 renderAudit();
 notice('marketExplorerStatus','Checked '+lastScan.regions.length+'/'+lastScan.total+
  ' public ESI regions · '+lastScan.pages+' market-order pages · '+allOrders().length.toLocaleString()+
  ' validated order records · '+lastScan.failed+' failed/unavailable regions · ESI snapshot '+new Date(lastScan.stamp).toLocaleString()+
  ' · '+(filter==='npc'?'NPC-ONLY FILTER':'ALL PUBLIC (STRUCTURES FLAGGED)')+
  '. Failed regions are not treated as empty markets.');
}
async function explore(){
 const button=$('marketExplorerGo');if(button.disabled)return;
 button.disabled=true;const token=++scanCount;
 $('marketExplorerCharts').innerHTML='';$('marketExplorerTable').innerHTML='';
 $('marketBestBuy').textContent='—';$('marketBestSell').textContent='—';
 $('marketItemHeadline').textContent='Reading ESI order books…';
 try{
  getInputs();
  const [item,all,local]=await Promise.all([
   itemFromSearch($('marketItemSearch').value),regions(),localOperatingContext()
  ]);
  let selected=all;
  if($('marketExplorerScope').value==='hubs')selected=all.filter(x=>HUBS.has(x.id));
  if($('marketExplorerScope').value==='local'){
   if(!local)throw Error('Operating system could not be resolved for the local region.');
   selected=all.filter(x=>x.id===local.regionId);
  }
  if(!selected.length)throw Error('No public known-space market regions were returned for this scope.');
  const delivery=await deliveryFromInputs(local);
  const data=[];let errors=0,done=0,pages=0;
  notice('marketExplorerStatus','Reading ESI order prices, volumes, ranges and locations across '+
   selected.length+' public regions for '+item.name+'…');
  await pool(selected.map(reg=>async()=>({reg,...await fetchCompleteOrders(reg,item.id)})),3,(_,response,error)=>{
   done++;
   if(error||!response)errors++;
   else {data.push({...response.reg,orders:response.orders});pages+=response.pages;}
   if(token===scanCount)notice('marketExplorerStatus','Exact order books '+done+'/'+selected.length+
    ' regions · '+pages+' ESI pages · '+errors+' failed · an incomplete scan is never called global best.');
  });
  if(token!==scanCount)return;
  if(!data.length)throw Error('No public regional order books could be validated; no best prices can be established.');
  data.sort((a,b)=>a.name.localeCompare(b.name));
  lastScan={item,regions:data,failed:errors,total:selected.length,pages,local,delivery,stamp:Date.now()};
  auditPage=0;
  const basic=data.map(x=>summarize(x.orders,x));
  await describeOrders(basic);
  for(const row of basic)for(const order of [row.ask,row.bid])if(order){
   const source=data.find(x=>x.id===row.id)?.orders.find(x=>x.orderId===order.orderId);
   if(source){source.systemName=order.systemName;source.stationName=order.stationName;}
  }
  auditOptions();renderResults();
 }catch(error){
  if(token===scanCount){
   notice('marketExplorerStatus','Market Explorer: '+error.message+' · no invalid or invented order prices displayed.');
   $('marketItemHeadline').textContent='Order verification incomplete';
  }
 }finally{button.disabled=false;}
}
function init(){
 savedCatalog();populateSearch();
 if(catalog.length)notice('marketCatalogSummary',catalog.length.toLocaleString()+
  ' market-listed EVE items cached · '+(Date.now()-catalogFetched>=7*DAY?'refresh recommended':'catalog ready'));
 $('marketCatalogSync').addEventListener('click',()=>loadCatalog(true).catch(()=>{}));
 $('marketCatalogExport').addEventListener('click',exportCatalog);
 $('marketItemSearch').addEventListener('input',populateSearch);
 $('marketExplorerForm').addEventListener('submit',e=>{e.preventDefault();explore();});
}
global.ICMarketExplorer={loadCatalog,catalogItems,resourceItems,compressedFor,catalogState,itemFromSearch,
 regions,summarize,init,explore,familyOf,esi,marketGroupCount:itemCount};
})(window);
