(function(global){
'use strict';
const api={};
api.rankStationQuotesAll=function(orders,units,rawVolume){
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
    if(filled>0)quotes.push({locationId,systemId:stationOrders[0]?.system_id||null,filled,units,coverage:filled/units,gross,perM3:gross/(units*rawVolume),pricePerFilledM3:gross/(filled*rawVolume),full:remaining===0});
  }
  return quotes.sort((a,b)=>(Number(b.full)-Number(a.full))||b.gross-a.gross);
};
api.rankStationQuotes=function(orders,units,rawVolume){return api.rankStationQuotesAll(orders,units,rawVolume)[0]||null;};
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
  // Share links sometimes use the VL prefix for a YouTube Music browse view, not the playlist ID.
  if(list.startsWith('VL') && /^(?:PL|OLAK|UU|FL|RDCLAK)/.test(list.slice(2)))list=list.slice(2);
  if(!/^[A-Za-z0-9_-]{10,150}$/.test(list))
    throw Error('No usable playlist ID was found. Share the playlist itself, not a single song or private library view.');
  return {playlistId:list,canonicalUrl:'https://music.youtube.com/playlist?list='+encodeURIComponent(list),shareUrl:u.href};
};
// Convert a buyer's actual executable quantity to estimated take-home ISK.
// Modern compressed ore and compressed ice map 1 input unit to 1 output unit;
// volume per unit is supplied by ESI rather than hardcoded.
api.freightEstimate=function(quote,jumps,unitM3,minedRawM3,opts){
 if(!quote || jumps===null || jumps===undefined || !Number.isFinite(+jumps) || +jumps<0 || unitM3===null || unitM3===undefined || !Number.isFinite(+unitM3) || +unitM3<=0)return null;
 const capacity=+opts.capacity,volume=+quote.filled*+unitM3;
 if(!(capacity>0)||!(minedRawM3>0))return null;
 const trips=Math.ceil(volume/capacity);
 const totalJumpLegs=+jumps*Math.max(0,2*trips-1); // return between loads, end at destination
 const salesTax=+quote.gross*(+opts.taxPct/100);
 const haulCashCost=totalJumpLegs*+opts.cashPerJump;
 const travelMinutes=totalJumpLegs*+opts.minutesPerJump;
 const timeCost=travelMinutes/60*+opts.pilotISKHour;
 const net=+quote.gross-salesTax-haulCashCost-timeCost;
 return {jumps:+jumps,trips,totalJumpLegs,salesTax,haulCashCost,travelMinutes,timeCost,net,shippedM3:volume,perMinedM3:net/minedRawM3,full:!!quote.full};
};
api.formatIsk=function(n,digits=0){return Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(n):'—';};
api.escape=function(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
global.ICLogic=api;
})(typeof window!=='undefined'?window:globalThis);