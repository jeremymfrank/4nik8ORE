(function(){
'use strict';
const $=id=>document.getElementById(id), L=window.ICLogic;
const RESOURCES={
 ore:['Pyroxeres','Omber III-Grade','Kernite','Dark Ochre','Gneiss','Crokite'],
 ice:['Clear Icicle','White Glaze','Blue Ice','Glacial Mass']
};
const MARKETS={'10000043':'Domain (Amarr)','10000002':'The Forge (Jita)','10000030':'Heimatar (Rens)','10000042':'Metropolis (Hek)','10000032':'Sinq Laison (Dodixie)','10000038':'The Bleak Lands','10000068':'Verge Vendor'};
const MAJOR_MARKET_REGIONS=[10000043,10000002,10000030,10000042,10000032];
const FACTORY_JUPILUXE=Object.freeze({id:'factory-jupiluxe-v1',name:'Jupiluxe',url:'https://music.youtube.com/playlist?list=PLPvpJjBd_h4nG9C1K-nLrGWsdre_8kX9V',playlistId:'PLPvpJjBd_h4nG9C1K-nLrGWsdre_8kX9V'});
const CACHE_TTL=300000; const memCache=new Map();
const state={resource:'both',system:null,region:null,hub:'all',results:[],selected:null,lastRun:0,inProgress:false,runId:0,coverage:[],failed:0,routeToken:0};
const ua='4NIK8-Industrial-Command-Preview/0.4.0';
const esi='https://esi.evetech.net/latest';
function url(path){return esi+path+(path.includes('?')?'&':'?')+'datasource=tranquility&compatibility_date=2025-09-30&user_agent='+encodeURIComponent(ua);}
function setStatus(status,detail){$('connectionBadge').className='conn-status '+status;$('connectionBadge').querySelector('span:last-child').textContent=detail;}
function message(t){$('locationSummary').textContent=t;}
function bestPriceDisplay(n){return L.formatIsk(n,1);}
async function request(path,opts={},ttl=CACHE_TTL,force=false){
 const k=path+(opts.body||''); const cached=memCache.get(k);
 if((!force || path.startsWith('/markets/'))&&cached&&Date.now()-cached.at<ttl)return cached.value;
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
 const names=resource==='both'?[...RESOURCES.ore,...RESOURCES.ice]:RESOURCES[resource], all=names.concat(names.map(n=>'Compressed '+n));
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
    jobs.push({name:t.name,form,region,typeId,job:()=>request('/markets/'+region+'/orders/?order_type=buy&type_id='+typeId,{},CACHE_TTL,force)});
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
   for(const quote of quotes.slice(0,3))variants.push({form,region:reg,quote});
  }
  const winner=L.bestOpportunity(variants);
  const alternatives=variants.sort((a,b)=>Number(b.quote.full)-Number(a.quote.full)||b.quote.gross-a.quote.gross);
  result.push({...item,units,volume:units*item.volume,winner,variants:alternatives});
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
  return `<div class="op-card ${state.selected===item.name?'selected':''}" data-item="${L.escape(item.name)}" role="button" tabindex="0" aria-label="Inspect ${L.escape(item.name)}"><div class="rank">${ranking}</div><div class="op-main"><div class="op-name">${L.escape(item.name)}</div><div class="op-sub">${mark} · ${L.escape(MARKETS[w.region]||state.system.regionName||'Other region')}${full?' · FULL LOAD':' · PARTIAL '+Math.round(w.quote.coverage*100)+'%'}</div></div><div class="op-price"><strong class="${full?'':'limited'}">${bestPriceDisplay(w.quote.perM3)}</strong><small>ISK/m³ · gross</small></div></div>`;
 }).join('');
 el.querySelectorAll('[data-item]').forEach(node=>{const callback=()=>selectItem(node.dataset.item);node.addEventListener('click',callback);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();callback();}});});
 const leader=state.results.find(x=>x.winner);
 $('bestName').textContent=leader?.name||'No visible buy orders';$('bestPrice').textContent=leader?bestPriceDisplay(leader.winner.quote.perM3):'—';
 $('dataFootnote').textContent=leader?'Quotes are gross, before market sales tax, processing, hauling and risk. Market depth is checked at a single buyer station; site availability is unknown.':'No executable public buy orders for the selected sample load. Private structure orders are not included.';
}
async function runScan(force=false){
 if(state.inProgress)return;
 const systemName=$('systemInput').value.trim();if(!systemName)return;
 state.inProgress=true;const current=++state.runId;state.results=[];state.selected=null;state.hub=$('hubSelect').value;state.failed=0;state.routeToken++;
 $('scanButton').disabled=true;$('refreshButton').disabled=true;setStatus('','CONNECTING');
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
function selectItem(name){
 const item=state.results.find(x=>x.name===name);if(!item?.winner)return;state.selected=item.name;drawRows();
 const w=item.winner,q=w.quote,regionName=MARKETS[w.region]||state.system.regionName||'Other region';
 const alternatives=item.variants.filter(v=>v!==w && v.quote.locationId!==q.locationId).slice(0,3);
 $('haulDetails').innerHTML=`<div class="detail-row"><span>Resource evaluated</span><strong>${L.escape(item.name)}</strong></div><div class="detail-row"><span>Best public buy-order region</span><strong>${L.escape(regionName)}</strong></div><div class="detail-row"><span>Sale form</span><strong>${w.form==='raw'?'Raw':'Compressed'}</strong></div><div class="detail-row"><span>Sample mined volume</span><strong>${L.formatIsk(item.volume,1)} m³ / ${L.formatIsk(item.units)} units</strong></div><div class="detail-row"><span>Purchasable at quoted station</span><strong>${L.formatIsk(q.filled)} / ${L.formatIsk(q.units)} units</strong></div><div class="detail-row"><span>Gross buyer revenue</span><strong>${L.formatIsk(q.gross)} ISK</strong></div><div class="detail-row"><span>Buyer location</span><strong>${L.escape(String(q.locationId))}</strong></div><div class="detail-row"><span>Route from ${L.escape(state.system.name)}</span><strong id="routeResult">Resolving automatically…</strong></div><div class="market-alternatives"><strong>OTHER QUOTED BUYERS · SAME SCAN</strong>${alternatives.length?alternatives.map(v=>`<div class="alternate-row"><span>${L.escape(MARKETS[v.region]||'Operating region')} · ${v.form.toUpperCase()} · ${L.escape(String(v.quote.locationId))}</span><strong>${L.formatIsk(v.quote.gross)} ISK${v.quote.full?'':' · PARTIAL'}</strong></div>`).join(''):'<span class="muted tiny">No other public station quote found.</span>'}</div><p class="muted tiny">Single-station buy-order depth. Gross revenue only: no processing fees, tax, hauling cost, risk or travel time. Market site availability is unverified.</p>`;
 const token=++state.routeToken;
 autoRouteToBuyer(q,token);
}
async function autoRouteToBuyer(quote,token){
 const label=$('routeResult');if(!label)return;
 const isWH=state.system.id>=31000000&&state.system.id<32000000;
 if(isWH){label.textContent='Wormhole exits unknown · cannot calculate';return;}
 if(!quote.systemId){label.textContent='Buyer system not reported by market order';return;}
 try{
  // 2026 CCP route API uses POST with preference/security_penalty in JSON body.
  const body=JSON.stringify({preference:'Safer',security_penalty:50});
  const result=await request('/route/'+state.system.id+'/'+quote.systemId+'/',{method:'POST',body},86400000);
  if(token!==state.routeToken||!label.isConnected)return;
  const route=Array.isArray(result)?result:Array.isArray(result.path)?result.path:null;
  if(!route)throw Error('unexpected route response');
  label.textContent=Math.max(0,route.length-1)+' stargate jumps (safer preference) · excludes wormholes/filaments/jump drives';
 }catch(e){if(token===state.routeToken&&label.isConnected)label.textContent='Route unavailable: '+e.message;}
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
  if(source==='youtube')source='none';
  renderChannels();nowPlaying();
 }
 $('stopYouTube').addEventListener('click',()=>{stopYouTube();status('YouTube channel off air.');});
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
  const descriptions={2:'YouTube rejected the embedded playlist request (invalid parameter).',5:'YouTube HTML5 player error.',100:'A video is unavailable or private.',101:'The video owner disabled embedding.',150:'The video owner disabled embedding.',153:'YouTube rejected the embedded client identity / HTTP referrer.'};
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
  $('radioContent').hidden=false;$('radioCollapse').textContent='▾';$('radioCollapse').setAttribute('aria-expanded','true');
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
  if(source==='youtube')stopYouTube();
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
  if(source==='youtube'){
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
  const content=$('radioContent'),opening=content.hidden;
  if(!opening&&source==='youtube'&&ytPlayer&&ytReady){
   ytPlayer.pauseVideo();ytPlaying=false;status('YouTube paused while radio panel is collapsed.');nowPlaying();
  }
  content.hidden=!opening;$('radioCollapse').textContent=opening?'▾':'▴';
  $('radioCollapse').setAttribute('aria-expanded',String(opening));
 });
 renderChannels();nowPlaying();status('Ready. Tune a saved channel or load local music.');
}
Array.from(document.querySelectorAll('[data-resource]')).forEach(b=>b.addEventListener('click',()=>{
 state.resource=b.dataset.resource;
 settingsManager.schedule();
 document.querySelectorAll('[data-resource]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
}));
$('scanForm').addEventListener('submit',e=>{e.preventDefault();settingsManager.schedule();runScan(false);});
['systemInput','hubSelect','cargoVolume'].forEach(id=>$(id).addEventListener('change',()=>settingsManager.schedule()));$('refreshButton').addEventListener('click',()=>runScan(true));

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
  return {schemaVersion:1,livery:readLocal(keys.livery,'neon'),
   radio:{volume:Number.isFinite(n)?Math.max(0,Math.min(100,n)):55,shuffle:readLocal(keys.shuffle,'0')==='1',channels:channels.slice(0,40),selectedChannelId:readLocal(keys.last,'')},
   scanner:{system:$('systemInput').value.trim(),hub:$('hubSelect').value,resource:state.resource,cargo:Math.max(1,Math.trunc(+$('cargoVolume').value||31625))}};
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
  const scan=data.scanner||{};
  if(typeof scan.system==='string'&&scan.system)$('systemInput').value=scan.system;
  if(typeof scan.hub==='string'&&[...$('hubSelect').options].some(x=>x.value===scan.hub))$('hubSelect').value=scan.hub;
  if(Number.isFinite(+scan.cargo)&&+scan.cargo>0)$('cargoVolume').value=+scan.cargo;
   if(['ore','ice','both'].includes(scan.resource)){
   state.resource=scan.resource;
   document.querySelectorAll('[data-resource]').forEach(b=>{const yes=b.dataset.resource===scan.resource;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
  }
 }
 function notify(msg){const el=$('settingsStatus');if(el)el.textContent=msg;}
 function save(){
  // Capture at execution time to avoid a queued stale write reverting newer settings.
  queue=queue.catch(()=>{}).then(async()=>{
   try{const res=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(capture())});
    if(!res.ok)throw Error('HTTP '+res.status);
    notify('SETTINGS SAVED TO WINDOWS');
   }catch(e){notify('LOCAL BACKUP ONLY · '+e.message);}
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
settingsManager.load().finally(()=>{liveryInit();radioInit();});
})();