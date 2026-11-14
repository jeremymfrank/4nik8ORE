(function(){
'use strict';
const $=id=>document.getElementById(id), L=window.ICLogic;
const MARKETS={'10000043':'Domain (Amarr)','10000002':'The Forge (Jita)','10000030':'Heimatar (Rens)','10000042':'Metropolis (Hek)','10000032':'Sinq Laison (Dodixie)','10000038':'The Bleak Lands','10000068':'Verge Vendor'};
const MAJOR_MARKET_REGIONS=[10000043,10000002,10000030,10000042,10000032];
const FACTORY_JUPILUXE=Object.freeze({id:'factory-jupiluxe-v1',name:'Jupiluxe',url:'https://music.youtube.com/playlist?list=PLfXw8cc_z-vY&si=Dl5vr0dXqf0enefV',playlistId:'PLfXw8cc_z-vY'});
const CACHE_TTL=300000; const memCache=new Map();
const state={resource:'both',system:null,region:null,hub:'all',results:[],selected:null,lastRun:0,inProgress:false,runId:0,coverage:[],failed:0,routeToken:0,routeEstimates:new Map()};
const ua='4NIK8-Industrial-Command-Preview/0.6.1';

const FACTORY_SHIPS=[
 {id:'retriever',name:'Retriever',hull:'Retriever'},
 {id:'tayra',name:'Tayra',hull:'Tayra'},
 {id:'miasmos',name:'Miasmos',hull:'Miasmos'},
 {id:'kryos',name:'Kryos',hull:'Kryos'},
 {id:'badger',name:'Badger',hull:'Badger'},
 {id:'crane',name:'Crane',hull:'Crane'},
 {id:'mastodon',name:'Mastodon',hull:'Mastodon'},
 {id:'charon',name:'Charon',hull:'Charon'}
];
let shipLibrary=FACTORY_SHIPS.map(s=>({...s,base:{},modules:[]}));
let selectedShips={mining:'retriever',freight:'manual',ore:'manual',trade:'manual'};
const SHIP_SELECTS={mining:'miningShipSelect',freight:'freightShipSelect',ore:'oreShipSelect',trade:'tradeShipSelect'};
const SHIP_BASE_FIELDS={general:'shipGeneral',mining:'shipMining',mineral:'shipMineral',fleet:'shipFleet',mass:'shipMass',inertia:'shipInertia',warp:'shipWarp'};
function chosenShip(role){return shipLibrary.find(s=>s.id===selectedShips[role])||null;}
function shipOptions(role,kind){
 const ship=chosenShip(role),stats=ship&&L.shipStats(ship,kind);
 const manual=Math.max(1,Math.min(1e7,+$('haulCapacity').value||31625));
 return {ship:stats?.capacity&&stats?.align&&stats?.warp?ship:null,capacity:stats?.capacity||manual,cargoKind:kind};
}

const SHIP_CATALOG_KEY='4nik8.ship.catalog.v1';
const SHIP_CATALOG_AGE=7*86400000;
let shipCatalog=[],catalogLoading=false,catalogComplete=false,catalogCacheAt=0,catalogGroupCount=0,catalogMissingNames=0;
function validCatalogEntry(x){
 return Number.isInteger(+x?.id)&&+x.id>0&&+x.id<1e9&&
  typeof x.name==='string'&&x.name.length>0&&x.name.length<=100&&
  typeof x.group==='string'&&x.group.length>0&&x.group.length<=100;
}
// Keep the last successful result available even after it expires: offline users
// can still choose ships, while a background ESI refresh attempts to update them.
function loadCachedShipCatalog(){
 try{
  const cache=JSON.parse(localStorage.getItem(SHIP_CATALOG_KEY)||'null');
  if(![1,2].includes(cache?.version)||!Number.isFinite(+cache.at)||
   !Array.isArray(cache.ships)||cache.ships.length<10||cache.ships.length>10000||
   !cache.ships.every(validCatalogEntry))return false;
  shipCatalog=cache.ships;
  catalogComplete=true;catalogCacheAt=+cache.at;
  catalogGroupCount=+cache.groups||0;catalogMissingNames=+cache.missingNames||0;
  return Date.now()-catalogCacheAt>=0&&Date.now()-catalogCacheAt<SHIP_CATALOG_AGE;
 }catch(_){return false;}
}
function catalogStatus(value){$('shipCatalogStatus').textContent=value;}
function catalogMatches(){
 const query=$('shipCatalogSearch').value.trim().toLowerCase();
 return shipCatalog.filter(s=>!query||s.name.toLowerCase().includes(query)||s.group.toLowerCase().includes(query));
}
function refreshCatalogMatches(){
 const matches=catalogMatches(),box=$('shipCatalogResults'),current=box.value;
 box.innerHTML=matches.slice(0,80).map(s=>'<option value="'+s.id+'">'+L.escape(s.name)+' · '+L.escape(s.group)+'</option>').join('');
 box.disabled=!matches.length;
 if(matches.some(s=>String(s.id)===current))box.value=current;
 $('shipCatalogAdd').disabled=!matches.length||catalogLoading;
 $('shipCatalogExport').disabled=!shipCatalog.length||catalogLoading;
 const suffix=matches.length>80?' · first 80 shown (refine search)':'';
 if(shipCatalog.length)catalogStatus(shipCatalog.length.toLocaleString()+
  ' hull IDs indexed'+(catalogGroupCount?' · '+catalogGroupCount+' ship groups':'')+
  (catalogMissingNames?' · '+catalogMissingNames+' names unavailable':'')+
  (catalogComplete?(Date.now()-catalogCacheAt>SHIP_CATALOG_AGE?' · stale offline copy':' · cached locally'):' · partial catalog')+
  ' · '+matches.length+' matching'+suffix);
}
// ESI may reject a large name batch containing a single deleted/unpublished ID.
// Divide only on an actual 400/404; never recursively retry a network outage.
async function resolveShipNameBatch(ids){
 try{
  const names=await request('/universe/names/',{method:'POST',body:JSON.stringify(ids)},86400000);
  if(!Array.isArray(names))throw Error('ESI returned an invalid ship-name payload');
  return names;
 }catch(error){
  if(!/\bESI (400|404)\b/.test(String(error.message)))throw error;
  if(ids.length===1)return [];
  const middle=Math.floor(ids.length/2);
  const [first,second]=await Promise.all([
   resolveShipNameBatch(ids.slice(0,middle)),
   resolveShipNameBatch(ids.slice(middle))
  ]);
  return first.concat(second);
 }
}
function catalogCsv(){
 const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
 const rows=[['type_id','hull_name','ship_group'],...shipCatalog.map(s=>[s.id,s.name,s.group])];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
function exportShipCatalog(){
 if(!shipCatalog.length)return;
 const blob=new Blob([catalogCsv()],{type:'text/csv;charset=utf-8'});
 const address=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=address;a.download='4nik8-eve-ship-catalog-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(address),1200);
 catalogStatus('Exported '+shipCatalog.length.toLocaleString()+' ship-category IDs to CSV; names unavailable for '+
  catalogMissingNames+' IDs. All entries came from the last retrieved ESI category data.');
}
async function fetchShipCatalog(){
 if(catalogLoading)return;
 catalogLoading=true;
 $('shipCatalogLoad').disabled=true;$('shipCatalogAdd').disabled=true;
 $('shipCatalogExport').disabled=true;
 let failures=0,finalMessage='';
 try{
  catalogStatus('Loading the complete EVE ship-category group list from CCP ESI…');
  const category=await request('/universe/categories/6/',{},86400000,true);
  if(category?.category_id!==6||!Array.isArray(category.groups)||
   category.groups.length<1||category.groups.length>500)throw Error('Unexpected ESI Ship category response');
  const groups=[];
  let done=0;
  await pool(category.groups.map(id=>async()=>request('/universe/groups/'+id+'/',{},86400000)),5,(_,result,error)=>{
   done++;if(error||!result||result.category_id!==6||!Array.isArray(result.types))failures++;
   else if(result.published!==false)groups.push(result);
   catalogStatus('Loading ship groups '+done+'/'+category.groups.length+(failures?' · '+failures+' failed':''));
  });
  const ids=new Map();
  for(const group of groups)for(const id of group.types)
   if(Number.isInteger(+id)&&+id>0&&!ids.has(+id))ids.set(+id,group.name||'Ship');
  const numbers=[...ids.keys()];
  if(!numbers.length)throw Error('No ship types returned by ESI');
  const chunks=[];for(let i=0;i<numbers.length;i+=400)chunks.push(numbers.slice(i,i+400));
  const matched=new Map();
  done=0;
  await pool(chunks.map(group=>async()=>resolveShipNameBatch(group)),3,(_,result,error)=>{
   done++;
   if(error||!Array.isArray(result))failures++;
   else for(const row of result){
    if(!ids.has(+row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100)continue;
    matched.set(+row.id,{id:+row.id,name:row.name.trim(),group:String(ids.get(+row.id)).slice(0,100)});
   }
   catalogStatus('Resolving ship names '+done+'/'+chunks.length+(failures?' · '+failures+' failed':''));
  });
  // Every category type ID is retained; unpublished/unresolvable IDs get a
  // conspicuous placeholder rather than silently disappearing from the export.
  const catalog=numbers.map(id=>matched.get(id)||{id,name:'UNRESOLVED TYPE #'+id,group:String(ids.get(id)).slice(0,100)})
   .sort((a,b)=>a.name.localeCompare(b.name));
  const missingNames=numbers.length-matched.size;
  if(!catalog.length)throw Error('No ship types could be indexed');
  if(failures===0){
   shipCatalog=catalog;catalogComplete=true;catalogCacheAt=Date.now();
   catalogGroupCount=groups.length;catalogMissingNames=missingNames;
   try{localStorage.setItem(SHIP_CATALOG_KEY,JSON.stringify({
    version:2,at:catalogCacheAt,groups:groups.length,missingNames,ships:catalog
   }));}catch(_){}
  }else if(!shipCatalog.length){
   shipCatalog=catalog;catalogComplete=false;catalogMissingNames=missingNames;
   catalogGroupCount=groups.length;
  }
  shipMenus();refreshCatalogMatches();
  if(failures)finalMessage='Catalog refresh incomplete: '+failures+' ESI requests failed. Last complete cache retained when available. Retry when online.';
  else if(missingNames)finalMessage=shipCatalog.length+' ship-category IDs retrieved across '+groups.length+
   ' groups; '+missingNames+' unpublished or unresolved names are labeled by type ID.';
 }catch(error){finalMessage='EVE ship catalog could not be retrieved: '+error.message+
  '. Cached hulls remain available; enter an EVE hull name manually if necessary.';}
 finally{
  catalogLoading=false;$('shipCatalogLoad').disabled=false;refreshCatalogMatches();
  if(finalMessage)catalogStatus(finalMessage);
 }
}
async function addShipFromCatalog(id){
 const entry=shipCatalog.find(s=>s.id===+id);
 if(!entry)throw Error('Choose a catalog ship first');
 let ship=shipLibrary.find(p=>p.typeId===entry.id||p.hull.toLowerCase()===entry.name.toLowerCase());
 if(!ship){
  if(shipLibrary.length>=128)throw Error('Saved fitting library has reached 128 profiles');
  ship={id:'hull-'+entry.id,name:entry.name,hull:entry.name,typeId:entry.id,base:{},modules:[]};
  await fetchHull(ship);
  shipLibrary.push(ship);
 }else if(!ship.base?.warp){
  ship.typeId=entry.id;await fetchHull(ship);
 }
 shipMenus();
 $('shipLibrarySelect').value=ship.id;showShipEditor();settingsManager.schedule();
 shipMessage('Ready: '+ship.hull+'. Default profile uses the hull name; custom fit names are optional.');
 return ship;
}
function shipCatalogInit(){
 const fresh=loadCachedShipCatalog();
 shipMenus();refreshCatalogMatches();
 $('shipCatalogSearch').addEventListener('input',refreshCatalogMatches);
 $('shipCatalogLoad').addEventListener('click',fetchShipCatalog);
 $('shipCatalogExport').addEventListener('click',exportShipCatalog);
 $('shipCatalogAdd').addEventListener('click',async()=>{
  const btn=$('shipCatalogAdd');btn.disabled=true;
  try{await addShipFromCatalog($('shipCatalogResults').value);}
  catch(e){shipMessage('Could not add ship · '+e.message);}
  finally{refreshCatalogMatches();}
 });
 return fresh?Promise.resolve():fetchShipCatalog(); // Nonblocking when called during UI startup.
}
function shipMenus(){
 const saved='<optgroup label="Saved ship profiles">'+shipLibrary.map(s=>'<option value="'+L.escape(s.id)+'">'+L.escape(s.name)+' · '+L.escape(s.hull)+'</option>').join('')+'</optgroup>';
 const addable=shipCatalog.filter(s=>!shipLibrary.some(p=>p.typeId===s.id||p.hull.toLowerCase()===s.name.toLowerCase()));
 const all=addable.length?'<optgroup label="EVE ship catalog · select to add">'+addable.map(s=>'<option value="catalog:'+s.id+'">'+L.escape(s.name)+' · '+L.escape(s.group)+'</option>').join('')+'</optgroup>':'';
 const options='<option value="manual">MANUAL / LEGACY</option>'+saved+all;
 for(const [role,id] of Object.entries(SHIP_SELECTS)){
  $(id).innerHTML=options;$(id).value=shipLibrary.some(s=>s.id===selectedShips[role])?selectedShips[role]:'manual';
  selectedShips[role]=$(id).value;
 }
 const editor=$('shipLibrarySelect'),v=editor.value;
 editor.innerHTML=shipLibrary.map(s=>'<option value="'+L.escape(s.id)+'">'+L.escape(s.name)+' · '+L.escape(s.hull)+'</option>').join('');
 editor.value=shipLibrary.some(s=>s.id===v)?v:shipLibrary[0]?.id||'';
 shipReadouts();
}
function shipReadouts(){
 for(const role of Object.keys(SHIP_SELECTS)){
  const p=chosenShip(role),stats=p&&L.shipStats(p,role==='trade'?'general':'ore');
  $(role+'ShipReadout').textContent=p?(stats?.capacity?L.formatIsk(stats.capacity,1)+' m³':'HOLD UNCONFIGURED')+
   ' · '+(stats?.align?L.formatIsk(stats.align,1)+'s align':'ALIGN UNCONFIGURED')+
   ' · '+(stats?.warp?L.formatIsk(stats.warp,2)+' AU/s':'WARP UNCONFIGURED'):
   'Manual capacity / minutes per jump';
 }
 $('haulCapacity').readOnly=!!L.shipStats(chosenShip('freight'),'ore')?.capacity;
}
function showShipEditor(){
 const p=shipLibrary.find(s=>s.id===$('shipLibrarySelect').value);
 if(!p)return;
 $('shipName').value=p.name;$('shipHull').value=p.hull;
 for(const [key,id] of Object.entries(SHIP_BASE_FIELDS))$(id).value=p.base?.[key]||0;
 $('shipCargoSkill').value=p.cargoSkillPct||0;$('shipHoldSkill').value=p.specialHoldSkillPct||0;
 $('shipExactCapacity').value=p.exactCapacity||'';$('shipExactKind').value=p.exactCapacityKind||'general';$('shipExactAlign').value=p.exactAlign||'';$('shipExactWarp').value=p.exactWarp||'';
 $('shipModules').value=(p.modules||[]).join('\n');$('shipEft').value='';
}
function shipMessage(message){$('shipLibraryStatus').textContent=message;}
async function fetchHull(p,updateEditor=false){
 let id=Number(p.typeId)||0;
 if(!id){
  const ids=await resolveNames([p.hull]);
  const t=(ids.inventory_types||[]).find(x=>x.name.toLowerCase()===p.hull.toLowerCase());
  if(!t)throw Error('Unknown EVE ship hull '+p.hull);
  id=t.id;
 }
 const detail=await request('/universe/types/'+id+'/',{},86400000);
 if(detail.published===false)throw Error('This EVE hull is not published for pilots');
 if(detail.group_id){
  const group=await request('/universe/groups/'+detail.group_id+'/',{},86400000);
  if(group.category_id!==6)throw Error('Selected item is not an EVE ship hull');
 }
 const base=L.shipHullFromESI(detail);
 if(!(base.mass>0&&base.inertia>0&&base.warp>0))throw Error('Incomplete ESI ship attributes; enter fitted stats manually');
 p.base=base;p.typeId=id;
 if(typeof detail.name==='string'&&detail.name.trim())p.hull=detail.name.trim();
 if(updateEditor)for(const [key,field] of Object.entries(SHIP_BASE_FIELDS))$(field).value=base[key]||0;
 shipReadouts();settingsManager.schedule();
}
function validShip(p){
 const keys=['general','mining','mineral','fleet','mass','inertia','warp','maxSpeed'];
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||!p.name||p.name.length>64||!p.hull||p.hull.length>64)return false;
 if(p.modules.length>30||p.modules.some(x=>!L.fitEffects[x]))return false;
 if(p.exactCapacityKind&&!['general','mining','mineral'].includes(p.exactCapacityKind))return false;
 if(keys.some(k=>!Number.isFinite(+(p.base[k]||0))||+(p.base[k]||0)<0||+(p.base[k]||0)>1e11))return false;
 return ['cargoSkillPct','specialHoldSkillPct','exactCapacity','exactAlign','exactWarp'].every(k=>Number.isFinite(+p[k])&&+p[k]>=((k.includes('Skill'))?-90:0)&&+p[k]<=1e9);
}
function shipInit(){
 shipMenus();showShipEditor();shipCatalogInit();
 $('shipLibrarySelect').addEventListener('change',showShipEditor);
 for(const role of Object.keys(SHIP_SELECTS))$(SHIP_SELECTS[role]).addEventListener('change',async()=>{
  const select=$(SHIP_SELECTS[role]);
  if(role==='mining'&&miningSession){select.value=selectedShips.mining;shipMessage('Finish or cancel the active mining calibration before switching miners.');return;}
  const chosen=select.value;
  if(chosen.startsWith('catalog:')){
   select.disabled=true;
   try{const profile=await addShipFromCatalog(Number(chosen.slice(8)));select.value=profile.id;}
   catch(err){shipMessage('Ship selection failed · '+err.message);select.value=selectedShips[role];return;}
   finally{select.disabled=false;}
  }
  if(role==='mining')rememberMiningCalibration();
  selectedShips[role]=select.value;
  if(role==='mining')restoreMiningCalibration();
  shipReadouts();settingsManager.schedule();
  const p=chosenShip(role);
  if(p&&!p.base?.warp)fetchHull(p).then(()=>{
    if(state.results.length){repriceFreight();drawRows();const focused=state.results.find(x=>x.name===state.selected);if(focused)selectItem(focused.name);}
   }).catch(err=>shipMessage('Ship hull attributes unavailable · '+err.message));
  if(role==='freight'&&state.results.length){repriceFreight();drawRows();const item=state.results.find(x=>x.name===state.selected);if(item)selectItem(item.name);}
  if(role==='ore'||role==='mining')miningRefresh();
  if(role==='trade'){
   tradeScanned=[];$('tradeResults').innerHTML='<p class="muted">Ship changed. Rescan trade runs to recalculate cargo quantities and trip times.</p>';
   tradeStatus('Trade ship changed; rescan needed');
  }
 });
 $('shipNew').addEventListener('click',()=>{
  $('shipLibrarySelect').value='';$('shipName').value='';$('shipHull').value='';
  for(const id of Object.values(SHIP_BASE_FIELDS))$(id).value=0;
  for(const id of ['shipCargoSkill','shipHoldSkill','shipExactCapacity','shipExactAlign','shipExactWarp','shipModules','shipEft'])$(id).value='';$('shipExactKind').value='general';
  shipMessage('New fit: fill fields or import EFT, then save.');
 });
 $('shipSave').addEventListener('click',()=>{
  const current=shipLibrary.find(s=>s.id===$('shipLibrarySelect').value);
  const rawMods=$('shipModules').value.split(/\r?\n/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const modules=rawMods.map(x=>Object.keys(L.fitEffects).find(k=>x===k||x.endsWith(' '+k))||x);
  const p={id:current?.id||'fit-'+Date.now().toString(36),name:$('shipName').value.trim(),hull:$('shipHull').value.trim(),
   base:Object.fromEntries(Object.entries(SHIP_BASE_FIELDS).map(([key,id])=>[key,+$(id).value||0])),
   cargoSkillPct:+$('shipCargoSkill').value||0,specialHoldSkillPct:+$('shipHoldSkill').value||0,
   exactCapacity:+$('shipExactCapacity').value||0,exactCapacityKind:$('shipExactKind').value,exactAlign:+$('shipExactAlign').value||0,
   exactWarp:+$('shipExactWarp').value||0,modules};
  if(current&&current.hull!==p.hull){shipMessage('Existing profiles retain their hull. Use NEW SHIP or the catalog to create a different hull.');return;}
  if(!validShip(p)){shipMessage('Invalid data or unsupported modifier. Use recognized EVE module/rig names.');return;}
  if(!current&&shipLibrary.length>=128){shipMessage('Ship library is limited to 128 saved fits.');return;}
  if(current){if(current.hull===p.hull&&current.typeId)p.typeId=current.typeId;Object.assign(current,p);}
  else shipLibrary.push(p);
  shipMenus();$('shipLibrarySelect').value=p.id;showShipEditor();settingsManager.schedule();
  shipMessage('Saved '+p.name+'. Manual fitted overrides include pilot skills and unsupported bonuses.');
  if(!p.base.warp)fetchHull(shipLibrary.find(x=>x.id===p.id),true).catch(e=>shipMessage('Saved; ESI lookup unavailable · '+e.message));
  if(state.results.length){repriceFreight();drawRows();const focused=state.results.find(x=>x.name===state.selected);if(focused)selectItem(focused.name);else miningRefresh();}
  if(selectedShips.trade===p.id&&tradeScanned.length){tradeScanned=[];$('tradeResults').innerHTML='<p class="muted">Trading fit changed. Rescan to recalculate order quantities, transport time and profitability.</p>';tradeStatus('Trading fit updated · rescan trade runs');}
 });
 $('shipDelete').addEventListener('click',()=>{
  const id=$('shipLibrarySelect').value,p=shipLibrary.find(s=>s.id===id);if(!p)return;
  shipLibrary=shipLibrary.filter(s=>s.id!==id);
  for(const role of Object.keys(selectedShips))if(selectedShips[role]===id)selectedShips[role]='manual';
  shipMenus();showShipEditor();settingsManager.schedule();shipMessage('Deleted '+p.name+'.');
 });
 $('shipImport').addEventListener('click',()=>{
  try{const fit=L.parseEftFit($('shipEft').value);
   $('shipLibrarySelect').value=''; // imported fittings create a new profile, never overwrite the factory hull
   for(const id of Object.values(SHIP_BASE_FIELDS))$(id).value=0;
   for(const id of ['shipCargoSkill','shipHoldSkill','shipExactCapacity','shipExactAlign','shipExactWarp'])$(id).value='';
   $('shipExactKind').value='general';
   $('shipName').value=fit.name;$('shipHull').value=fit.hull;$('shipModules').value=fit.modules.join('\n');
   shipMessage('EFT recognized '+fit.modules.length+' modifiers.'+(fit.unrecognized.length?' Unsupported: '+fit.unrecognized.slice(0,3).join(', '):'')+' Fetch ESI hull, verify fittings/skills, then SAVE.');
  }catch(e){shipMessage('EFT import: '+e.message);}
 });
 $('shipFetch').addEventListener('click',async()=>{
  const hull=$('shipHull').value.trim();if(!hull){shipMessage('Enter hull name first.');return;}
  shipMessage('Fetching '+hull+' base attributes from ESI…');
  try{await fetchHull({hull,base:{}},true);shipMessage('Base attributes loaded. SAVE PROFILE to retain them.');}
  catch(e){shipMessage('ESI hull data unavailable · '+e.message);}
 });
}

const esi='https://esi.evetech.net';
const COMPAT_DATE='2025-12-16';
function url(path){return esi+path.replace(/\/(?=\?|$)/,'')+(path.includes('?')?'&':'?')+'datasource=tranquility';}
function setStatus(status,detail){$('connectionBadge').className='conn-status '+status;$('connectionBadge').querySelector('span:last-child').textContent=detail;}
function message(t){$('locationSummary').textContent=t;}
function bestPriceDisplay(n){return L.formatIsk(n,1);}
async function request(path,opts={},ttl=CACHE_TTL,force=false){
 const k=(opts.method||'GET')+'|'+path+'|'+(opts.body||''); const cached=memCache.get(k);
 if((!force || path.startsWith('/markets/'))&&cached&&Date.now()-cached.at<ttl)return cached.value;
 const ctrl=new AbortController(), timeout=setTimeout(()=>ctrl.abort(),path.startsWith('/route/')?11000:18000);
 try{
  const r=await fetch(url(path),{method:opts.method||'GET',body:opts.body,headers:{'X-Compatibility-Date':COMPAT_DATE,'Accept':'application/json',...(opts.body?{'Content-Type':'application/json'}:{})},signal:ctrl.signal});
  if(!r.ok)throw Error('ESI '+r.status+' '+(r.status===405?'route method/compatibility mismatch':r.statusText));
  const value=await r.json();memCache.set(k,{value,at:Date.now()});return value;
 }finally{clearTimeout(timeout);}
}
async function resolveNames(names,force){return request('/universe/ids/',{method:'POST',body:JSON.stringify([...new Set(names)])},3600000,force);}
async function findSystem(name,force){
 const ids=await resolveNames([name],force), found=(ids.systems||[]).find(x=>x.name.toLowerCase()===name.toLowerCase());
 if(!found)throw Error('Unknown system: '+name+'. Enter an exact EVE solar system name.');
 const sys=await request('/universe/systems/'+found.id+'/',{},3600000,force);
 const constellation=await request('/universe/constellations/'+sys.constellation_id+'/',{},3600000,force);
 const region=await request('/universe/regions/'+constellation.region_id+'/',{},3600000,force);
 return {id:found.id,name:sys.name||name,security:sys.security_status,regionId:constellation.region_id,regionName:region.name};
}
async function loadResources(resource,force){
 return window.ICResourceBrowser.loadResources(resource,force);
}
async function pool(work,limit,onComplete){
 let cursor=0;const workers=Array.from({length:Math.min(limit,work.length)},async()=>{
   while(cursor<work.length){const idx=cursor++;let res=null,error=null;
    try{res=await work[idx]();}catch(e){error=e;}
    onComplete(idx,res,error);
    await new Promise(r=>setTimeout(r,110));
   }
 });await Promise.all(workers);
}
function scanRegions(regionId,coverage){
 const localMarket=regionId>=10000000 && regionId<11000000 ? [regionId] : [];
 return [...new Set(coverage==='local'?localMarket:[...localMarket,...MAJOR_MARKET_REGIONS])];
}
function buildTasks(types,regions,force){
 const jobs=[];
 for(const t of types){if(!t.id||!t.volume)continue;
  for(const form of ['raw','compressed']){
   const typeId=form==='raw'?t.id:t.compressedId;if(!typeId)continue;
   for(const region of regions){
    jobs.push({name:t.name,form,region,typeId,job:()=>window.ICMarketExplorer.getOrders(region,typeId,'buy')});
   }
  }
 }
 return jobs;
}
function assembleRows(types,payload,regions){
 const volume=Math.max(1,+$('cargoVolume').value||31625),result=[];
 for(const item of types){
  if(item.error){result.push({...item,error:item.error});continue;}
  const units=Math.max(1,Math.floor(volume/item.volume)),variants=[];
  for(const form of ['raw','compressed'])for(const reg of regions){
   const key=item.name+'|'+form+'|'+reg,orders=payload.get(key);
   if(!orders)continue;
   const quotes=L.rankStationQuotesAll(orders,units,item.volume);
   // Compare the best *station*, not a synthetic region-wide buyer.
   for(const quote of quotes.slice(0,3))variants.push({form,region:reg,quote,physicalUnitM3:form==='compressed'?item.compressedVolume:item.volume});
  }
  const winner=L.bestOpportunity(variants);
  const alternatives=variants.sort((a,b)=>Number(b.quote.full)-Number(a.quote.full)||b.quote.gross-a.quote.gross);
  result.push({...item,units,volume:units*item.volume,winner,variants:alternatives});
 }
 result.sort((a,b)=>Number(!!b.winner)-Number(!!a.winner)||(Number(b.winner?.quote.full||false)-Number(a.winner?.quote.full||false))||(b.winner?.quote.perM3||0)-(a.winner?.quote.perM3||0));
 return result;
}

// Mining profile data belongs to the user, not ESI. Published ESI market prices
// can be combined with a measured rate, but ESI has no live laser-cycle feed.
let miningObserved={ore:null,ice:null};
let miningSession=null;
const mineField=(id)=>{const v=$(id).value.trim();return v===''?null:Number(v);};
function miningSnapshot(){
 return {profileName:$('miningProfileName').value.trim().slice(0,56)||'Retriever',
  oreYield:mineField('miningOreYield'),oreCycle:mineField('miningOreCycle'),oreModules:mineField('miningOreModules'),
  iceUnits:mineField('miningIceUnits'),iceCycle:mineField('miningIceCycle'),iceModules:mineField('miningIceModules'),
  uptimePct:mineField('miningUptime'),handlingMinutes:mineField('miningHandling'),returnHome:$('miningReturn').checked,
  observedOreM3Hour:miningObserved.ore,observedIceM3Hour:miningObserved.ice,
  sort:$('miningSort').value,session:miningSession?{startedAt:miningSession.startedAt,kind:miningSession.kind}:null};
}

const MINING_CAL_FIELDS=[
 ['oreYield','miningOreYield'],['oreCycle','miningOreCycle'],['oreModules','miningOreModules'],
 ['iceUnits','miningIceUnits'],['iceCycle','miningIceCycle'],['iceModules','miningIceModules'],['uptimePct','miningUptime']
];
function rememberMiningCalibration(){
 const ship=chosenShip('mining');if(!ship)return;
 const values={profileName:$('miningProfileName').value.trim().slice(0,56)||ship.name};
 for(const [key,id] of MINING_CAL_FIELDS){const v=$(id).value.trim();values[key]=v===''?null:Number(v);}
 values.observedOreM3Hour=miningObserved.ore;
 values.observedIceM3Hour=miningObserved.ice;
 ship.miningCalibration=values;
}
function restoreMiningCalibration(){
 const ship=chosenShip('mining');if(!ship)return;
 const saved=ship.miningCalibration;
 $('miningProfileName').value=saved?.profileName||ship.name+' / '+ship.hull;
 for(const [key,id] of MINING_CAL_FIELDS){
  const def=key==='oreModules'||key==='iceModules'?2:key==='uptimePct'?100:'';
  const value=saved?.[key];$(id).value=value===null||value===undefined?def:value;
 }
 miningObserved.ore=Number(saved?.observedOreM3Hour)>0?Number(saved.observedOreM3Hour):null;
 miningObserved.ice=Number(saved?.observedIceM3Hour)>0?Number(saved.observedIceM3Hour):null;
}
function miningKind(item){return item?.kind==='ice'?'ice':item?.kind==='gas'?'gas':'ore';}
function miningMetric(item,v){
 if(!v||!v.estimate||miningKind(item)==='gas')return null;
 const kind=miningKind(item),c=freightInputs(kind,'ore');
 const e=L.freightEstimate(v.quote,v.estimate.jumps,v.physicalUnitM3,item.volume,c);
 return L.miningPerformance(item,{...v,estimate:e},miningSnapshot(),c,kind);
}
function bestHourlyBuyer(item){
 if(!Array.isArray(item?.variants))return null;
 let best=null,highest=-Infinity;
 for(const v of item.variants){const m=miningMetric(item,v);
  if(m&&m.allInIskHour>highest){best=v;highest=m.allInIskHour;}
 }
 return best;
}
function oreProfitEstimate(item,variant){
 if(!variant?.estimate)return null;
 return L.freightEstimate(variant.quote,variant.estimate.jumps,variant.physicalUnitM3,item.volume,freightInputs(miningKind(item)==='gas'?'general':miningKind(item),'ore'));
}
function bestOreBuyer(item){
 if(!Array.isArray(item?.variants))return item?.winner||null;
 let best=null,bestScore=-Infinity;
 for(const v of item.variants){
  const e=oreProfitEstimate(item,v);
  if(!e)continue;
  // Never let a partially covered order win over a fully executable one.
  const score=(v.quote.full?1e20:0)+e.net;
  if(score>bestScore){best=v;bestScore=score;}
 }
 return best||item.winner;
}
function effectiveBuyer(item){return $('miningSort').value==='hour'?(bestHourlyBuyer(item)||bestOreBuyer(item)):bestOreBuyer(item);}

function visibleOpportunities(){
 const a=state.results.slice();
 if($('miningSort').value==='hour')a.sort((x,y)=>{
  const bx=bestHourlyBuyer(x),by=bestHourlyBuyer(y);
  const mx=bx&&miningMetric(x,bx),my=by&&miningMetric(y,by);
  return Number(!!my)-Number(!!mx) || (my?.allInIskHour??0)-(mx?.allInIskHour??0);
 });
 else a.sort((x,y)=>{
  const bx=bestOreBuyer(x),by=bestOreBuyer(y),vx=bx&&oreProfitEstimate(x,bx),vy=by&&oreProfitEstimate(y,by);
  return Number(!!by)-Number(!!bx)||Number(!!by?.quote.full)-Number(!!bx?.quote.full)||
   (vy?.net??by?.quote.gross??0)-(vx?.net??bx?.quote.gross??0);
 });
 return a;
}
function showHours(value){
 if(!Number.isFinite(value)||value<0)return '—';
 const mins=Math.round(value*60);
 return mins>=120? (mins/60).toFixed(1)+' h' : mins+' min';
}
function renderMiningPanel(){
 const out=$('miningMetrics'),item=state.results.find(x=>x.name===state.selected)||visibleOpportunities().find(x=>x.winner);
 if(!item?.winner){out.innerHTML='<p class="muted">Run a live market scan and select a resource. Mining performance is not priced from invented market values.</p>';return;}
 const kind=miningKind(item),best=bestHourlyBuyer(item)||item.winner,m=miningMetric(item,best);
 if(kind==='gas'){out.innerHTML='<p class="muted"><b>'+L.escape(item.name)+'</b> is gas. Public buyer quotes are displayed, but ore and ice yields do not apply to gas harvesting. No gas ISK/hour estimate is claimed.</p>';return;}
 const profile=miningSnapshot(),rate=L.miningRate(profile,kind,item.volume/item.units);
 if(!rate){out.innerHTML='<div class="rate-heading"><b>'+L.escape(item.name)+'</b><span>'+kind.toUpperCase()+' · NOT CALIBRATED</span></div><p class="muted">Enter your fitted '+(kind==='ore'?'strip miner m³/cycle and cycle seconds':'ice harvester units/cycle and cycle seconds')+', or time a real mining session. No imaginary ISK/hour is displayed.</p>';return;}
 if(!m){out.innerHTML='<div class="rate-heading"><b>'+L.escape(item.name)+'</b><span>'+kind.toUpperCase()+' · '+rate.source.toUpperCase()+'</span></div><p class="muted">Production: <b>'+L.formatIsk(rate.m3Hour,1)+' m³/h</b>. All-in earnings require a full-load public buyer order and verified stargate route; wormhole exits and private structure docking are not verified.</p>';return;}
 const flag=best.quote.locationId>=1000000000000?' · STRUCTURE ACCESS UNVERIFIED':'';
 const market=MARKETS[best.region]||('REGION #'+best.region);
 out.innerHTML='<div class="rate-heading"><b>'+L.escape(item.name)+' · '+L.escape(market)+'</b><span>'+L.escape(profile.profileName)+' · '+m.source.toUpperCase()+flag+'</span></div>'+
  '<div class="metric-grid"><div class="metric-card"><small>MINING ONLY · ISK/H</small><strong>'+L.formatIsk(m.miningIskHour)+'</strong><span>After sales tax; ignores freight and handling time</span></div>'+
  '<div class="metric-card best"><small>ALL-IN · ISK/H</small><strong>'+L.formatIsk(m.allInIskHour)+'</strong><span>Includes mining, handling and outbound/return hauling time</span></div></div>'+
  '<div class="metric-details"><span>Production: <b>'+L.formatIsk(m.rateM3Hour,1)+' m³/h</b></span><span>Mining: <b>'+showHours(m.miningHours)+'</b></span><span>Hauling: <b>'+showHours(m.travelMinutes/60)+'</b></span><span>Handling: <b>'+showHours(m.handlingMinutes/60)+'</b></span><span>Total: <b>'+showHours(m.timeHours)+'</b></span><span>Net cash (excludes pilot time value): <b>'+L.formatIsk(m.cashNet)+' ISK</b></span></div>';
}
function miningRefresh(){
 if(state.results.length){drawRows();renderMiningPanel();}
 else renderMiningPanel();
}
function miningInit(){
 const fields=['miningProfileName','miningOreYield','miningOreCycle','miningOreModules','miningIceUnits','miningIceCycle','miningIceModules','miningUptime','miningHandling','miningReturn','miningSort'];
 for(const id of fields){$(id).addEventListener('change',()=>{settingsManager.schedule();miningRefresh();});}
 function sessionClock(){
  const el=$('miningSessionClock'),status=$('miningSessionStatus'),toggle=$('miningSessionToggle'),cancel=$('miningSessionCancel');
  if(!miningSession){el.textContent='00:00:00';toggle.textContent='START TIMED SESSION';cancel.disabled=true;$('miningSessionKind').disabled=false;return;}
  const elapsed=Math.max(0,Math.floor((Date.now()-miningSession.startedAt)/1000));
  const pad=n=>String(n).padStart(2,'0');el.textContent=pad(Math.floor(elapsed/3600))+':'+pad(Math.floor(elapsed%3600/60))+':'+pad(elapsed%60);
  toggle.textContent='END & CALIBRATE';cancel.disabled=false;$('miningSessionKind').value=miningSession.kind;$('miningSessionKind').disabled=true;
  status.textContent='Timing '+miningSession.kind.toUpperCase()+' · Enter the mined m³ when finished, then END & CALIBRATE. Wall-clock time includes inactivity and app downtime.';
 }
 $('miningSessionToggle').addEventListener('click',()=>{
  if(!miningSession){miningSession={startedAt:Date.now(),kind:$('miningSessionKind').value};$('miningSessionStatus').textContent='Mining timer started.';}
  else {
   const mined=Number($('miningSessionVolume').value),elapsedMs=Date.now()-miningSession.startedAt;
   if(!(mined>0)||!(elapsedMs>=30000)){$('miningSessionStatus').textContent='Calibration needs a positive mined m³ amount and at least 30 seconds of timed mining.';return;}
   const m3Hour=mined/(elapsedMs/3600000);
   if(!Number.isFinite(m3Hour)||m3Hour<=0||m3Hour>1e9){$('miningSessionStatus').textContent='Mined volume or elapsed time is not valid.';return;}
   const mode=miningSession.kind;miningObserved[mode]=m3Hour;miningSession=null;$('miningSessionVolume').value='';
   $('miningSessionStatus').textContent=mode.toUpperCase()+' measured rate: '+L.formatIsk(m3Hour,1)+' m³/hour. Saved to Windows AppData. This includes actual idle time.';
  }
  sessionClock();settingsManager.schedule();miningRefresh();
 });
 $('miningSessionCancel').addEventListener('click',()=>{miningSession=null;$('miningSessionStatus').textContent='Timed calibration cancelled; saved production rates unchanged.';sessionClock();settingsManager.schedule();});
 $('miningClearMeasured').addEventListener('click',()=>{const kind=$('miningSessionKind').value;miningObserved[kind]=null;$('miningSessionStatus').textContent=kind.toUpperCase()+' measured rate cleared; theoretical module input remains.';settingsManager.schedule();miningRefresh();});
 sessionClock();setInterval(sessionClock,1000);renderMiningPanel();
}

function drawRows(){
 const el=$('opportunities');
 if(!state.results.length){el.innerHTML='<div class="placeholder">No item records available. Check the API status.</div>';return;}
 let ranking=0;
 const displayed=visibleOpportunities();
 el.innerHTML=displayed.map((item,idx)=>{
  if(!item.winner)return `<div class="op-card"><div class="rank">·</div><div class="op-main"><div class="op-name">${L.escape(item.name)}</div><div class="op-sub">${L.escape(item.error||'No executable public buy orders found for this sample load')}</div></div><div class="op-price"><strong>—</strong></div></div>`;
  ranking++;
  const w=effectiveBuyer(item), full=w.quote.full, mark=w.form==='compressed'?'COMPRESSED':'RAW',oreNet=oreProfitEstimate(item,w),v=oreNet?oreNet.net/item.volume:w.quote.perM3;
  const performance=$('miningSort').value==='hour'?miningMetric(item,w):null;
  const metricValue=$('miningSort').value==='hour'?(performance?L.formatIsk(performance.allInIskHour,0):'—'):bestPriceDisplay(v);
  const metricUnit=$('miningSort').value==='hour'?(performance?'ISK/hour · all-in est.':'Yield / route unknown'):(oreNet?'ISK/m³ · est. net':'ISK/m³ · gross (unrouted)');
  return `<div class="op-card ${state.selected===item.name?'selected':''}" data-item="${L.escape(item.name)}" role="button" tabindex="0" aria-label="Inspect ${L.escape(item.name)}"><div class="rank">${ranking}</div><div class="op-main"><div class="op-name">${L.escape(item.name)}</div><div class="op-sub">${mark} · ${L.escape(MARKETS[w.region]||state.system.regionName||'Other region')}${full?' · FULL LOAD':' · PARTIAL '+Math.round(w.quote.coverage*100)+'%'}</div></div><div class="op-price"><strong class="${full?'':'limited'}">${metricValue}</strong><small>${metricUnit}</small></div></div>`;
 }).join('');
 el.querySelectorAll('[data-item]').forEach(node=>{const callback=()=>selectItem(node.dataset.item);node.addEventListener('click',callback);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();callback();}});});
 const hourly=$('miningSort').value==='hour';
 const leader=hourly?displayed.find(x=>bestHourlyBuyer(x)):displayed.find(x=>x.winner);
 const lw=leader?effectiveBuyer(leader):null;
 $('bestName').textContent=leader?.name||(hourly?'Calibrate ship yield':'No visible buy orders');
 $('bestPrice').textContent=leader?(hourly?L.formatIsk(miningMetric(leader,lw).allInIskHour):bestPriceDisplay(oreProfitEstimate(leader,lw)?oreProfitEstimate(leader,lw).net/leader.volume:lw.quote.perM3)):'—';
 $('headlineUnit').textContent=hourly?'ISK / HOUR · ALL-IN EST.':leader&&oreProfitEstimate(leader,lw)?'ISK / mined m³ · EST. NET':'ISK / mined m³ · GROSS';
 $('dataFootnote').textContent=leader?'Order books are live; net estimates subtract user-defined sales tax and freight costs where ESI stargate routes were verified. No PvP risk, compression fees or mining site availability included.':'No executable public buy orders for the selected sample load. Private structure orders are not included.';
}
async function runScan(force=false){
 if(state.inProgress)return;
 const systemName=$('systemInput').value.trim();if(!systemName)return;
 state.inProgress=true;const current=++state.runId;state.results=[];state.selected=null;state.hub=$('hubSelect').value;state.failed=0;state.routeToken++;
 $('scanButton').disabled=true;$('refreshButton').disabled=true;setStatus('','CONNECTING');
 $('notice').textContent='Running a new resource scan. Live ESI public orders only; locations, range and docking access may require verification.';
 $('opportunities').innerHTML='<div class="placeholder"><span class="reticle">◎</span><strong>SEARCHING NEW EDEN</strong><p>Resolving location and resource types through ESI…</p></div>';
 $('bestName').textContent='Scanning orders…';$('bestPrice').textContent='—';
 $('haulDetails').innerHTML='<p class="muted">Market comparison in progress.</p>';
 try{
  const sys=await findSystem(systemName,force);state.system=sys;
  message(`${sys.name} · ${sys.security==null?'Unknown':Number(sys.security).toFixed(2)} security · ${sys.regionName} · ${Number(sys.id)>=31000000&&Number(sys.id)<32000000?'Wormhole system':'Known-space system'}`);
  const resources=await loadResources(state.resource,force);
  const regions=scanRegions(sys.regionId,state.hub);state.coverage=regions;
  if(!regions.length)throw Error('No public regional market is available here. Use ALL PUBLIC HUB REGIONS for wormhole operations.');
  const tasks=buildTasks(resources,regions,force);
  const payload=new Map();let done=0,fail=0;
  $('opportunities').innerHTML='<div class="placeholder"><span class="reticle">◎</span><strong>FETCHING LIVE BUY ORDERS</strong><p id="loadProgress">0 / '+tasks.length+' requests · public markets</p></div>';
  await pool(tasks.map(t=>t.job),5,(idx,data,error)=>{
   const job=tasks[idx];if(!error)payload.set(job.name+'|'+job.form+'|'+job.region,data);
   else fail++;
   done++;const progress=$('loadProgress');if(progress)progress.textContent=done+' / '+tasks.length+' market requests'+(fail?' · '+fail+' failed':'');
  });
  if(current!==state.runId)return;
  if(!payload.size)throw Error('No ESI market queries succeeded. Check network access or retry later.');
  state.failed=fail;state.results=assembleRows(resources,payload,regions);state.lastRun=Date.now();drawRows();
   $('haulDetails').innerHTML='<p class="muted">Calculating stargate routes and estimated freight costs from the same market scan…</p>';
   await evaluateFreight(current);
   if(current!==state.runId)return;
   repriceFreight();drawRows();
   const first=state.results.find(x=>x.winner);if(first)selectItem(first.name);
  setStatus('online',fail?'PARTIAL MARKET DATA':'CROSS-REGION ORDERS LOADED');
  $('dataFootnote').textContent+=' · '+regions.length+' public regions scanned · Retrieved '+new Date(state.lastRun).toLocaleString()+(fail?' · WARNING: '+fail+' market requests failed.':'');
  $('refreshButton').disabled=false;
 }catch(error){
  setStatus('error','ESI UNAVAILABLE');message('Error: '+error.message);
  $('opportunities').innerHTML='<div class="placeholder"><strong>NO VERIFIED DATA</strong><p>'+L.escape(error.message)+'</p><p>No prices will be fabricated.</p></div>';
  $('bestName').textContent='Data unavailable';$('bestPrice').textContent='—';
 }finally{state.inProgress=false;$('scanButton').disabled=false;}
}
// Real buyer demand is from ESI; costs below are explicitly user-supplied estimates.
// Net rankings are only used when a verified stargate route is available.
const routePromises=new Map();
const systemDetails=new Map();
function freightInputs(kind='ore',role='freight'){
 const read=(id,fallback,min,max)=>{const n=Number($(id).value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
 return {...shipOptions(role,kind),taxPct:read('haulTax',7.5,0,100),cashPerJump:read('haulCostJump',0,0,100000000),
  minutesPerJump:read('haulMinutesJump',2,0.1,120),averageAU:read('haulAverageAU',20,.1,250),
  pilotISKHour:read('haulTimeValue',0,0,1000000000),preference:$('haulRoutePref').value};
}
function routeLabel(value){return !value?'ROUTE UNVERIFIED':value.jumps+' JUMPS · '+value.preference.toUpperCase();}
function routeKey(dest){return [state.system?.id,dest,freightInputs().preference].join(':');}
function inWormhole(){return state.system&&state.system.id>=31000000&&state.system.id<32000000;}
async function getRoute(dest){
 if(!state.system||inWormhole()||!Number.isInteger(+dest)||Number(dest)<30000000||Number(dest)>=31000000)throw Error('No verified stargate route for this origin/destination');
 const key=routeKey(dest);
 if(routePromises.has(key))return routePromises.get(key);
 const job=(async()=>{
  if(+dest===+state.system.id)return {jumps:0,preference:freightInputs().preference};
  const result=await request('/route/'+state.system.id+'/'+dest,{method:'POST',body:JSON.stringify({preference:freightInputs().preference,security_penalty:50})},86400000);
  const path=Array.isArray(result?.route)?result.route:Array.isArray(result)?result:null;
  if(!path||!path.length||+path[0]!==+state.system.id||+path[path.length-1]!==+dest)throw Error('Invalid ESI route response');
  return {jumps:path.length-1,preference:freightInputs().preference};
 })();
 routePromises.set(key,job);
 job.catch(()=>{if(routePromises.get(key)===job)routePromises.delete(key);});
 return job;
}
async function buyerStation(loc,systemId){
 const location=+loc;
 if(location>=60000000&&location<64000000){
  try{const data=await request('/universe/stations/'+location+'/',{},86400000);return {name:data.name||'NPC station '+location,systemId:data.system_id||systemId,verified:true};}
  catch(_){return {name:'NPC station #'+location,systemId,verified:false};}
 }
 return {name:'Structure #'+loc+' · docking access unverified',systemId,verified:false};
}
async function systemInfo(id){
 if(systemDetails.has(id))return systemDetails.get(id);
 try {const data=await request('/universe/systems/'+id+'/',{},86400000);systemDetails.set(id,data);return data;}
 catch(_){return {name:'System #'+id};}
}
function candidateList(item){
 const seen=new Set(),result=[];
 // Preserve alternatives from every market region, not only the global highest bids.
 for(const v of item.variants){const key=v.region+'|'+v.form;
  if(seen.has(key))continue;
  seen.add(key);result.push(v);
 }
 // Also include a second station if it materially improves the route economics.
 for(const v of item.variants){if(result.length>=24)break;if(!result.includes(v))result.push(v);}
 return result;
}
function repriceFreight(){
 for(const item of state.results){
  const c=freightInputs(miningKind(item),'freight');
  if(!item.variants)continue;
  for(const v of item.variants){
   const key=routeKey(v.quote.systemId),route=state.routeEstimates?.get(key);
   v.estimate=route&&v.physicalUnitM3?L.freightEstimate(v.quote,route.jumps,v.physicalUnitM3,item.volume,c):null;
  }
  const eligible=item.variants.filter(v=>v.estimate);
  // A quote for the entire shipment wins over an incomplete fill. Never present
  // a partial bid as if it purchased the entire mined load.
  eligible.sort((a,b)=>Number(b.quote.full)-Number(a.quote.full)||(b.estimate.net-a.estimate.net));
  item.winner=eligible[0]||L.bestOpportunity(item.variants);
 }
 state.results.sort((a,b)=>{
  const x=a.winner,y=b.winner;
  const category=v=>!v?0:v.estimate?(v.quote.full?4:2):(v.quote.full?3:1);
  return category(y)-category(x) || (y?.estimate?.net??y?.quote?.gross??0)-(x?.estimate?.net??x?.quote?.gross??0);
 });
}
async function evaluateFreight(run){
 if(inWormhole())return;
 state.routeEstimates=new Map();
 const counts=new Map();
 for(const item of state.results){
  if(!item.variants)continue;
  for(const v of candidateList(item)){
   const dest=v.quote.systemId;
   if(!dest)continue;
   counts.set(dest,(counts.get(dest)||0)+1);
  }
 }
 // Prioritize commonly quoted destination systems; one route serves many
 // resources and buying stations. Cap the network work for one scan.
 const systems=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,28).map(x=>+x[0]);
 const status=$('dataFootnote');
 await pool(systems.map(dest=>async()=>({dest,key:routeKey(dest),route:await getRoute(dest)})),4,(i,data,error)=>{
  if(run!==state.runId)return;
  if(!error&&data){state.routeEstimates.set(data.key,data.route);}
  status.textContent='Market orders loaded · calculating safer freight routes '+state.routeEstimates.size+'/'+systems.length+' · no price fabrication';
 });
}
async function runRoutesOnly(){
 if(state.inProgress||!state.results.length||!state.system)return;
 state.inProgress=true;const run=++state.runId;
 $('haulDetails').innerHTML='<p class="muted">Recalculating routes with new preference…</p>';
 try{await evaluateFreight(run);if(run!==state.runId)return;repriceFreight();drawRows();const item=state.results.find(x=>x.name===state.selected)||state.results[0];if(item)selectItem(item.name);}
 finally{state.inProgress=false;}
}
function selectItem(name){
 const item=state.results.find(x=>x.name===name);if(!item?.winner)return;
 state.selected=item.name;drawRows();
 const token=++state.routeToken;
 renderFreight(item,token);
 renderMiningPanel();
}
async function renderFreight(item,token){
 const container=$('haulDetails');
 const c=freightInputs(miningKind(item),'freight'),routeCount=state.routeEstimates?.size||0;
 const variants=candidateList(item);
 const enriched=variants.map(v=>({...v,estimate:v.estimate||null})).sort((a,b)=>{
  const status=v=>v.estimate?(v.quote.full?4:2):(v.quote.full?3:1);
  return status(b)-status(a)||(b.estimate?.net??b.quote.gross)-(a.estimate?.net??a.quote.gross);
 });
 const primary=enriched[0];
 if(!primary){container.innerHTML='<p class="muted">No buyer quotes for this resource.</p>';return;}
 const statusText=primary.estimate?('EST. NET '+L.formatIsk(primary.estimate.net)+' ISK'):'ROUTE UNVERIFIED';
 const intro=`<div class="freight-summary"><div><span class="smallcaps">SELECTED MINED RESOURCE</span><strong>${L.escape(item.name)}</strong><small>${L.formatIsk(item.volume,1)} mined m³ · ${L.formatIsk(item.units)} units · raw / compressed comparison</small></div><div class="freight-net"><span>${statusText}</span><small>${primary.estimate?'After configured tax and transport allowances':'Only verified routes receive net estimates'}</small></div></div>`;
 const rows=enriched.slice(0,12).map((v,i)=>{
  const q=v.quote,e=v.estimate,reg=MARKETS[v.region]||('Region '+v.region);
  const safe=L.escape;
  const location=`<span class="buyer-station-name" data-station="${q.locationId}">Station #${q.locationId}</span>`;
  const net=e?'<strong class="freight-profit">'+L.formatIsk(e.net)+' ISK</strong>':'<strong class="freight-unknown">ROUTE NOT VERIFIED</strong>';
  return `<div class="freight-destination ${i===0?'best':''}"><div class="freight-destination-top"><div><span class="freight-rank">${i+1}</span><b>${location}</b><span class="freight-region">${safe(reg)} · ${v.form.toUpperCase()}</span></div>${net}</div><div class="freight-destination-bottom"><span>${e?routeLabel({jumps:e.jumps,preference:c.preference}):'Route unavailable'} · ${e?e.trips+' trip'+(e.trips===1?'':'s'):'—'}</span><span>GROSS ${L.formatIsk(q.gross)} ISK · ${q.full?'FULL LOAD':'PARTIAL '+Math.round(q.coverage*100)+'%'}</span></div></div>`;
 }).join('');
 const costs=primary.estimate?`<div class="freight-costs"><div><span>Taxes (${c.taxPct}%)</span><strong>−${L.formatIsk(primary.estimate.salesTax)} ISK</strong></div><div><span>Transport allowance</span><strong>−${L.formatIsk(primary.estimate.haulCashCost)} ISK</strong></div><div><span>Pilot time allowance</span><strong>−${L.formatIsk(primary.estimate.timeCost)} ISK</strong></div><div><span>Est. travel (outbound + returns)</span><strong>${L.formatIsk(primary.estimate.travelMinutes)} min</strong></div><div><span>Transport volume</span><strong>${L.formatIsk(primary.estimate.shippedM3,2)} m³</strong></div></div>`:'';
 container.innerHTML=intro+`<div class="freight-cost-caption">ESTIMATED FREIGHT · ${c.taxPct}% TAX · ${L.formatIsk(c.cashPerJump)} ISK / JUMP · ${L.formatIsk(c.capacity)} m³ HOLD · ${c.ship?'SHIP MODEL · ASSUMED '+c.averageAU+' AU/GATE':'MANUAL MIN/JUMP'} · ${routeCount} KNOWN ROUTES</div><div class="freight-destinations">${rows}</div>`+costs+`<p class="muted tiny freight-disclaimer">Estimates exclude compression fees, losses, docking restrictions, taxes other than configured sales tax and PvP risk. Partial orders cannot buy the whole load. Routes are stargate only. Current mining-site availability is not known from ESI. If routes failed, these destinations are unranked by net value.</p>`;
 // Resolve human-readable NPC station names automatically without changing the price ranking.
 await pool(enriched.slice(0,12).map(v=>async()=>({id:v.quote.locationId,station:await buyerStation(v.quote.locationId,v.quote.systemId)})),4,(_,data)=>{
  if(token!==state.routeToken||!data||!container.isConnected)return;
  container.querySelectorAll('[data-station="'+data.id+'"]').forEach(el=>{el.textContent=data.station.name;});
 });
}
function radioInit(){
 const audio=$('audioPlayer');
 const STORAGE='4nik8.cb.channels.v1', VOLUME_KEY='4nik8.cb.volume.v1', SHUFFLE_KEY='4nik8.cb.shuffle.v1';
 const maxChannels=40;
 let channels=[],editId=null,selectedChannelId=null;
 let source='none',audioIndex=-1,ytPlayer=null,ytReady=false,ytPlaying=false,ytEmbedFailed=false;
 let ytApiPromise=null,ytPlayerPromise=null,trackTitle='',tuneSequence=0;
 let shuffleEnabled=false,shuffleApplied=false;
 let localShuffleBag=[];
 const audioTracks=[];
 const volumeInput=$('radioVolume');
 try{
  const stored=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(Array.isArray(stored))channels=stored.slice(0,maxChannels).filter(c=>{
   if(!c||typeof c.name!=='string'||typeof c.url!=='string')return false;
   try{c.playlistId=L.parseYouTubePlaylistUrl(c.url).playlistId;return true;}catch(_){return false;}
  }).map(c=>({id:String(c.id||''),name:c.name.slice(0,48),url:c.url,playlistId:c.playlistId})).filter(c=>c.id);
 }catch(_){channels=[];}
 try{const v=+localStorage.getItem(VOLUME_KEY);if(Number.isFinite(v)&&v>=0&&v<=100)volumeInput.value=v;}catch(_){}
 audio.volume=+volumeInput.value/100;$('volumeValue').textContent=volumeInput.value;
 try{shuffleEnabled=localStorage.getItem(SHUFFLE_KEY)==='1';}catch(_){}
 function showShuffle(){const b=$('shuffleButton');b.setAttribute('aria-pressed',String(shuffleEnabled));b.title='Shuffle: '+(shuffleEnabled?'on':'off');}
 function applyYouTubeShuffle(){
  if(!ytReady||!ytPlayer||typeof ytPlayer.setShuffle!=='function')return false;
  // YouTube does not retain shuffle across playlist loads. Wait for the queue
  // to exist so the choice applies to the newly loaded channel.
  let queue=[];try{queue=ytPlayer.getPlaylist?.()||[];}catch(_){}
  if(!queue.length)return false;
  try{ytPlayer.setShuffle(shuffleEnabled);shuffleApplied=true;return true;}catch(_){return false;}
 }
 showShuffle();
 $('shuffleButton').addEventListener('click',()=>{
  shuffleEnabled=!shuffleEnabled;localShuffleBag=[];shuffleApplied=false;showShuffle();
  try{localStorage.setItem(SHUFFLE_KEY,shuffleEnabled?'1':'0');}catch(_){}
  settingsManager.schedule();
  if(source==='youtube'){
   if(!applyYouTubeShuffle())status('Shuffle '+(shuffleEnabled?'enabled':'disabled')+'; will apply when the playlist loads.');
   else status('YouTube playlist shuffle '+(shuffleEnabled?'ON':'OFF')+'.');
  }else if(source==='audio')status('Local music shuffle '+(shuffleEnabled?'ON':'OFF')+'.');
  else status('Shuffle '+(shuffleEnabled?'ON':'OFF')+'. Tune a channel to play.');
 });
 function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(channels));settingsManager.schedule();return true;}catch(e){setChannelMessage('Presets could not be saved in browser storage: '+e.message,true);return false;}}
 function setChannelMessage(msg,isError=false){$('channelMessage').textContent=msg;$('channelMessage').classList.toggle('error',isError);}
 function channel(){return channels.find(c=>c.id===selectedChannelId)||null;}
 function channelNumber(id){const i=channels.findIndex(c=>c.id===id);return String(i+1).padStart(2,'0');}
 function renderChannels(){
  $('channelCount').textContent=channels.length+' PRESET'+(channels.length===1?'':'S');
  $('channelList').innerHTML=channels.length?channels.map(c=>{
   const selected=c.id===selectedChannelId;
   const signal=selected?(ytEmbedFailed?'⚠ TUNE FAILED':ytPlaying?'● ON AIR':ytReady?'Ⅱ PAUSED':'◌ TUNING'):'▸ TUNE';
   return `<div class="channel-preset ${selected?'active':''}"><button type="button" class="tune-channel" data-tune="${L.escape(c.id)}" aria-label="Tune channel ${L.escape(c.name)}"><span class="channel-badge">CH ${channelNumber(c.id)}</span><span class="channel-title">${L.escape(c.name)}</span><span class="channel-signal">${signal}</span></button><button type="button" class="channel-edit" data-edit="${L.escape(c.id)}" title="Edit ${L.escape(c.name)}" aria-label="Edit channel ${L.escape(c.name)}">✎</button><button type="button" class="channel-delete" data-delete="${L.escape(c.id)}" title="Delete ${L.escape(c.name)}" aria-label="Delete channel ${L.escape(c.name)}">×</button></div>`;
  }).join(''):'<div class="channel-empty">No channels saved. Paste a shared YouTube Music playlist URL below.</div>';
  $('channelList').querySelectorAll('[data-tune]').forEach(b=>b.addEventListener('click',()=>tuneChannel(b.dataset.tune)));
  $('channelList').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
   const c=channels.find(c=>c.id===b.dataset.edit);if(!c)return;
   editId=c.id;$('channelName').value=c.name;$('channelUrl').value=c.url;
   $('saveChannel').textContent='SAVE CHANNEL CHANGES';$('cancelChannelEdit').hidden=false;
   setChannelMessage('Editing CH '+channelNumber(c.id)+'. Your changes are saved locally.');
   $('channelName').focus();
  }));
  $('channelList').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{
   const c=channels.find(c=>c.id===b.dataset.delete);if(!c)return;
   if(!window.confirm('Delete CB channel "'+c.name+'"?'))return;
   channels=channels.filter(x=>x.id!==c.id);
   if(selectedChannelId===c.id)stopYouTube();
   if(editId===c.id)cancelEdit();
   persist();renderChannels();setChannelMessage('Deleted channel '+c.name+'.');
  }));
 }
 function cancelEdit(){editId=null;$('channelForm').reset();$('saveChannel').textContent='+ SAVE CB CHANNEL';$('cancelChannelEdit').hidden=true;}
 $('newChannel').addEventListener('click',()=>{cancelEdit();setChannelMessage('New channel mode. Paste another shared playlist and save it.');$('channelName').focus();});
 $('cancelChannelEdit').addEventListener('click',()=>{cancelEdit();setChannelMessage('Ready to save another playlist.');});
 $('channelForm').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('channelName').value.trim(),input=$('channelUrl').value.trim();
  if(!name){setChannelMessage('Give this channel a name.',true);return;}
  let parsed;try{parsed=L.parseYouTubePlaylistUrl(input);}catch(err){setChannelMessage(err.message,true);return;}
  if(!editId&&channels.length>=maxChannels){setChannelMessage('Maximum '+maxChannels+' saved channels reached.',true);return;}
  const duplicate=channels.find(c=>c.playlistId===parsed.playlistId&&c.id!==editId);
  if(duplicate){setChannelMessage('That playlist is already saved as CH '+channelNumber(duplicate.id)+' · '+duplicate.name+'. Use TUNE or EDIT.',true);return;}
  const saved={id:editId||String(Date.now())+'-'+Math.random().toString(36).slice(2,10),name:name.slice(0,48),url:parsed.shareUrl||parsed.canonicalUrl,playlistId:parsed.playlistId};
  if(editId){const index=channels.findIndex(c=>c.id===editId);if(index>=0)channels[index]=saved;else channels.push(saved);}else channels.push(saved);
  const wasActive=selectedChannelId===saved.id;
  persist();cancelEdit();renderChannels();
  setChannelMessage('Saved "'+saved.name+'" as CH '+channelNumber(saved.id)+'. Click TUNE to play.');
  if(wasActive)tuneChannel(saved.id);
 });
 function status(s){$('radioStatus').textContent=s;}
 function nowPlaying(){
  const ch=channel();
  if(source==='youtube'&&ch){$('nowPlaying').textContent=ch.name+(trackTitle?' · '+trackTitle:'');$('youtubeChannelNumber').textContent=channelNumber(ch.id);}
  else if(source==='audio'&&audioTracks[audioIndex])$('nowPlaying').textContent=audioTracks[audioIndex].name;
  else $('nowPlaying').textContent='NO SIGNAL · SELECT AUDIO';
  $('playPause').textContent=source==='youtube'?(ytPlaying?'❚❚':'▶'):(source==='audio'&&!audio.paused?'❚❚':'▶');
 }
 function resetYouTubePlayer(){
  ++tuneSequence;
  if(ytPlayer&&typeof ytPlayer.destroy==='function'){try{ytPlayer.destroy();}catch(_){}}
  else if(ytPlayer&&typeof ytPlayer.stopVideo==='function'){try{ytPlayer.stopVideo();}catch(_){}}
  ytPlayer=null;ytReady=false;ytPlaying=false;ytEmbedFailed=false;ytPlayerPromise=null;shuffleApplied=false;
  $('youtubePlayerMount').hidden=false;
  $('youtubePlayerMount').replaceChildren();
 }
 function stopYouTube(){
  resetYouTubePlayer();
  selectedChannelId=null;trackTitle='';$('youtubeShell').hidden=true;
  // Restore the radio controls when the compact visible video is switched off.
  $('radioContent').classList.remove('radio-compact');$('radioContent').hidden=false;
  $('radioCollapse').textContent='▾';$('radioCollapse').setAttribute('aria-expanded','true');
  if(source==='youtube'||source==='youtube-diagnostic')source='none';
  renderChannels();nowPlaying();
 }
 $('stopYouTube').addEventListener('click',()=>{stopYouTube();status('YouTube channel off air.');});
 // Diagnostic uses YouTube's own documented public player sample. It never
 // changes a saved preset, requests account credentials, or bypasses an embed restriction.
 async function testEmbeddedPlayback(){
   audio.pause(); resetYouTubePlayer(); const generation=tuneSequence;
   selectedChannelId=null; source='youtube-diagnostic'; trackTitle='';
   $('radioContent').hidden=false;$('radioContent').classList.remove('radio-compact'); $('radioCollapse').textContent='▾';
   $('radioCollapse').setAttribute('aria-expanded','true');
   $('youtubeShell').hidden=false; $('youtubeChannelNumber').textContent='TEST';
   $('nowPlaying').textContent='EMBED DIAGNOSTIC · OFFICIAL SAMPLE VIDEO';
   $('playPause').textContent='▶'; renderChannels();
   status('Connecting to YouTube sample video. Press Play inside the video to test actual playback.');
   setChannelMessage('Diagnostic only; saved CB channel presets are unchanged.');
   try{
     const YT=await ensureYouTubeApi();
     if(generation!==tuneSequence)return;
     ytPlayer=new YT.Player('youtubePlayerMount',{
       width:'100%',height:'100%',videoId:'M7lc1UVf-VE',
       playerVars:{playsinline:1,controls:1,origin:window.location.origin},
       events:{
         onReady(e){
           if(generation!==tuneSequence||e.target!==ytPlayer)return;
           ytReady=true; ytPlaying=false; e.target.setVolume(+volumeInput.value);
           status('Sample player loaded. Press Play inside the YouTube player to check actual playback.');
         },
         onStateChange(e){
           if(generation!==tuneSequence||e.target!==ytPlayer)return;
           ytPlaying=e.data===YT.PlayerState.PLAYING;
           if(ytPlaying){
             status('TEST PASS: the official sample plays in this browser. Playlist or track embed restrictions may be the problem.');
             setChannelMessage('Sample video plays; your saved channels are unchanged.');
           } else if(e.data===YT.PlayerState.PAUSED)status('Sample paused. Playback previously worked if you heard/saw it.');
           $('playPause').textContent=ytPlaying?'❚❚':'▶';
         },
         onError(e){
           if(generation!==tuneSequence||e.target!==ytPlayer)return;
           ytReady=false;ytPlaying=false;ytEmbedFailed=true;
           status('TEST FAILED: official sample returned YouTube error '+e.data+'. This points toward an embed/browser/YouTube issue, not solely a Jupiluxe song.');
           setChannelMessage('Official YouTube sample returned error '+e.data+'. Report the number; saved CB stations are unchanged.',true);
         },
         onAutoplayBlocked(){
           if(generation===tuneSequence)status('Sample autoplay blocked. Click Play directly in the visible YouTube video.');
         }
       }
     });
   }catch(e){if(generation===tuneSequence){status('Sample test failed to initialize: '+e.message);setChannelMessage('YouTube player could not initialize; no presets were changed.',true);}}
 }
 $('testYouTubeEmbed').addEventListener('click',testEmbeddedPlayback);
 function ensureYouTubeApi(){
  if(window.YT&&window.YT.Player)return Promise.resolve(window.YT);
  if(ytApiPromise)return ytApiPromise;
  ytApiPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   window.onYouTubeIframeAPIReady=()=>resolve(window.YT);
   script.src='https://www.youtube.com/iframe_api';script.async=true;
   script.onerror=()=>reject(Error('Cannot reach YouTube player API. Check your network connection.'));
   document.head.appendChild(script);
  }).catch(e=>{ytApiPromise=null;throw e;});
  return ytApiPromise;
 }
 // YouTube Music share links are not inherently invalid because their IDs are
 // shorter than familiar IDs. Preserve the original shared URL for fallback.
 function errorDescription(code){
  const descriptions={2:'YouTube rejected the embedded playlist request (invalid parameter).',5:'YouTube HTML5 player error.',100:'A video is unavailable or private.',101:'The video owner disabled embedding.',150:'YouTube refused this embedded video (may also indicate a broader player issue).',153:'YouTube rejected the embedded client identity / HTTP referrer.'};
  return descriptions[code]||'YouTube could not play this content.';
 }
 async function tuneChannel(id){
  const requested=channels.find(c=>c.id===id);if(!requested)return;
  if(location.protocol==='file:'){
   setChannelMessage('Launch with START_COMMAND.cmd to use the localhost YouTube player.',true);return;
  }
  audio.pause();resetYouTubePlayer();const generation=tuneSequence;
  source='youtube';selectedChannelId=id;trackTitle='';
  try{localStorage.setItem('4nik8.cb.lastChannel.v1',id);}catch(_){}
  settingsManager.schedule();
  $('radioContent').hidden=false;$('radioContent').classList.remove('radio-compact');$('radioCollapse').textContent='▾';$('radioCollapse').setAttribute('aria-expanded','true');
  $('youtubeShell').hidden=false;renderChannels();nowPlaying();status('Tuning CH '+channelNumber(id)+'…');
  // Play only in the integrated official YouTube player; no external launch fallback.
  try {
   const YT=await ensureYouTubeApi();
   if(generation!==tuneSequence)return;
   let retryUsed=false;
   function createPlayer(mode){
    if(generation!==tuneSequence || selectedChannelId!==id)return;
    if(ytPlayer){try{ytPlayer.destroy();}catch(_){}ytPlayer=null;}
    ytReady=false;ytPlaying=false;shuffleApplied=false;
    $('youtubePlayerMount').replaceChildren();
    const vars={playsinline:1,controls:1,rel:0,origin:window.location.origin};
    // Official alternative: select the playlist through the embed's playerVars
    // rather than requesting it later through loadPlaylist().
    if(mode==='embed'){vars.listType='playlist';vars.list=requested.playlistId;}
    ytPlayer=new YT.Player('youtubePlayerMount',{
     width:'100%',height:'100%',playerVars:vars,
     events:{
      onReady(event){
       if(generation!==tuneSequence || event.target!==ytPlayer)return;
       ytReady=true;
       event.target.setVolume(+volumeInput.value);
       if(mode==='api')event.target.loadPlaylist({list:requested.playlistId,listType:'playlist',index:0});
       status(mode==='embed'?'Trying alternate official YouTube playlist embed…':'Playlist requested. If autoplay is blocked, press Play in the YouTube player.');
      },
      onStateChange(event){
       if(generation!==tuneSequence || event.target!==ytPlayer)return;
       ytPlaying=event.data===YT.PlayerState.PLAYING;
       if(source==='youtube'){
        // setShuffle does not persist across YouTube playlist loads.
        if(!shuffleApplied && (event.data===YT.PlayerState.PLAYING || event.data===5))applyYouTubeShuffle();
        try{trackTitle=event.target.getVideoData()?.title||'';}catch(_){trackTitle='';}
        if(event.data===YT.PlayerState.PLAYING){status('Broadcasting CH '+channelNumber(id)+' from YouTube'+(shuffleEnabled?' · SHUFFLE ON':''));renderChannels();}
        else if(event.data===YT.PlayerState.PAUSED)status('YouTube playback paused');
        else if(event.data===YT.PlayerState.BUFFERING)status('Tuning YouTube stream…');
        else if(event.data===YT.PlayerState.ENDED)status('Playlist ended.');
        nowPlaying();
       }
      },
      onAutoplayBlocked(){
        if(generation===tuneSequence && source==='youtube')status('YouTube blocked automatic playback. Press Play directly in the visible player.');
       },
       onError(event){
       if(generation!==tuneSequence || source!=='youtube'||event.target!==ytPlayer)return;
       // One transparent compatibility attempt. We do not retry forever or
       // claim it fixes YouTube Music's own embed restrictions.
       if(event.data===2 && mode==='api' && !retryUsed){
        retryUsed=true;
        status('YouTube rejected playlist API request. Trying its standard playlist embed once…');
        setChannelMessage('Trying the alternate official YouTube playlist embed for CH '+channelNumber(id)+'.');
        setTimeout(()=>createPlayer('embed'),0);
        return;
       }
       ytEmbedFailed=true;ytPlaying=false;ytReady=false;trackTitle='';
       // YouTube Music playback and YouTube's iframe embedding are separate services.
       // A working share link is not necessarily supported by the embedded player.
       // Do not label a rejected embed as broadcasting or leave a broken black iframe.
       try{ytPlayer?.destroy?.();}catch(_){}
       ytPlayer=null;
       $('youtubePlayerMount').replaceChildren();
       const err=document.createElement('div');err.className='embedded-radio-error';
       err.textContent='CH '+channelNumber(id)+' unavailable in the CB player (YouTube error '+event.data+'). Preset remains saved; try another station.';
       $('youtubePlayerMount').appendChild(err);
       status('YouTube embed error '+event.data+': '+errorDescription(event.data));
       setChannelMessage('CH '+channelNumber(id)+' remains saved. YouTube rejected the embedded request; CB did not start playback.',true);
       renderChannels();nowPlaying();
      }
     }
    });
   }
   createPlayer('api');
  } catch(err){if(generation===tuneSequence)status('Cannot tune YouTube: '+err.message);}
 }
 function nextLocalAudioIndex(){
  if(!shuffleEnabled||audioTracks.length<2)return audioIndex<0?0:(audioIndex+1)%audioTracks.length;
  if(!localShuffleBag.length)localShuffleBag=audioTracks.map((t,i)=>i).filter(i=>i!==audioIndex && t.local);
  if(!localShuffleBag.length)return audioIndex<0?0:(audioIndex+1)%audioTracks.length;
  const at=Math.floor(Math.random()*localShuffleBag.length);return localShuffleBag.splice(at,1)[0];
 }
 function renderLocalPlaylist(){
  $('playlist').innerHTML=audioTracks.map((t,i)=>`<button class="${source==='audio'&&i===audioIndex?'active':''}" data-index="${i}">${L.escape(t.name)}</button>`).join('');
  $('playlist').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>playAudio(+b.dataset.index)));
 }
 async function playAudio(i){
  if(!audioTracks.length)return;
  if(source==='youtube'||source==='youtube-diagnostic')stopYouTube();
  source='audio';audioIndex=(i+audioTracks.length)%audioTracks.length;
  audio.src=audioTracks[audioIndex].url;audio.load();renderLocalPlaylist();nowPlaying();
  try{await audio.play();status('Broadcasting local music / radio to the cab');}catch(e){status('Audio playback blocked or unsupported: '+e.message);}
  nowPlaying();
 }
 $('audioFiles').addEventListener('change',e=>{
  const files=Array.from(e.target.files||[]);
  for(const file of files)audioTracks.push({name:file.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(file),local:true});
   localShuffleBag=[];
  renderLocalPlaylist();if(audioIndex<0&&audioTracks.length)playAudio(0);e.target.value='';
 });
 $('playStream').addEventListener('click',()=>{
  const val=$('streamUrl').value.trim();
  if(!/^https:\/\//i.test(val)){status('Use a direct HTTPS audio stream URL.');return;}
  audioTracks.push({name:'Internet Radio '+(audioTracks.length+1),url:val,local:false});
  renderLocalPlaylist();playAudio(audioTracks.length-1);
 });
 $('playPause').addEventListener('click',async()=>{
  if(source==='youtube'||source==='youtube-diagnostic'){
   if(ytEmbedFailed){status('YouTube rejected this station inside CB ContraBand Radio. Choose another channel.');return;}
   if(!ytReady){status('YouTube is still connecting.');return;}
   try{if(ytPlaying)ytPlayer.pauseVideo();else ytPlayer.playVideo();}catch(e){status(e.message);}
   return;
  }
  if(!audio.src){if(audioTracks.length)playAudio(0);else status('Choose a CB channel, local music file, or HTTPS radio stream.');return;}
  if(audio.paused){try{await audio.play();}catch(e){status(e.message);}}else audio.pause();nowPlaying();
 });
 $('prevTrack').addEventListener('click',()=>{if(source==='youtube'&&ytReady)ytPlayer.previousVideo();else if(audioTracks.length)playAudio(audioIndex<0?0:audioIndex-1);});
 $('nextTrack').addEventListener('click',()=>{if(source==='youtube'&&ytReady)ytPlayer.nextVideo();else if(audioTracks.length)playAudio(nextLocalAudioIndex());});
 audio.addEventListener('ended',()=>{if(source==='audio'&&audioIndex>=0)playAudio(nextLocalAudioIndex());});
 audio.addEventListener('play',()=>{if(source==='audio')nowPlaying();});
 audio.addEventListener('pause',()=>{if(source==='audio')nowPlaying();});
 volumeInput.addEventListener('input',e=>{
  const v=+e.target.value;audio.volume=v/100;$('volumeValue').textContent=v;
  if(ytPlayer&&ytReady)ytPlayer.setVolume(v);
  try{localStorage.setItem(VOLUME_KEY,String(v));}catch(_){}
  settingsManager.schedule();
 });
 $('radioCollapse').addEventListener('click',()=>{
  const content=$('radioContent'),opening=content.hidden||content.classList.contains('radio-compact');
  const videoVisible=(source==='youtube'||source==='youtube-diagnostic')&&!$('youtubeShell').hidden;
  // The official YouTube player must remain visible; never pause, remove or hide
  // its iframe just because the pilot minimized the rest of the radio controls.
  if(!opening){
   if(videoVisible){content.hidden=false;content.classList.add('radio-compact');}
   else content.hidden=true;
  }else{content.hidden=false;content.classList.remove('radio-compact');}
  $('radioCollapse').textContent=opening?'▾':'▴';
  $('radioCollapse').setAttribute('aria-expanded',String(opening));
  $('radioCollapse').title=opening?'Collapse radio':'Expand radio';
 });
 renderChannels();nowPlaying();status('Ready. Tune a saved channel or load local music.');
}
function markResourceSelectionStale(){
 if(!state.results.length)return;
 $('notice').textContent='RESOURCE SETTINGS CHANGED · The Opportunity Board still shows the previous completed scan. Click SCAN MARKETS to update prices for your new selection.';
 $('dataFootnote').textContent='STALE SCAN · Current resource selection differs from the displayed results. This is not a new live market quote.';
}
window.addEventListener('ic-resource-selection-changed',()=>{
 settingsManager.schedule();
 markResourceSelectionStale();
});
Array.from(document.querySelectorAll('[data-resource]')).forEach(b=>b.addEventListener('click',()=>{
 state.resource=b.dataset.resource;
  window.ICResourceBrowser.setMode(state.resource);
  markResourceSelectionStale();
 settingsManager.schedule();
 document.querySelectorAll('[data-resource]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
}));
$('scanForm').addEventListener('submit',e=>{e.preventDefault();settingsManager.schedule();runScan(false);});
['systemInput','hubSelect','cargoVolume'].forEach(id=>$(id).addEventListener('change',()=>settingsManager.schedule()));
['haulCapacity','haulTax','haulCostJump','haulMinutesJump','haulAverageAU','haulTimeValue'].forEach(id=>$(id).addEventListener('change',()=>{
 settingsManager.schedule();if(state.results.length){repriceFreight();drawRows();const item=state.results.find(x=>x.name===state.selected);if(item)selectItem(item.name);}
}));
$('haulRoutePref').addEventListener('change',()=>{settingsManager.schedule();if(state.results.length)runRoutesOnly();});
$('refreshButton').addEventListener('click',()=>runScan(true));

// Cross-region trade-run discovery. A live order at one NPC station is not
// fungible with a different station's order. A route is needed for ISK/hour.
const TRADE_PRESETS={
 minerals:['Tritanium','Pyerite','Mexallon','Isogen','Nocxium','Zydrine','Megacyte','Morphite'],
 fuel:['Heavy Water','Liquid Ozone','Strontium Clathrates','Helium Isotopes','Hydrogen Isotopes','Oxygen Isotopes','Nitrogen Isotopes','Robotics'],
 pi:['Robotics','Coolant','Mechanical Parts','Enriched Uranium','Consumer Electronics','Guidance Systems','Miniature Electronics','Oxygen']
};
let tradeLastRun=0,tradeScanned=[],tradeScanning=false;
const tradeRouteCache=new Map();
function tradeNames(){
 return [...new Set($('tradeItems').value.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean))];
}
function tradeSettings(){
 const budget=Math.max(1,Math.min(1e12,Number($('tradeBudget').value)||25000000));
 const handling=Math.max(.1,Math.min(10000,Number($('tradeHandling').value)||10));
 return {budget,handling,items:tradeNames().slice(0,16).join(', '),sort:$('tradeSort').value,returnHome:$('tradeReturn').checked};
}
function tradeOptions(){const h=freightInputs('general','trade'),t=tradeSettings();return {...t,...h};}
function tradeStatus(text){$('tradeStatus').textContent=text;}
// Bounded station shortlists represent best prices AND meaningful bulk depth.
function topTradeBooks(groups,side){
 const scored=groups.map(g=>({g,first:g.orders[0]?.price||0}));
 scored.sort((a,b)=>side==='sell'?a.first-b.first:b.first-a.first);
 const top=scored.slice(0,7).map(x=>x.g);
 const deep=[...groups].sort((a,b)=>b.units-a.units).slice(0,3);
 return [...new Map([...top,...deep].map(g=>[g.locationId,g])).values()];
}
async function tradeRoute(from,to,preference){
 if(from===to)return 0;
 if(!Number.isInteger(+from)||!Number.isInteger(+to)||+from<30000000||+to<30000000||+from>=31000000||+to>=31000000)throw Error('Unverifiable wormhole or unknown stargate route');
 const key=from+':'+to+':'+preference;
 if(!tradeRouteCache.has(key)){
  const promise=(async()=>{
   const r=await request('/route/'+from+'/'+to,{method:'POST',body:JSON.stringify({preference,security_penalty:50})},86400000);
   const route=Array.isArray(r?.route)?r.route:Array.isArray(r)?r:null;
   if(!route||+route[0]!==+from||+route[route.length-1]!==+to)throw Error('Route not confirmed by ESI');
   return Math.max(0,route.length-1);
  })();
  tradeRouteCache.set(key,promise);
  promise.catch(()=>{if(tradeRouteCache.get(key)===promise)tradeRouteCache.delete(key);});
 }
 return tradeRouteCache.get(key);
}
function tradeEstimate(quote,jumpPickup,jumpLoaded,jumpHome,opts){
 const jumps=jumpPickup+jumpLoaded+jumpHome;
 const freightCost=jumps*opts.cashPerJump;
 const profit=quote.cashProfit-freightCost;
 const minutes=L.shipTravelMinutes(jumpPickup,opts)+L.shipTravelMinutes(jumpLoaded,opts)+(jumpHome?L.shipTravelMinutes(jumpHome,opts):0)+opts.handling;
 if(!(profit>0&&minutes>0))return null;
 return {...quote,profit,jumps,jumpPickup,jumpLoaded,jumpHome,
  freightCost,minutes,iskHour:profit*60/minutes,roi:100*profit/quote.cost};
}
async function loadTradeRegionOrders(types,regions){
 const work=[];
 for(const item of types)for(const region of regions)work.push({item,region,job:()=>window.ICMarketExplorer.getOrders(region,item.id,'all')});
 const books=new Map();let failures=0,done=0;
 await pool(work.map(w=>w.job),5,(i,data,error)=>{
  const w=work[i];if(!error&&Array.isArray(data))books.set(w.item.id+'|'+w.region,data);
  else failures++;
  done++;tradeStatus('Reading public buy/sell orders '+done+' / '+work.length+' · '+regions.length+' regions'+(failures?' · '+failures+' failed':'')+' · ESI 5-minute cache');
 });
 return {books,failures,requests:work.length};
}
function candidateTradeRuns(types,regions,books,options){
 const results=[];
 for(const item of types){
  const sells=[],buys=[];
  for(const region of regions){
   const orders=books.get(item.id+'|'+region)||[];
   const selling=topTradeBooks(L.tradeStationBooks(orders,'sell'),'sell');
   const buying=topTradeBooks(L.tradeStationBooks(orders,'buy'),'buy');
   for(const book of selling)sells.push({...book,region});
   for(const book of buying)buys.push({...book,region});
  }
  const candidate=[];
  const marketType=window.ICMarketExplorer.catalogItems().find(t=>t.name.toLowerCase()===item.name.toLowerCase());
  const isMineral=TRADE_PRESETS.minerals.includes(item.name)||/\bminerals\b/i.test(marketType?.path||'');
  const family=marketType?window.ICMarketExplorer.familyOf({...marketType,name:marketType.name.replace(/^Compressed\s+/i,'')}):'';
  const kind=isMineral?'mineral':['ore','moon','ice'].includes(family)?'ore':'general';
  const haul=freightInputs(kind,'trade');
  for(const source of sells)for(const dest of buys){
   const quote=L.tradeQuote(source,dest,{...options,...haul,unitVolume:item.volume});
   if(quote)candidate.push({item,source,dest,quote,haul});
  }
  candidate.sort((a,b)=>b.quote.cashProfit-a.quote.cashProfit);
  results.push(...candidate.slice(0,4));
 }
 // Protect the route API from an unbounded all-items Cartesian product.
 return results.sort((a,b)=>b.quote.cashProfit-a.quote.cashProfit).slice(0,36);
}
function tradeCard(run,i){
 const esc=L.escape,r=run.estimate,price=n=>L.formatIsk(n),num=n=>L.formatIsk(n,2);
 return '<details class="trade-run '+(i===0?'best':'')+'">'+
  '<summary class="trade-run-summary"><span class="trade-run-name">'+(i+1)+'. '+esc(run.item.name)+
  ' · '+num(run.quote.units)+' units / '+num(run.quote.volume)+' m³</span>'+
  '<span class="trade-run-price"><span><small>EST. NET / RUN</small><strong>'+price(r.profit)+' ISK</strong></span>'+
  '<span><small>EST. NET / HOUR</small><strong>'+price(r.iskHour)+' ISK</strong></span></span>'+
  '<span class="trade-open-hint">DETAILS ▾</span></summary>'+
  '<div class="trade-run-body"><div class="trade-run-points">'+
  '<div><span>BUY / PICKUP</span><strong><span data-trade-loc="'+run.quote.sourceId+'">Station #'+run.quote.sourceId+'</span> · '+esc(MARKETS[run.source.region]||String(run.source.region))+'</strong></div>'+
  '<div><span>SELL / DELIVER</span><strong><span data-trade-loc="'+run.quote.destId+'">Station #'+run.quote.destId+'</span> · '+esc(MARKETS[run.dest.region]||String(run.dest.region))+'</strong></div>'+
  '<div><span>BUY COST / CAPITAL</span><strong>'+price(r.cost)+' ISK</strong></div>'+
  '<div><span>SELL REVENUE / GROSS</span><strong>'+price(r.revenue)+' ISK</strong></div>'+
  '<div><span>SALES TAX</span><strong>−'+price(r.salesTax)+' ISK</strong></div>'+
  '<div><span>FREIGHT CASH EXPENSE</span><strong>−'+price(r.freightCost)+' ISK</strong></div>'+
  '<div><span>RETURN ON CAPITAL</span><strong>'+num(r.roi)+'%</strong></div>'+
  '<div><span>JUMPS (START / LOADED / RETURN)</span><strong>'+r.jumpPickup+' / '+r.jumpLoaded+' / '+r.jumpHome+'</strong></div>'+
  '<div><span>EST. TIME / ONE RUN</span><strong>'+num(r.minutes)+' minutes</strong></div></div>'+
  '<div class="trade-run-footer">Estimated opportunity · NPC stations · matched public ESI order quantities · quotes not reserved · stargate route checked · tax and security assumptions apply</div></div></details>';
}
async function drawTradeRuns(runs,summary){
 const mount=$('tradeResults'),sort=$('tradeSort').value;
 runs.sort((a,b)=>sort==='roi'?b.estimate.roi-a.estimate.roi:sort==='net'?b.estimate.profit-a.estimate.profit:b.estimate.iskHour-a.estimate.iskHour);
 const shown=runs.slice(0,12);
 if(!shown.length){mount.innerHTML='<p class="muted">No positive, route-verified trade runs found among the tested goods and stations. Consider a different watchlist, larger budget, or additional regions. An empty result is not proof no profitable trades exist elsewhere.</p>';return;}
 mount.innerHTML=shown.map(tradeCard).join('');
 const ids=[...new Set(shown.flatMap(r=>[r.quote.sourceId,r.quote.destId]))];
 await pool(ids.map(id=>async()=>({id,data:await buyerStation(id,null)})),4,(_,result)=>{
  if(tradeLastRun!==summary.run||!result)return;
  mount.querySelectorAll('[data-trade-loc="'+result.id+'"]').forEach(el=>el.textContent=result.data.name);
 });
}
async function scanTrade(){
 if(tradeScanning)return;
 const opts=tradeOptions(),requested=tradeNames();
 if(!requested.length||requested.length>16){tradeStatus('Enter 1–16 exact EVE item names.');return;}
 tradeScanning=true;const run=++tradeLastRun,btn=$('tradeScan');btn.disabled=true;
 $('tradeResults').innerHTML='<p class="muted">Loading cross-region trade orders and evaluating executable station-to-station spreads…</p>';
 try{
  tradeStatus('Resolving operating system and '+requested.length+' item names…');
  const [origin,itemsFound]=await Promise.all([findSystem($('systemInput').value.trim()),resolveNames(requested)]);
  const map=new Map((itemsFound.inventory_types||[]).map(x=>[x.name.toLowerCase(),x.id]));
  const matched=requested.filter(x=>map.has(x.toLowerCase())).map(name=>({name,id:map.get(name.toLowerCase())}));
  const missing=requested.filter(x=>!map.has(x.toLowerCase()));
  if(!matched.length)throw Error('No goods resolved. Check spelling and EVE market item names.');
  const typeWork=matched.map(x=>async()=>({...x,detail:await request('/universe/types/'+x.id+'/',{},86400000)}));
  const types=[];await pool(typeWork,5,(_,item)=>{if(item&&Number(item.detail.volume)>0)types.push({name:item.name,id:item.id,volume:+item.detail.volume});});
  if(!types.length)throw Error('No tradeable goods with a known physical volume.');
  const regions=scanRegions(origin.regionId,$('hubSelect').value);
  if(!regions.length)throw Error('No public market in the selected operating region.');
  const retrieved=await loadTradeRegionOrders(types,regions);
  if(!retrieved.books.size)throw Error('All regional market requests failed. No prices were invented.');
  const candidates=candidateTradeRuns(types,regions,retrieved.books,opts);
  if(!candidates.length){
   tradeStatus('No positive buy/sell spreads found in scanned NPC stations'+(missing.length?' · Not found: '+missing.join(', '):''));
   $('tradeResults').innerHTML='<p class="muted">No positive station-to-station public order spreads for this budget and cargo capacity. Try another watchlist or region. This scan excludes private structures.</p>';return;
  }
  const routeWork=candidates.map(c=>async()=>{
   const first=await tradeRoute(origin.id,c.quote.sourceSystem,opts.preference);
   const loaded=await tradeRoute(c.quote.sourceSystem,c.quote.destSystem,opts.preference);
   const home=opts.returnHome?await tradeRoute(c.quote.destSystem,origin.id,opts.preference):0;
   return {...c,estimate:tradeEstimate(c.quote,first,loaded,home,{...opts,...c.haul})};
  });
  const done=[];let completed=0,routeFailures=0;
  await pool(routeWork,4,(_,result,error)=>{
   completed++;if(error)routeFailures++;
   if(result?.estimate)done.push(result);
   tradeStatus('Routes '+completed+'/'+routeWork.length+' · '+done.length+' estimated profitable opportunities · '+routeFailures+' route failures');
  });
  if(run!==tradeLastRun)return;
  tradeScanned=done;
  tradeStatus('Scanned '+types.length+' goods in '+regions.length+' regions · '+retrieved.requests+' market order requests · '+done.length+' estimated profitable opportunities'+(retrieved.failures?' · '+retrieved.failures+' market errors':'')+(missing.length?' · Unknown: '+missing.join(', '):''));
  await drawTradeRuns(done,{run});
 }catch(error){if(run===tradeLastRun){tradeStatus('Trade scan failed: '+error.message);$('tradeResults').innerHTML='<p class="muted">Could not verify market opportunity. No guessed prices or routes were substituted.</p>';}}
 finally{tradeScanning=false;btn.disabled=false;}
}
function tradeInit(){
 $('tradeForm').addEventListener('submit',e=>{e.preventDefault();settingsManager.schedule();scanTrade();});
 for(const key of ['tradeBudget','tradeHandling','tradeItems','tradeSort','tradeReturn'])$(key).addEventListener('change',()=>{settingsManager.schedule();if(key==='tradeSort'&&tradeScanned.length)drawTradeRuns(tradeScanned,{run:tradeLastRun});});
 for(const btn of document.querySelectorAll('[data-trade-preset]'))btn.addEventListener('click',()=>{$('tradeItems').value=TRADE_PRESETS[btn.dataset.tradePreset].join(', ');settingsManager.schedule();});
}
tradeInit();

