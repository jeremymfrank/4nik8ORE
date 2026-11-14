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
 const perRoute=api.shipTravelMinutes(+jumps,opts);
  const travelMinutes=(2*trips-1)*perRoute;
 const timeCost=travelMinutes/60*+opts.pilotISKHour;
 const net=+quote.gross-salesTax-haulCashCost-timeCost;
 return {jumps:+jumps,trips,totalJumpLegs,salesTax,haulCashCost,travelMinutes,timeCost,net,shippedM3:volume,perMinedM3:net/minedRawM3,full:!!quote.full};
};

// A configured effective yield already includes ship, character and fitting bonuses.
// Observed session yield is an alternative and includes actual inactive periods.
api.miningRate=function(profile,kind,oreUnitM3){
 if(!profile || !['ore','ice'].includes(kind))return null;
 const observed=+(kind==='ice'?profile.observedIceM3Hour:profile.observedOreM3Hour);
 if(Number.isFinite(observed)&&observed>0)return {m3Hour:observed,source:'measured'};
 const count=+(kind==='ice'?profile.iceModules:profile.oreModules);
 const amount=+(kind==='ice'?profile.iceUnits:profile.oreYield);
 const seconds=+(kind==='ice'?profile.iceCycle:profile.oreCycle);
 const uptime=+profile.uptimePct;
 if(!(count>0&&Number.isInteger(count)&&amount>0&&seconds>0&&uptime>0&&uptime<=100))return null;
 if(kind==='ice'&&!(oreUnitM3>0))return null;
 const amountM3=kind==='ice'?amount*oreUnitM3:amount;
 const rate=count*amountM3*3600/seconds*(uptime/100);
 return Number.isFinite(rate)&&rate>0?{m3Hour:rate,source:'cycle'}:null;
};
// Revenue per hour after selected sales tax. Freight time is included only
// in all-in ISK/hour; a pilot-time opportunity charge is not deducted again.
// Return-to-origin is an optional EXTRA final empty leg, not included in the
// freight module's default (2 * trips - 1) outbound/return trip model.
api.miningPerformance=function(item,variant,profile,haulOptions,kind){
 if(!item || !variant?.quote?.full || !variant.estimate || !(item.volume>0&&item.units>0))return null;
 const rate=api.miningRate(profile,kind,item.volume/item.units);
 if(!rate)return null;
 const e=variant.estimate,q=variant.quote,haul=haulOptions;
 const miningHours=item.volume/rate.m3Hour;
 const finalReturnMinutes=profile.returnHome?api.shipTravelMinutes(e.jumps,haul):0;
 const finalReturnCash=profile.returnHome?e.jumps*+haul.cashPerJump:0;
 const handlingMinutes=+profile.handlingMinutes;
 const travelMinutes=e.travelMinutes+finalReturnMinutes;
 const timeHours=miningHours+(travelMinutes+handlingMinutes)/60;
 const afterTax=q.gross-e.salesTax;
 const cashNet=afterTax-e.haulCashCost-finalReturnCash;
 if(!(miningHours>0&&timeHours>0&&Number.isFinite(cashNet)))return null;
 return {source:rate.source,rateM3Hour:rate.m3Hour,miningHours,
   travelMinutes,finalReturnMinutes,handlingMinutes,timeHours,afterTax,cashNet,
   miningIskHour:afterTax/miningHours,allInIskHour:cashNet/timeHours,
   returnHome:!!profile.returnHome};
};
// Trade run quotes use separately executable station orders. Never sum inventory
// from different stations into a pretend one-stop purchase or sale.
api.tradeStationBooks=function(orders,side){
 const books=new Map();
 for(const order of orders||[]){
  if(!order||!!order.is_buy_order!==(side==='buy')||!(+order.price>0)||!(+order.volume_remain>0))continue;
  const location=+order.location_id;
  // Public NPC stations only: public orders do not grant docking rights at structures.
  if(!(location>=60000000&&location<64000000))continue;
  const system=+order.system_id;
  if(!(system>=30000000&&system<31000000))continue;
  let book=books.get(location);
  if(!book){book={locationId:location,systemId:system,orders:[],units:0};books.set(location,book);}
  const volume=Math.floor(+order.volume_remain);
  book.orders.push({price:+order.price,volume,minVolume:Math.max(1,Math.floor(+order.min_volume||1))});
  book.units+=volume;
 }
 for(const b of books.values())b.orders.sort((a,c)=>side==='buy'?c.price-a.price:a.price-c.price);
 return [...books.values()];
};
api.tradeQuote=function(seller,buyer,opts){
 if(!seller||!buyer||seller.locationId===buyer.locationId)return null;
 const capacity=+opts.capacity,unitVolume=+opts.unitVolume,budget=+opts.budget,tax=+opts.taxPct/100;
 if(!(capacity>0&&unitVolume>0&&budget>0&&tax>=0&&tax<1))return null;
 const cargoLimit=Math.min(Math.floor(capacity/unitVolume),1000000000);
 if(cargoLimit<1)return null;
 let i=0,j=0,units=0,cost=0,revenue=0,remaining=cargoLimit;
 const sells=seller.orders,buys=buyer.orders;
 let sLeft=sells[0]?.volume||0,bLeft=buys[0]?.volume||0;
 const buyerAmounts=new Map(),sellerAmounts=new Map();
 while(i<sells.length&&j<buys.length&&remaining>0){
  if(!sLeft){i++;sLeft=sells[i]?.volume||0;continue;}
  if(!bLeft){j++;bLeft=buys[j]?.volume||0;continue;}
  const s=sells[i],b=buys[j];
  if(b.price*(1-tax)<=s.price)break; // never buy negative-margin inventory
  const affordable=Math.floor((budget-cost+1e-7)/s.price);
  const qty=Math.min(sLeft,bLeft,remaining,affordable);
  if(!(qty>0))break;
  units+=qty;cost+=qty*s.price;revenue+=qty*b.price;
  buyerAmounts.set(j,(buyerAmounts.get(j)||0)+qty);
  sellerAmounts.set(i,(sellerAmounts.get(i)||0)+qty);
  sLeft-=qty;bLeft-=qty;remaining-=qty;
 }
 // A buy order's minimum trade quantity must be met in one sell transaction.
 // Reject estimates that depend on partially filling an order below its minimum.
 for(const [idx,count] of buyerAmounts)if(count<buys[idx].minVolume)return null;
 for(const [idx,count] of sellerAmounts)if(count<sells[idx].minVolume)return null;
 if(!units||cost>budget+0.001)return null;
 const salesTax=revenue*tax,profit=revenue-salesTax-cost;
 if(!(profit>0))return null;
 return {units,volume:units*unitVolume,cost,revenue,salesTax,cashProfit:profit,
  marginPct:100*profit/cost,roiPct:100*profit/cost,
  sourceId:seller.locationId,destId:buyer.locationId,
  sourceSystem:seller.systemId,destSystem:buyer.systemId};
};

