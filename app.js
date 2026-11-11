(function(){
'use strict';
const $=id=>document.getElementById(id), L=window.ICLogic;
const RESOURCES={
 ore:['Pyroxeres','Omber III-Grade','Kernite','Dark Ochre','Gneiss','Crokite'],
 ice:['Clear Icicle','White Glaze','Blue Ice','Glacial Mass']
};
const MARKETS={'10000043':'Amarr / Domain','10000002':'Jita / The Forge','10000030':'Rens / Heimatar','10000042':'Hek / Metropolis','10000032':'Dodixie / Sinq Laison','10000038':'The Bleak Lands','10000068':'Verge Vendor'};
const CACHE_TTL=300000; const memCache=new Map();
const state={resource:'ore',system:null,region:null,hub:10000043,results:[],selected:null,lastRun:0,inProgress:false,runId:0};
const ua='4NIK8-Industrial-Command-Preview/0.1.1';
const esi='https://esi.evetech.net/latest';
function url(path){return esi+path+(path.includes('?')?'&':'?')+'datasource=tranquility&compatibility_date=2025-09-30&user_agent='+encodeURIComponent(ua);}
function setStatus(status,detail){$('connectionBadge').className='conn-status '+status;$('connectionBadge').querySelector('span:last-child').textContent=detail;}
function message(t){$('locationSummary').textContent=t;}
function bestPriceDisplay(n){return L.formatIsk(n,1);}
async function request(path,opts={},ttl=CACHE_TTL,force=false){
 const k=path+(opts.body||''); const cached=memCache.get(k);
 if(!force&&cached&&Date.now()-cached.at<ttl)return cached.value;
 const ctrl=new AbortController(), timeout=setTimeout(()=>ctrl.abort(),18000);
 try{
  const r=await fetch(url(path),{method:opts.method||'GET',body:opts.body,headers:opts.body?{'Content-Type':'application/json'}:undefined,signal:ctrl.signal});
  if(!r.ok)throw Error('ESI '+r.status+' '+r.statusText);
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
 const names=RESOURCES[resource], all=names.concat(names.map(n=>'Compressed '+n));
 const found=await resolveNames(all,force);
 const types=Object.fromEntries((found.inventory_types||[]).map(t=>[t.name,t.id]));
 const map=[];
 for(const name of names){
  const id=types[name];if(!id){map.push({name,error:'Item ID not resolved by ESI'});continue;}
  try{
   const detail=await request('/universe/types/'+id+'/',{},86400000,force);
   map.push({name,id,compressedId:types['Compressed '+name]||null,volume:detail.volume});
  }catch(e){map.push({name,error:e.message});}
 }
 return map;
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
function buildTasks(types,regionId,hubId,force){
 const jobs=[];for(const t of types){if(!t.id||!t.volume)continue;
   for(const form of ['raw','compressed']){
    const typeId=form==='raw'?t.id:t.compressedId;if(!typeId)continue;
    for(const region of new Set([regionId,hubId])){
     jobs.push({name:t.name,form,region,typeId,job:()=>request('/markets/'+region+'/orders/?order_type=buy&type_id='+typeId,{},CACHE_TTL,force)});
    }
   }
 }
 return jobs;
}
function assembleRows(types,payload,sys,hub){
 const volume=Math.max(1,+$('cargoVolume').value||31625);
 const result=[];
 for(const item of types){
  if(item.error){result.push({...item,error:item.error});continue;}
  const units=Math.max(1,Math.floor(volume/item.volume));
  const variants=[];
  for(const form of ['raw','compressed'])for(const reg of new Set([sys.regionId,hub])){
   const key=item.name+'|'+form+'|'+reg,orders=payload.get(key);
   if(!orders)continue;
   const quote=L.rankStationQuotes(orders,units,item.volume);
   if(quote)variants.push({form,region:reg,quote});
  }
  const winner=L.bestOpportunity(variants);
  result.push({...item,units,volume:units*item.volume,winner,variants});
 }
 result.sort((a,b)=>Number(!!b.winner)-Number(!!a.winner)||(Number(b.winner?.quote.full||false)-Number(a.winner?.quote.full||false))||(b.winner?.quote.perM3||0)-(a.winner?.quote.perM3||0));
 return result;
}
function drawRows(){
 const el=$('opportunities');
 if(!state.results.length){el.innerHTML='<div class="placeholder">No item records available. Check the API status.</div>';return;}
 let ranking=0;
 el.innerHTML=state.results.map((item,idx)=>{
  if(!item.winner)return `<div class="op-card"><div class="rank">·</div><div class="op-main"><div class="op-name">${L.escape(item.name)}</div><div class="op-sub">${L.escape(item.error||'No executable public buy orders found for this sample load')}</div></div><div class="op-price"><strong>—</strong></div></div>`;
  ranking++;
  const w=item.winner, full=w.quote.full, mark=w.form==='compressed'?'COMPRESSED':'RAW';
  return `<div class="op-card ${state.selected===item.name?'selected':''}" data-item="${L.escape(item.name)}" role="button" tabindex="0" aria-label="Inspect ${L.escape(item.name)}"><div class="rank">${ranking}</div><div class="op-main"><div class="op-name">${L.escape(item.name)}</div><div class="op-sub">${mark} · ${L.escape(w.region===state.system.regionId?state.system.regionName:MARKETS[w.region]||'Other region')}${full?' · FULL LOAD':' · PARTIAL '+Math.round(w.quote.coverage*100)+'%'}</div></div><div class="op-price"><strong class="${full?'':'limited'}">${bestPriceDisplay(w.quote.perM3)}</strong><small>ISK/m³ · gross</small></div></div>`;
 }).join('');
 el.querySelectorAll('[data-item]').forEach(node=>{const callback=()=>selectItem(node.dataset.item);node.addEventListener('click',callback);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();callback();}});});
 const leader=state.results.find(x=>x.winner);
 $('bestName').textContent=leader?.name||'No visible buy orders';$('bestPrice').textContent=leader?bestPriceDisplay(leader.winner.quote.perM3):'—';
 $('dataFootnote').textContent=leader?'Quotes are gross, before market sales tax, processing, hauling and risk. Market depth is checked at a single buyer station; site availability is unknown.':'No executable public buy orders for the selected sample load. Private structure orders are not included.';
}
async function runScan(force=false){
 if(state.inProgress)return;
 const systemName=$('systemInput').value.trim();if(!systemName)return;
 state.inProgress=true;const current=++state.runId;state.results=[];state.selected=null;state.hub=+$('hubSelect').value;
 $('scanButton').disabled=true;$('refreshButton').disabled=true;setStatus('','CONNECTING');
 $('opportunities').innerHTML='<div class="placeholder"><span class="reticle">◎</span><strong>SEARCHING NEW EDEN</strong><p>Resolving location and resource types through ESI…</p></div>';
 $('bestName').textContent='Scanning orders…';$('bestPrice').textContent='—';
 $('haulDetails').innerHTML='<p class="muted">Market comparison in progress.</p>';
 try{
  const sys=await findSystem(systemName,force);state.system=sys;
  message(`${sys.name} · ${sys.security==null?'Unknown':Number(sys.security).toFixed(2)} security · ${sys.regionName} · ${Number(sys.id)>=31000000&&Number(sys.id)<32000000?'Wormhole system':'Known-space system'}`);
  const resources=await loadResources(state.resource,force);
  const tasks=buildTasks(resources,sys.regionId,state.hub,force);
  const payload=new Map();let done=0,fail=0;
  $('opportunities').innerHTML='<div class="placeholder"><span class="reticle">◎</span><strong>FETCHING LIVE BUY ORDERS</strong><p id="loadProgress">0 / '+tasks.length+' requests · public markets</p></div>';
  await pool(tasks.map(t=>t.job),3,(idx,data,error)=>{
   const job=tasks[idx];if(!error)payload.set(job.name+'|'+job.form+'|'+job.region,data);
   else fail++;
   done++;const progress=$('loadProgress');if(progress)progress.textContent=done+' / '+tasks.length+' market requests'+(fail?' · '+fail+' failed':'');
  });
  if(current!==state.runId)return;
  if(!payload.size)throw Error('No ESI market queries succeeded. Check network access or retry later.');
  state.results=assembleRows(resources,payload,sys,state.hub);state.lastRun=Date.now();drawRows();
  const first=state.results.find(x=>x.winner);if(first)selectItem(first.name);
  setStatus('online','ESI ORDERS LOADED');
  $('dataFootnote').textContent+=' · Retrieved '+new Date(state.lastRun).toLocaleString()+(fail?' · '+fail+' market requests failed.':'');
  $('refreshButton').disabled=false;
 }catch(error){
  setStatus('error','ESI UNAVAILABLE');message('Error: '+error.message);
  $('opportunities').innerHTML='<div class="placeholder"><strong>NO VERIFIED DATA</strong><p>'+L.escape(error.message)+'</p><p>No prices will be fabricated.</p></div>';
  $('bestName').textContent='Data unavailable';$('bestPrice').textContent='—';
 }finally{state.inProgress=false;$('scanButton').disabled=false;}
}
function selectItem(name){
 const item=state.results.find(x=>x.name===name);if(!item?.winner)return;state.selected=item.name;drawRows();
 const w=item.winner,q=w.quote,regionName=w.region===state.system.regionId?state.system.regionName:MARKETS[w.region]||'Other region';
 $('haulDetails').innerHTML=`<div class="detail-row"><span>Material</span><strong>${L.escape(item.name)}</strong></div><div class="detail-row"><span>Sell as</span><strong>${w.form==='raw'?'Raw ore / ice':'Compressed ore / ice'}</strong></div><div class="detail-row"><span>Best public market region</span><strong>${L.escape(regionName)}</strong></div><div class="detail-row"><span>Target load</span><strong>${L.formatIsk(item.volume,1)} m³ / ${L.formatIsk(item.units)} units</strong></div><div class="detail-row"><span>Buyer demand at one location</span><strong>${L.formatIsk(q.filled)} / ${L.formatIsk(q.units)} units</strong></div><div class="detail-row"><span>Gross immediate-sale value</span><strong>${L.formatIsk(q.gross)} ISK</strong></div><div class="detail-row"><span>Buyer station ID</span><strong>${q.locationId}</strong></div><button class="route-btn" id="routeButton">CALCULATE SAFER ROUTE TO BUYER</button><p class="muted tiny" id="routeResult">No shipping cost or tax is assumed. Buy orders may change before arrival. ESI market locations are not automatically safe or accessible.</p>`;
 $('routeButton').addEventListener('click',()=>routeToBuyer(q.locationId));
}
async function routeToBuyer(stationId){
 const label=$('routeResult'),button=$('routeButton');label.textContent='Checking station and route…';button.disabled=true;
 try{
  if(stationId>=1000000000000)throw Error('This appears to be a player structure; public station details may not be available.');
  const station=await request('/universe/stations/'+stationId+'/',{},86400000);
  const route=await request('/route/'+state.system.id+'/'+station.system_id+'/',{method:'POST',body:JSON.stringify({preference:'Safer',security_penalty:50})},86400000);
  if(!Array.isArray(route))throw Error('Invalid route response.');
  label.innerHTML=`<strong>${L.escape(station.name)}</strong> · ${Math.max(0,route.length-1)} jumps by safer route. Verify risk in-game before hauling; wormhole connections are not included automatically.`;
 }catch(e){label.textContent='Route unavailable: '+e.message;}finally{button.disabled=false;}
}
function radioInit(){
 const a=$('audioPlayer');a.volume=.55;const playlist=[];let index=-1,sourceType='';
 function current(){return playlist[index];}
 function render(){
  $('playPause').textContent=a.paused?'▶':'❚❚';
  $('nowPlaying').textContent=current()?.name||'NO SIGNAL · SELECT AUDIO';
  $('radioStatus').textContent=a.error?'Audio source not playable in this browser':a.paused?'Paused / standby':'Broadcasting to the cab';
  $('playlist').innerHTML=playlist.map((t,i)=>`<button class="${i===index?'active':''}" data-index="${i}">CH ${String(i+1).padStart(2,'0')} · ${L.escape(t.name)}</button>`).join('');
  $('playlist').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>play(+b.dataset.index)));
 }
 async function play(i){
  if(!playlist.length)return;
  index=(i+playlist.length)%playlist.length;const t=current();
  a.src=t.url;a.load();render();try{await a.play();}catch(e){$('radioStatus').textContent='Playback blocked or unsupported: '+e.message;}
  render();
 }
 $('audioFiles').addEventListener('change',e=>{
  const files=Array.from(e.target.files||[]);
  for(const file of files)playlist.push({name:file.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(file),local:true});
  render();if(index<0&&playlist.length)play(0);e.target.value='';
 });
 $('playStream').addEventListener('click',()=>{
  const v=$('streamUrl').value.trim();if(!/^https:\/\//i.test(v)){$('radioStatus').textContent='Use a direct HTTPS audio stream URL.';return;}
  playlist.push({name:'Internet Radio '+(playlist.length+1),url:v,local:false});play(playlist.length-1);
 });
 $('playPause').addEventListener('click',async()=>{if(!a.src){if(playlist.length)play(0);else $('radioStatus').textContent='Choose a music file or HTTPS radio stream first.';return;}if(a.paused){try{await a.play();}catch(e){$('radioStatus').textContent=e.message;}}else a.pause();render();});
 $('prevTrack').addEventListener('click',()=>play(index<0?0:index-1));$('nextTrack').addEventListener('click',()=>play(index<0?0:index+1));
 a.addEventListener('ended',()=>{if(index>=0)play(index+1);});a.addEventListener('play',render);a.addEventListener('pause',render);
 $('radioVolume').addEventListener('input',e=>{a.volume=e.target.value/100;$('volumeValue').textContent=e.target.value;});
 $('radioCollapse').addEventListener('click',()=>{const box=$('radioContent'),hidden=box.hidden;box.hidden=!hidden;$('radioCollapse').textContent=hidden?'▾':'▴';$('radioCollapse').setAttribute('aria-expanded',String(hidden));});
 render();
}
Array.from(document.querySelectorAll('[data-resource]')).forEach(b=>b.addEventListener('click',()=>{
 state.resource=b.dataset.resource;
 document.querySelectorAll('[data-resource]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
}));
$('scanForm').addEventListener('submit',e=>{e.preventDefault();runScan(false);});$('refreshButton').addEventListener('click',()=>runScan(true));
radioInit();
})();