// Settings are stored in %LOCALAPPDATA% via the loopback host, outside the
// extracted release folder. Browser storage is retained for v0.2 migration.
const settingsManager=(()=>{
 const keys={channels:'4nik8.cb.channels.v1',volume:'4nik8.cb.volume.v1',shuffle:'4nik8.cb.shuffle.v1',livery:'4nik8.dashboard.livery.v1',last:'4nik8.cb.lastChannel.v1'};
 let timer=null,queue=Promise.resolve(),started=false;
 const readLocal=(key,fallback)=>{try{const v=localStorage.getItem(key);return v===null?fallback:v;}catch(_){return fallback;}};
 function capture(){
  let channels=[];try{channels=JSON.parse(readLocal(keys.channels,'[]'));}catch(_){}
  if(!Array.isArray(channels))channels=[];
  const n=Number(readLocal(keys.volume,'55'));
  rememberMiningCalibration();
  return {schemaVersion:1,livery:readLocal(keys.livery,'neon'),
   radio:{volume:Number.isFinite(n)?Math.max(0,Math.min(100,n)):55,shuffle:readLocal(keys.shuffle,'0')==='1',channels:channels.slice(0,40),selectedChannelId:readLocal(keys.last,'')},
   scanner:{system:$('systemInput').value.trim(),hub:$('hubSelect').value,resource:state.resource,cargo:Math.max(1,Math.trunc(+$('cargoVolume').value||31625)),resourceIds:window.ICResourceBrowser.selected()},haul:((h)=>({capacity:Math.max(1,+$('haulCapacity').value||31625),taxPct:h.taxPct,cashPerJump:h.cashPerJump,
   minutesPerJump:h.minutesPerJump,averageAU:h.averageAU,pilotISKHour:h.pilotISKHour,preference:h.preference}))(freightInputs()),
   mining:miningSnapshot(),trade:tradeSettings(),ships:{library:shipLibrary,selections:selectedShips}};
 }
 function apply(data){
  if(!data||data.schemaVersion!==1)return;
  try{
   if(['neon','steel','amber','oxide'].includes(data.livery))localStorage.setItem(keys.livery,data.livery);
   if(Array.isArray(data.radio?.channels))localStorage.setItem(keys.channels,JSON.stringify(data.radio.channels));
   if(Number.isFinite(+data.radio?.volume))localStorage.setItem(keys.volume,String(data.radio.volume));
    if(typeof data.radio?.shuffle==='boolean')localStorage.setItem(keys.shuffle,data.radio.shuffle?'1':'0');
   if(typeof data.radio?.selectedChannelId==='string')localStorage.setItem(keys.last,data.radio.selectedChannelId);
  }catch(_){}
  const haul=data.haul||{};
  for(const [id,key,min,max] of [['haulCapacity','capacity',1,10000000],['haulTax','taxPct',0,100],['haulCostJump','cashPerJump',0,100000000],['haulMinutesJump','minutesPerJump',0.1,120],['haulAverageAU','averageAU',0.1,250],['haulTimeValue','pilotISKHour',0,1000000000]]){
   if(haul[key]!==undefined&&Number.isFinite(+haul[key])&&+haul[key]>=min&&+haul[key]<=max)$(id).value=haul[key];
  }
  if(['Safer','Shorter','LessSecure'].includes(haul.preference))$('haulRoutePref').value=haul.preference;
  const mine=data.mining||{};
  if(typeof mine.profileName==='string'&&mine.profileName.trim())$('miningProfileName').value=(mine.profileName==='High on Supply / Retriever'?'Retriever':mine.profileName.slice(0,56));
  for(const [id,key,min,max] of [['miningOreYield','oreYield',0,1000000],['miningOreCycle','oreCycle',0.1,10000],['miningOreModules','oreModules',1,16],['miningIceUnits','iceUnits',0,1000],['miningIceCycle','iceCycle',0.1,10000],['miningIceModules','iceModules',1,16],['miningUptime','uptimePct',1,100],['miningHandling','handlingMinutes',0,10000]]){
   const v=mine[key];if(v===null||v===undefined||v===''){if(['miningOreYield','miningOreCycle','miningIceUnits','miningIceCycle'].includes(id))$(id).value='';continue;}
   if(Number.isFinite(+v)&&+v>=min&&+v<=max)$(id).value=v;
  }
  if(typeof mine.returnHome==='boolean')$('miningReturn').checked=mine.returnHome;
  if(['value','hour'].includes(mine.sort))$('miningSort').value=mine.sort;
  for(const [key,field] of [['observedOreM3Hour','ore'],['observedIceM3Hour','ice']]){const v=mine[key];miningObserved[field]=(v!==null&&v!==undefined&&Number.isFinite(+v)&&+v>0)?+v:null;}
  if(mine.session && ['ore','ice'].includes(mine.session.kind) && Number.isFinite(+mine.session.startedAt) && mine.session.startedAt>0 && mine.session.startedAt<=Date.now())miningSession={kind:mine.session.kind,startedAt:+mine.session.startedAt};
  else miningSession=null;
  const savedShips=data.ships||{};
  if(Array.isArray(savedShips.library)&&savedShips.library.length>0&&savedShips.library.length<=128&&savedShips.library.every(p=>p&&Array.isArray(p.modules)&&validShip(p)))shipLibrary=savedShips.library.map(p=>({...p,base:{...p.base},modules:[...p.modules]}));
  // Migrate only the historical factory Retriever label, not custom ship names.
  const factoryRetriever=shipLibrary.find(p=>p.id==='retriever'&&p.hull==='Retriever');
  if(factoryRetriever?.name==='High on Supply')factoryRetriever.name='Retriever';
  if(factoryRetriever?.miningCalibration?.profileName==='High on Supply / Retriever')
   factoryRetriever.miningCalibration.profileName='Retriever';
  for(const role of Object.keys(selectedShips))if(typeof savedShips.selections?.[role]==='string')selectedShips[role]=savedShips.selections[role];
  shipMenus();
  if(chosenShip('mining')?.miningCalibration)restoreMiningCalibration();else rememberMiningCalibration();
  const savedTrade=data.trade||{};
  if(Number.isFinite(+savedTrade.budget)&&+savedTrade.budget>=1&&+savedTrade.budget<=1e12)$('tradeBudget').value=+savedTrade.budget;
  if(Number.isFinite(+savedTrade.handling)&&+savedTrade.handling>=.1&&+savedTrade.handling<=10000)$('tradeHandling').value=+savedTrade.handling;
  if(typeof savedTrade.items==='string'&&savedTrade.items.length<=1800&&savedTrade.items.trim())$('tradeItems').value=savedTrade.items;
  if(['hour','net','roi'].includes(savedTrade.sort))$('tradeSort').value=savedTrade.sort;
  if(typeof savedTrade.returnHome==='boolean')$('tradeReturn').checked=savedTrade.returnHome;
  const scan=data.scanner||{};
  if(typeof scan.system==='string'&&scan.system)$('systemInput').value=scan.system;
  if(typeof scan.hub==='string'&&[...$('hubSelect').options].some(x=>x.value===scan.hub))$('hubSelect').value=scan.hub;
  if(Number.isFinite(+scan.cargo)&&+scan.cargo>0)$('cargoVolume').value=+scan.cargo;
   if(Array.isArray(scan.resourceIds))window.ICResourceBrowser.restore(scan.resourceIds);
   if(['ore','ice','both','moon','gas'].includes(scan.resource)){
   state.resource=scan.resource;
   document.querySelectorAll('[data-resource]').forEach(b=>{const yes=b.dataset.resource===scan.resource;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
  }
 }
 function notify(msg){const el=$('settingsStatus');if(el)el.textContent=msg;}
 function save(){
  // Capture at execution time to avoid a queued stale write reverting newer settings.
  queue=queue.catch(()=>{}).then(async()=>{
   try{
    const res=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(capture())});
    if(!res.ok){
     let detail='';try{const error=await res.json();detail=String(error.error||error.message||'').slice(0,170);}catch(_){}
     throw Error('HTTP '+res.status+(detail?' · '+detail:' · check the Windows server console'));
    }
    notify('SETTINGS SAVED TO WINDOWS · '+new Date().toLocaleTimeString());
   }catch(e){notify('SETTINGS NOT SAVED · '+e.message);}
  });return queue;
 }
 function schedule(){if(!started)return;clearTimeout(timer);timer=setTimeout(save,450);}
 async function load(){
  const browser=capture();
  try{
   const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),2200);
   let response;try{response=await fetch('/api/settings',{signal:ctrl.signal,cache:'no-store'});}finally{clearTimeout(t);}
   if(!response.ok)throw Error('HTTP '+response.status);
   const disk=await response.json();
   if(disk&&disk.schemaVersion===1){
    // Restore durable snapshot; merge any presets that were created in old v0.2
    // browser storage but not yet migrated to AppData.
    const ids=new Set((disk.radio?.channels||[]).map(c=>c.playlistId));
    const additions=(browser.radio.channels||[]).filter(c=>c?.playlistId&&!ids.has(c.playlistId));
    const merged=structuredClone(disk);
    if(additions.length)merged.radio.channels=[...merged.radio.channels,...additions].slice(0,40);
    apply(merged);notify('WINDOWS SETTINGS RESTORED');
    }else {
      if(!browser.radio.channels.length)browser.radio.channels=[{...FACTORY_JUPILUXE}];
      apply(browser);notify('BROWSER CHANNELS MIGRATED TO WINDOWS');
    }
  }catch(_){
    if(!browser.radio.channels.length){browser.radio.channels=[{...FACTORY_JUPILUXE}];apply(browser);}
    notify('BROWSER SETTINGS ONLY · WINDOWS HOST UNAVAILABLE');
  }
  started=true;await save();
 }
 function download(){
  const json=JSON.stringify(capture(),null,2), blob=new Blob([json],{type:'application/json'}),u=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=u;a.download='4nik8-industrial-command-settings.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200);
 }
 async function importFile(file){
  const d=JSON.parse(await file.text());
  if(d?.schemaVersion!==1||!Array.isArray(d.radio?.channels)||d.radio.channels.length>40)throw Error('Not a compatible 4NIK8 settings file.');
  // Never execute imported content; validate IDs and URLs before storing.
  for(const c of d.radio.channels){if(typeof c.name!=='string'||c.name.length>48||!c.name.trim())throw Error('Invalid channel name'); const p=L.parseYouTubePlaylistUrl(c.url);c.playlistId=p.playlistId;c.url=p.shareUrl||p.canonicalUrl;if(!c.id||String(c.id).length>90)throw Error('Invalid preset ID');}
  if(!['neon','steel','amber','oxide'].includes(d.livery))throw Error('Unrecognized livery');
  if(!(Number.isFinite(+d.radio.volume)&&+d.radio.volume>=0&&+d.radio.volume<=100))throw Error('Invalid volume');
  if(d.radio.shuffle!==undefined&&typeof d.radio.shuffle!=='boolean')throw Error('Invalid shuffle setting');
  apply(d);await save();location.reload();
 }
 function wire(){
  $('exportSettings').addEventListener('click',download);
  $('importSettings').addEventListener('click',()=>$('importSettingsFile').click());
  $('importSettingsFile').addEventListener('change',async(e)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importFile(f);}catch(err){notify('IMPORT FAILED · '+err.message);}});
 }
 wire();return {load,schedule,save};
})();

// Save the dashboard paint job independently from music presets and market cache.
function liveryInit(){
 const key='4nik8.dashboard.livery.v1', allowed=new Set(['neon','amber','steel','oxide']), picker=$('liverySelect');
 let chosen='neon';
 try { const stored=localStorage.getItem(key);if(allowed.has(stored))chosen=stored; }catch(_){}
 function apply(value){
  const theme=allowed.has(value)?value:'neon';
  document.documentElement.dataset.livery=theme;
  picker.value=theme;
  try{localStorage.setItem(key,theme);}catch(_){}
  settingsManager.schedule();
 }
 picker.addEventListener('change',()=>apply(picker.value));
 apply(chosen);
}
settingsManager.load().finally(()=>{shipInit();liveryInit();radioInit();miningInit();window.ICMarketExplorer.init();window.ICResourceBrowser.init(state.resource);});
})();