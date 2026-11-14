/* 4NIK8 ORE · public market-order fidelity and executable-volume arithmetic */
(function(global){
'use strict';
const api={};
const RANGES=new Set(['station','solarsystem','region','1','2','3','4','5','10','20','30','40']);
api.ORDER_RANGES=RANGES;
api.rangeLabel=function(value){
 const text=String(value??'').toLowerCase();
 return text==='station'?'Station':text==='solarsystem'?'Solar System':text==='region'?'Region':
  /^\d+$/.test(text)&&RANGES.has(text)?text+' jumps':'Unknown ('+text+')';
};
api.isStructure=function(locationId){
 return Number(locationId)>=1000000000000;
};
api.isNpcStation=function(locationId){
 const id=Number(locationId);return id>=60000000&&id<64000000;
};
api.normalizeOrder=function(o,expectedTypeId){
 if(!o||typeof o!=='object')return null;
 const id=Number(o.order_id),price=Number(o.price),units=Number(o.volume_remain),
  initial=Number(o.volume_total),min=Number(o.min_volume),
  location=Number(o.location_id),system=Number(o.system_id),type=Number(o.type_id),
  range=String(o.range??'').toLowerCase();
 if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(price)||price<=0||
  !Number.isSafeInteger(units)||units<1||!Number.isSafeInteger(initial)||initial<units||
  !Number.isSafeInteger(min)||min<1||min>initial||!Number.isSafeInteger(location)||location<1||
  !Number.isSafeInteger(system)||system<1||!Number.isSafeInteger(type)||type<1||
  (expectedTypeId&&type!==Number(expectedTypeId))||
  typeof o.is_buy_order!=='boolean'||!RANGES.has(range))return null;
 return {orderId:id,typeId:type,price,volumeRemain:units,volumeTotal:initial,minVolume:min,
  range,locationId:location,systemId:system,isBuy:o.is_buy_order,
  issued:typeof o.issued==='string'?o.issued:'',duration:Number.isFinite(+o.duration)?+o.duration:null,
  isStructure:api.isStructure(location),isNpcStation:api.isNpcStation(location)};
};
api.validateBook=function(rows,typeId){
 if(!Array.isArray(rows))throw Error('ESI region response was not a list of orders');
 const parsed=[],seen=new Set();
 for(let i=0;i<rows.length;i++){
  const order=api.normalizeOrder(rows[i],typeId);
  if(!order)throw Error('ESI returned incomplete/invalid order fields at row '+(i+1)+'; region not ranked');
  if(seen.has(order.orderId))continue; // overlapping page duplicates never inflate volume
  seen.add(order.orderId);parsed.push(order);
 }
 return parsed;
};
api.orderFitsFilter=function(o,filter){
 return filter!=='npc'||o.isNpcStation;
};
// Ranged buy orders may be fulfilled from a delivery station different from
// their issuing station. Validate only with known EVE location/route evidence.
// Unknown is intentionally distinct from false.
api.eligibility=function(order,delivery){
 if(!order?.isBuy||!delivery||!Number.isFinite(+delivery.regionId))return 'unknown';
 if(+delivery.regionId!==+order.regionId)return 'no';
 if(!Number.isSafeInteger(+delivery.locationId)||+delivery.locationId<1)return 'unknown'; // choose an actual delivery station before claiming eligibility
 const range=order.range;
 if(range==='region')return 'yes';
 if(range==='station')return Number(delivery.locationId)>0?
  (+delivery.locationId===+order.locationId?'yes':'no'):'unknown';
 if(range==='solarsystem')return Number(delivery.systemId)>0?
  (+delivery.systemId===+order.systemId?'yes':'no'):'unknown';
 if(!RANGES.has(range))return 'unknown';
 if(+delivery.systemId===+order.systemId&&+delivery.systemId>0)return 'yes';
 const jumps=delivery.gateDistanceByIssuer?.[order.systemId];
 if(!Number.isInteger(jumps)||jumps<0)return 'unknown';
 // route distance should be computed on a within-region stargate path
 return jumps<=Number(range)?'yes':'no';
};
api.unitQuote=function(orders,side,filter='all'){
 const qualifying=orders.filter(o=>o.isBuy===(side==='bid')&&api.orderFitsFilter(o,filter));
 qualifying.sort((a,b)=>side==='bid'?b.price-a.price:a.price-b.price);
 return qualifying[0]||null;
};
api.volumeFill=function(orders,quantity,side,filter='all',delivery=null){
 const wanted=Math.floor(+quantity);
 if(!Number.isSafeInteger(wanted)||wanted<1)return null;
 let eligible=orders.filter(o=>o.isBuy===(side==='bid')&&api.orderFitsFilter(o,filter));
 if(side==='bid'&&delivery)eligible=eligible.filter(o=>api.eligibility(o,delivery)==='yes');
 eligible.sort((a,b)=>side==='bid'?b.price-a.price:a.price-b.price);
 let remain=wanted,revenue=0;const legs=[];
 for(const o of eligible){
  if(remain===0)break;
  const count=Math.min(remain,o.volumeRemain);
  if(count<o.minVolume)continue;
  remain-=count;revenue+=count*o.price;
  legs.push({orderId:o.orderId,units:count,price:o.price,locationId:o.locationId,range:o.range,
   minVolume:o.minVolume,systemId:o.systemId});
 }
 const filled=wanted-remain;
 if(!filled)return null;
 return {requested:wanted,filled,full:filled===wanted,coverage:filled/wanted,
  total:revenue,average:revenue/filled,legs};
};
// A station-only quantity quote cannot aggregate orders from multiple stations.
api.bestStationFill=function(orders,quantity,side,filter='all'){
 const groups=new Map();
 for(const order of orders){
  if(order.isBuy!==(side==='bid')||!api.orderFitsFilter(order,filter))continue;
  const key=order.locationId;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(order);
 }
 const candidates=[];
 for(const [locationId,book] of groups){
  const fill=api.volumeFill(book,quantity,side,filter);
  if(fill)candidates.push({...fill,locationId,systemId:book[0].systemId,
   range:book.find(x=>x.orderId===fill.legs[0].orderId)?.range,
   isNpcStation:book[0].isNpcStation,
   isStructure:book[0].isStructure});
 }
 candidates.sort((a,b)=>Number(b.full)-Number(a.full)||
  (side==='bid'?b.total-a.total:a.total-b.total)||
  (side==='bid'?b.filled-a.filled:a.filled-b.filled));
 return candidates[0]||null;
};
api.regionSummary=function(orders,region,filter='all'){
 const visible=orders.filter(o=>api.orderFitsFilter(o,filter));
 const asks=visible.filter(o=>!o.isBuy),bids=visible.filter(o=>o.isBuy);
 const by=(rows,ascending)=>rows.slice().sort((a,b)=>ascending?a.price-b.price:b.price-a.price);
 const ask=by(asks,true)[0]||null,bid=by(bids,false)[0]||null;
 return {...region,orders:visible,ask,bid,askCount:asks.length,bidCount:bids.length,
  askVolume:asks.reduce((v,o)=>v+o.volumeRemain,0),bidVolume:bids.reduce((v,o)=>v+o.volumeRemain,0)};
};
api.price=function(value){
 return Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
};
global.ICMarketAccuracy=api;
})(typeof window!=='undefined'?window:globalThis);
