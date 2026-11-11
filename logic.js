(function(global){
'use strict';
const api={};
api.rankStationQuotes=function(orders,units,rawVolume){
  const grouped=new Map();
  for(const o of orders||[]){
    if(!o.is_buy_order || !Number.isFinite(+o.price) || +o.price<=0 || !o.location_id || +o.volume_remain<=0)continue;
    // A buy order's minimum volume is the minimum individual trade size.
    if(+o.min_volume>units)continue;
    if(!grouped.has(o.location_id))grouped.set(o.location_id,[]);
    grouped.get(o.location_id).push(o);
  }
  const quotes=[];
  for(const [locationId,stationOrders] of grouped){
    let remaining=units,gross=0;
    for(const order of stationOrders.sort((a,b)=>b.price-a.price)){
      const amount=Math.min(remaining,+order.volume_remain);
      if(amount < +order.min_volume)continue;
      remaining-=amount; gross+=amount*order.price;
      if(remaining===0)break;
    }
    const filled=units-remaining;
    if(filled>0)quotes.push({locationId,filled,units,coverage:filled/units,gross,perM3:gross/(units*rawVolume),pricePerFilledM3:gross/(filled*rawVolume),full:remaining===0});
  }
  return quotes.sort((a,b)=>(Number(b.full)-Number(a.full))||b.gross-a.gross)[0]||null;
};
api.bestOpportunity=function(variants){
  const valid=(variants||[]).filter(v=>v.quote);
  valid.sort((a,b)=>Number(b.quote.full)-Number(a.quote.full)||b.quote.gross-a.quote.gross);
  return valid[0]||null;
};
// Normalize shared YouTube / YouTube Music playlist URLs without requesting account access.
api.parseYouTubePlaylistUrl=function(raw){
  let input=String(raw||'').trim();
  if(!input)throw Error('Paste a shared YouTube Music playlist URL.');
  let u;
  try{u=new URL(input);}catch(_){throw Error('Enter a full https:// YouTube Music or YouTube playlist URL.');}
  if(u.protocol!=='https:')throw Error('A secure HTTPS playlist link is required.');
  const host=u.hostname.toLowerCase();
  if(!['music.youtube.com','youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host))
    throw Error('Only shared YouTube Music or YouTube playlist URLs are supported.');
  let list=u.searchParams.get('list')||'';
  // YouTube Music may expose /browse/VL<playlist ID> links.
  if(!list && host==='music.youtube.com' && u.pathname.startsWith('/browse/VL'))
    list=u.pathname.slice('/browse/VL'.length);
  if(!/^[A-Za-z0-9_-]{10,150}$/.test(list))
    throw Error('No usable playlist ID was found. Share the playlist itself, not a single song or private library view.');
  return {playlistId:list,canonicalUrl:'https://music.youtube.com/playlist?list='+encodeURIComponent(list)};
};
api.formatIsk=function(n,digits=0){return Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(n):'—';};
api.escape=function(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
global.ICLogic=api;
})(typeof window!=='undefined'?window:globalThis);