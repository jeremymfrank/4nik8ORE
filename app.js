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
const ua='4NIK8-Industrial-Command-Preview/0.2.0';
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
 const audio=$('audioPlayer');
 const STORAGE='4nik8.cb.channels.v1', VOLUME_KEY='4nik8.cb.volume.v1';
 const maxChannels=40;
 let channels=[],editId=null,selectedChannelId=null;
 let source='none',audioIndex=-1,ytPlayer=null,ytReady=false,ytPlaying=false;
 let ytApiPromise=null,ytPlayerPromise=null,trackTitle='';
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
 function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(channels));return true;}catch(e){setChannelMessage('Presets could not be saved in browser storage: '+e.message,true);return false;}}
 function setChannelMessage(msg,isError=false){$('channelMessage').textContent=msg;$('channelMessage').classList.toggle('error',isError);}
 function channel(){return channels.find(c=>c.id===selectedChannelId)||null;}
 function channelNumber(id){const i=channels.findIndex(c=>c.id===id);return String(i+1).padStart(2,'0');}
 function renderChannels(){
  $('channelCount').textContent=channels.length+' PRESET'+(channels.length===1?'':'S');
  $('channelList').innerHTML=channels.length?channels.map(c=>{
   const selected=c.id===selectedChannelId;
   return `<div class="channel-preset ${selected?'active':''}"><button type="button" class="tune-channel" data-tune="${L.escape(c.id)}" aria-label="Tune channel ${L.escape(c.name)}"><span class="channel-badge">CH ${channelNumber(c.id)}</span><span class="channel-title">${L.escape(c.name)}</span><span class="channel-signal">${selected?'● ON AIR':'▸ TUNE'}</span></button><button type="button" class="channel-edit" data-edit="${L.escape(c.id)}" title="Edit ${L.escape(c.name)}" aria-label="Edit channel ${L.escape(c.name)}">✎</button><button type="button" class="channel-delete" data-delete="${L.escape(c.id)}" title="Delete ${L.escape(c.name)}" aria-label="Delete channel ${L.escape(c.name)}">×</button></div>`;
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
 $('cancelChannelEdit').addEventListener('click',()=>{cancelEdit();setChannelMessage('Ready to save another playlist.');});
 $('channelForm').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('channelName').value.trim(),input=$('channelUrl').value.trim();
  if(!name){setChannelMessage('Give this channel a name.',true);return;}
  let parsed;try{parsed=L.parseYouTubePlaylistUrl(input);}catch(err){setChannelMessage(err.message,true);return;}
  if(!editId&&channels.length>=maxChannels){setChannelMessage('Maximum '+maxChannels+' saved channels reached.',true);return;}
  const saved={id:editId||String(Date.now())+'-'+Math.random().toString(36).slice(2,10),name:name.slice(0,48),url:parsed.canonicalUrl,playlistId:parsed.playlistId};
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
 function stopYouTube(){
  if(ytPlayer&&ytReady&&typeof ytPlayer.stopVideo==='function'){try{ytPlayer.stopVideo();}catch(_){}}
  selectedChannelId=null;ytPlaying=false;trackTitle='';$('youtubeShell').hidden=true;
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
 function ensurePlayer(){
  if(ytPlayerPromise)return ytPlayerPromise;
  ytPlayerPromise=ensureYouTubeApi().then(YT=>new Promise((resolve,reject)=>{
   // Keep the official video player visible; audio-only hidden YouTube embedding is not supported.
   const timer=setTimeout(()=>reject(Error('YouTube player did not initialize.')),18000);
   ytPlayer=new YT.Player('youtubePlayerMount',{
    width:'100%',height:'100%',playerVars:{playsinline:1,controls:1,rel:0,origin:window.location.origin},
    events:{
     onReady(event){clearTimeout(timer);ytReady=true;event.target.setVolume(+volumeInput.value);resolve(event.target);},
     onStateChange(event){
      ytPlaying=event.data===YT.PlayerState.PLAYING;
      if(source==='youtube'){
       try{trackTitle=event.target.getVideoData()?.title||'';}catch(_){trackTitle='';}
       if(event.data===YT.PlayerState.PLAYING)status('Broadcasting from YouTube · playlist supplied by user');
       else if(event.data===YT.PlayerState.PAUSED)status('YouTube playback paused');
       else if(event.data===YT.PlayerState.BUFFERING)status('Tuning YouTube stream…');
       else if(event.data===YT.PlayerState.ENDED)status('Playlist ended.');
       nowPlaying();
      }
     },
     onError(event){if(source==='youtube')status('YouTube error '+event.data+': playlist may be private, restricted, or not embeddable. Try opening it on YouTube.');}
    }
   });
  })).catch(e=>{ytPlayerPromise=null;throw e;});
  return ytPlayerPromise;
 }
 async function tuneChannel(id){
  const requested=channels.find(c=>c.id===id);if(!requested)return;
  // A saved playlist is not necessarily playable: YouTube decides embed eligibility.
  if(location.protocol==='file:'){
   setChannelMessage('To play YouTube channels, launch the app with START_COMMAND.cmd (localhost required for YouTube embeds).',true);
   return;
  }
  audio.pause();source='youtube';selectedChannelId=id;trackTitle='';ytPlaying=false;
  $('radioContent').hidden=false;$('radioCollapse').textContent='▾';$('radioCollapse').setAttribute('aria-expanded','true');
  $('youtubeShell').hidden=false;renderChannels();nowPlaying();status('Tuning CH '+channelNumber(id)+'…');
  try{
   const player=await ensurePlayer();
   if(source!=='youtube'||selectedChannelId!==id)return;
   player.loadPlaylist({list:requested.playlistId,listType:'playlist',index:0});
   player.setVolume(+volumeInput.value);
   status('Channel loaded. If playback does not start, click Play inside the YouTube player.');
  }catch(err){status('Cannot tune YouTube: '+err.message);}
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
   if(!ytReady){status('YouTube is still connecting.');return;}
   try{if(ytPlaying)ytPlayer.pauseVideo();else ytPlayer.playVideo();}catch(e){status(e.message);}
   return;
  }
  if(!audio.src){if(audioTracks.length)playAudio(0);else status('Choose a CB channel, local music file, or HTTPS radio stream.');return;}
  if(audio.paused){try{await audio.play();}catch(e){status(e.message);}}else audio.pause();nowPlaying();
 });
 $('prevTrack').addEventListener('click',()=>{if(source==='youtube'&&ytReady)ytPlayer.previousVideo();else if(audioTracks.length)playAudio(audioIndex<0?0:audioIndex-1);});
 $('nextTrack').addEventListener('click',()=>{if(source==='youtube'&&ytReady)ytPlayer.nextVideo();else if(audioTracks.length)playAudio(audioIndex<0?0:audioIndex+1);});
 audio.addEventListener('ended',()=>{if(source==='audio'&&audioIndex>=0)playAudio(audioIndex+1);});
 audio.addEventListener('play',()=>{if(source==='audio')nowPlaying();});
 audio.addEventListener('pause',()=>{if(source==='audio')nowPlaying();});
 volumeInput.addEventListener('input',e=>{
  const v=+e.target.value;audio.volume=v/100;$('volumeValue').textContent=v;
  if(ytPlayer&&ytReady)ytPlayer.setVolume(v);
  try{localStorage.setItem(VOLUME_KEY,String(v));}catch(_){}
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
 document.querySelectorAll('[data-resource]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
}));
$('scanForm').addEventListener('submit',e=>{e.preventDefault();runScan(false);});$('refreshButton').addEventListener('click',()=>runScan(true));
// Save the dashboard paint job independently from music presets and market cache.
function liveryInit(){
 const key='4nik8.dashboard.livery.v1', allowed=new Set(['amber','steel','oxide']), picker=$('liverySelect');
 let chosen='steel';
 try { const stored=localStorage.getItem(key);if(allowed.has(stored))chosen=stored; }catch(_){}
 function apply(value){
  const theme=allowed.has(value)?value:'steel';
  document.documentElement.dataset.livery=theme;
  picker.value=theme;
  try{localStorage.setItem(key,theme);}catch(_){}
 }
 picker.addEventListener('change',()=>apply(picker.value));
 apply(chosen);
}
liveryInit();
radioInit();
})();