'use strict';
// Test exact ESI order parity for any region and all documented range values.
const assert=require('node:assert/strict');
require('../market_accuracy.js');
const A=globalThis.ICMarketAccuracy;
const order=(i,extra={})=>({order_id:i,type_id:24305,price:2084000.03,volume_remain:15,volume_total:50,
 min_volume:1,range:'region',location_id:60000011,system_id:30000001,is_buy_order:true,issued:'2026-11-14T00:00:00Z',duration:90,...extra});
for(const range of A.ORDER_RANGES){
 const x=A.normalizeOrder(order(100,{range}),24305);
 assert.equal(x.range,range);
 assert.equal(x.price,2084000.03);
 assert.equal(x.volumeRemain,15);
 assert.equal(x.volumeTotal,50);
 assert.equal(x.minVolume,1);
 assert.equal(x.orderId,100);
}
const bids=A.validateBook([order(11),order(12,{price:2050000,min_volume:10,volume_remain:25}),
 order(13,{price:1900000,min_volume:1,volume_remain:100,volume_total:150})],24305).map(x=>({...x,regionId:10000038}));
assert.equal(A.unitQuote(bids,'bid').price,2084000.03);
assert.equal(A.volumeFill(bids,20,'bid').filled,20); // second 5 units cannot meet min 10, so third order fills the rest
assert.equal(A.volumeFill(bids,20,'bid').full,true); // third order finishes 5 units
assert.equal(A.volumeFill(bids,20,'bid').total,15*2084000.03+5*1900000);
assert.equal(A.eligibility(bids[0],{regionId:10000038,systemId:30000055,locationId:60000099}),'yes');
assert.equal(A.eligibility(bids[0],{regionId:10000002,systemId:30000055,locationId:60000099}),'no');
assert.equal(A.eligibility({...bids[0],range:'station'},{regionId:10000038,systemId:30000001,locationId:60000099}),'no');
assert.equal(A.eligibility({...bids[0],range:'station'},{regionId:10000038,systemId:30000001,locationId:60000011}),'yes');
assert.equal(A.eligibility({...bids[0],range:'solarsystem'},{regionId:10000038,systemId:30000001}),'yes');
assert.equal(A.eligibility({...bids[0],range:'3'},{regionId:10000038,systemId:30000055}),'unknown');
assert.equal(A.eligibility({...bids[0],range:'3'},{regionId:10000038,systemId:30000055,gateDistanceByIssuer:{30000001:3}}),'yes');
assert.equal(A.eligibility({...bids[0],range:'3'},{regionId:10000038,systemId:30000055,gateDistanceByIssuer:{30000001:4}}),'no');
assert.equal(A.eligibility({...bids[0],range:'40'},{regionId:10000038,systemId:30000055,gateDistanceByIssuer:{30000001:33}}),'yes');
assert.equal(A.price(2084000.03),'2,084,000.03');
const ask=A.normalizeOrder(order(21,{is_buy_order:false,price:1000.18,volume_remain:2,min_volume:1}),24305);
const qty=A.bestStationFill([ask,...bids],3,'ask');
assert.equal(qty.full,false);
assert.equal(qty.filled,2);
assert.equal(A.regionSummary([ask,...bids],{id:10000038,name:'The Bleak Lands'}).bidCount,3);
const structure=A.normalizeOrder(order(22,{location_id:10537907513596,price:4338000}),24305);
assert.equal(structure.isStructure,true);
assert.equal(A.regionSummary([structure,...bids],{id:1,name:'Demo'},'npc').bidCount,3);
assert.throws(()=>A.validateBook([order(21),order(22,{range:'invented'})],24305),/invalid/);
assert.equal(A.validateBook([order(21),order(21)],24305).length,1);
console.log('PASS every documented range, exact ESI amounts/volumes, min volume, quantity fills, regional delivery eligibility, NPC-only and duplicate orders');