// Shared fitted ship calculations. Public ESI hull data supplies base attributes;
// pilot skill bonuses and unrecognized fittings must be calibrated, not invented.
const SHIP_STACK=[1,.869,.571,.283,.106,.03];
const FIT_EFFECTS={
 'expanded cargohold i':{cargo:.175},'expanded cargohold ii':{cargo:.275},
 'cargohold optimization i':{cargo:.15},'cargohold optimization ii':{cargo:.20},
 'inertial stabilizers i':{inertia:-.167},'inertial stabilizers ii':{inertia:-.20},
 'nanofiber internal structure i':{inertia:-.131},'nanofiber internal structure ii':{inertia:-.158},
 'low friction nozzle joints i':{inertia:-.117},'low friction nozzle joints ii':{inertia:-.14},
 'polycarbon engine housing i':{inertia:-.091},'polycarbon engine housing ii':{inertia:-.11},
 'hyperspatial velocity optimizer i':{warp:.20},'hyperspatial velocity optimizer ii':{warp:.25},
 'limited hyperspatial accelerator':{warpFlat:.20},
 'experimental hyperspatial accelerator':{warpFlat:.25},
 'prototype hyperspatial accelerator':{warpFlat:.30}
};
api.fitEffects=FIT_EFFECTS;
api.parseEftFit=function(raw){
 const lines=String(raw||'').split(/\r?\n/),head=(lines[0]||'').match(/^\s*\[([^,\]]+)\s*,\s*([^\]]+)\]\s*$/);
 if(!head)throw Error('Paste an EVE Copy to Clipboard EFT fit beginning [Hull, Fit name].');
 const modules=[],unrecognized=[];
 for(const rawLine of lines.slice(1)){
  const line=rawLine.trim().replace(/\s*\/offline\s*$/i,'').replace(/\s+x\d+\s*$/i,'');
  if(!line||line.startsWith('['))continue;
  const key=Object.keys(FIT_EFFECTS).find(k=>line.toLowerCase()===k||line.toLowerCase().endsWith(' '+k));
  if(key)modules.push(key);
  else if(/cargohold|nozzle|hyperspatial|inertia|nanofiber|polycarbon/i.test(line))unrecognized.push(line);
 }
 return {hull:head[1].trim(),name:head[2].trim(),modules,unrecognized};
};
api.shipHullFromESI=function(data){
 const attrs=new Map((data?.dogma_attributes||[]).map(a=>[+a.attribute_id,+a.value]));
 const num=(key,fallback=0)=>Number(attrs.get(key)??fallback)||0;
 return {general:Number(data?.capacity??num(38))||0,mining:num(1556),mineral:num(1558),
  fleet:num(912),mass:Number(data?.mass??num(4))||0,inertia:num(70),warp:num(600),maxSpeed:num(37)};
};
api.shipStats=function(profile,cargoKind='general'){
 if(!profile)return null;
 const base=profile.base||{},modules=Array.isArray(profile.modules)?profile.modules.slice(0,30):[];
 const effects=modules.map(m=>FIT_EFFECTS[String(m).toLowerCase()]).filter(Boolean);
 // Cargo capacity bonuses multiply without a stacking penalty. Specialized
 // holds are not enlarged by ordinary cargo expanders or cargo rigs.
 const cargoMult=effects.reduce((a,e)=>a*(1+(e.cargo||0)),1);
 const stack=(field)=>effects.map(e=>e[field]||0).filter(Boolean).sort((a,b)=>Math.abs(b)-Math.abs(a))
  .reduce((a,n,i)=>a*(1+n*(SHIP_STACK[i]??0)),1);
 const hullSkill=1+(Number(profile.cargoSkillPct)||0)/100;
 const general=(Number(base.general)||0)*cargoMult*hullSkill;
 const mining=(Number(base.mining)||0)*(1+(Number(profile.specialHoldSkillPct)||0)/100);
 const mineral=(Number(base.mineral)||0)*(1+(Number(profile.specialHoldSkillPct)||0)/100);
 const fleet=Number(base.fleet)||0;
 const kind=cargoKind==='ore'||cargoKind==='ice'?'mining':cargoKind==='mineral'?'mineral':'general';
 const capacity=Number(profile.exactCapacity)>0?Number(profile.exactCapacity):
  general+fleet+(kind==='mining'?mining:kind==='mineral'?mineral:0);
 const mass=Number(base.mass)||0,inertia=Number(base.inertia)||0;
 const computedAlign=mass>0&&inertia>0?Math.log(4)*mass*inertia/1e6*stack('inertia'):null;
 const computedWarp=Number(base.warp)>0?(Number(base.warp)+effects.reduce((n,e)=>n+(e.warpFlat||0),0))*stack('warp'):null;
 const align=Number(profile.exactAlign)>0?Number(profile.exactAlign):computedAlign;
 const warp=Number(profile.exactWarp)>0?Number(profile.exactWarp):computedWarp;
 return {capacity:capacity>0?capacity:null,align:align>0?align:null,warp:warp>0?warp:null,
  general,mining,mineral,fleet,kind,source:Number(profile.exactCapacity)>0?'measured':base.general>0?'ESI hull / fit':'unconfigured'};
};
// Warp acceleration/cruise/deceleration model; distance in AU, speed in AU/s.
api.warpSeconds=function(distanceAU,warpAU,maxSubwarp=200){
 const k=+warpAU,d=+distanceAU;if(!(k>0&&d>0))return null;
 const j=Math.min(k/3,2),AU=149597870700,maximum=k*AU,breakAt=AU+maximum/j;
 const peak=d*AU<breakAt?d*AU*k*j/(k+j):maximum;
 const stop=Math.min(100,Math.max(1,+maxSubwarp/2||100));
 const cruise=d*AU>breakAt?(d*AU-breakAt)/maximum:0;
 return Math.max(0,Math.log(Math.max(peak/k,1))/k)+Math.max(0,Math.log(Math.max(peak/stop,1))/j)+cruise;
};
// Estimates clearly identify assumed mean warp distance; they do not claim
// each ESI stargate hop is the same length. Legacy minutes/jump is fallback.
api.shipTravelMinutes=function(jumps,opts){
 if(!(Number.isFinite(+jumps)&&+jumps>=0))return null;
 const ship=opts?.ship,stats=ship&&api.shipStats(ship,opts?.cargoKind||'general');
 if(!stats?.align||!stats?.warp)return (+jumps)*(+opts.minutesPerJump||2);
 const au=Math.max(.1,Math.min(250,+opts.averageAU||20)),gateSec=Math.max(0,+opts.gateSeconds||12);
 const warp=api.warpSeconds(au,stats.warp,+ship.base?.maxSpeed||200);
 const final=api.warpSeconds(Math.max(.1,au/2),stats.warp,+ship.base?.maxSpeed||200);
 // Gate-to-gate warp for every crossing; final station approach after last gate.
 // One local station-to-station warp is assumed for zero-stargate routes.
 return ((+jumps)*(Math.ceil(stats.align)+warp+gateSec)+Math.ceil(stats.align)+final+15)/60;
};
api.formatIsk=function(n,digits=0){return Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(n):'—';};
api.escape=function(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
global.ICLogic=api;
})(typeof window!=='undefined'?window:globalThis);