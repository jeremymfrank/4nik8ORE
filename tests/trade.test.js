'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const context={URL,console};context.window=context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../logic.js'),'utf8'),context);
const L=context.ICLogic;
const market=[
 {is_buy_order:false,location_id:60001001,system_id:30000001,price:100,volume_remain:100,min_volume:1},
 {is_buy_order:false,location_id:60001001,system_id:30000001,price:110,volume_remain:100,min_volume:1},
 {is_buy_order:false,location_id:60001002,system_id:30000002,price:1,volume_remain:1,min_volume:1},
 {is_buy_order:true,location_id:60001003,system_id:30000003,price:175,volume_remain:100,min_volume:1},
 {is_buy_order:true,location_id:60001003,system_id:30000003,price:150,volume_remain:100,min_volume:1},
 {is_buy_order:true,location_id:60001004,system_id:30000004,price:99999,volume_remain:1,min_volume:1},
 {is_buy_order:false,location_id:1020000000000,system_id:30000005,price:0.01,volume_remain:10000000,min_volume:1},
 {is_buy_order:true,location_id:1020000000001,system_id:30000006,price:100000,volume_remain:10000000,min_volume:1},
];
const sell=L.tradeStationBooks(market,'sell'),buy=L.tradeStationBooks(market,'buy');
assert.equal(sell.length,2,'ignore structure sell orders');
assert.equal(buy.length,2,'ignore structure buy orders');
assert.equal(sell.find(x=>x.locationId===60001001).units,200);
const s=sell.find(x=>x.locationId===60001001),b=buy.find(x=>x.locationId===60001003);
const quote=L.tradeQuote(s,b,{capacity:100,unitVolume:1,budget:10000,taxPct:7.5});
assert.equal(quote.units,100);
assert.equal(quote.cost,10000);
assert.equal(quote.revenue,17500);
assert.equal(quote.salesTax,1312.5);
assert.equal(quote.cashProfit,6187.5);
assert.equal(quote.sourceId,60001001);
assert.equal(quote.destId,60001003);
const smallBudget=L.tradeQuote(s,b,{capacity:100,unitVolume:1,budget:490,taxPct:7.5});
assert.equal(smallBudget.units,4);
assert.equal(smallBudget.cost,400);
assert.equal(smallBudget.cashProfit,4*(175*.925-100));
const noMargin=L.tradeQuote(s,b,{capacity:100,unitVolume:1,budget:10000,taxPct:50});
assert.equal(noMargin,null,'never recommend negative after-tax spread');
assert.equal(L.tradeQuote(s,s,{capacity:100,unitVolume:1,budget:10000,taxPct:7.5}),null,'no sale to own pickup station');
const minBuyer=L.tradeStationBooks([{is_buy_order:true,location_id:60001008,system_id:30000008,price:175,volume_remain:100,min_volume:8}],'buy')[0];
assert.equal(L.tradeQuote(s,minBuyer,{capacity:100,unitVolume:1,budget:490,taxPct:7.5}),null,'enforce buyer minimum order size');
const weighted=L.tradeQuote(s,b,{capacity:200,unitVolume:1,budget:25000,taxPct:7.5});
assert.equal(weighted.units,200);assert.equal(weighted.cost,100*100+100*110);assert.equal(weighted.revenue,100*175+100*150);
console.log('PASS: NPC station grouping; cash budget; cargo capacity; depth-weighted buy/sell; tax; minimum volumes; negative spreads; no cross-station mixing');