const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const c={console,URL,Intl};vm.createContext(c);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','logic.js'),'utf8'),c);
const L=c.ICLogic;
const opts={capacity:1000,taxPct:7.5,cashPerJump:50000,minutesPerJump:2,pilotISKHour:0};
const quote={gross:10000000,filled:100,units:100,full:true,coverage:1};
// Compressed form is one unit per raw unit, but its physical volume is much smaller.
const compressed=L.freightEstimate(quote,3,1,5000,opts);
const raw=L.freightEstimate(quote,3,100,5000,opts);
assert.equal(compressed.shippedM3,100);
assert.equal(compressed.trips,1);
assert.equal(compressed.totalJumpLegs,3);
assert.equal(compressed.salesTax,750000);
assert.equal(compressed.net,9100000);
assert.equal(raw.shippedM3,10000);
assert.equal(raw.trips,10);
assert.equal(raw.totalJumpLegs,57);
assert.equal(raw.net,6400000);
// Missing route must not be assigned zero cost.
assert.equal(L.freightEstimate(quote,null,1,5000,opts),null);
assert.equal(L.freightEstimate(quote,NaN,1,5000,opts),null);
assert.equal(L.freightEstimate(quote,3,null,5000,opts),null);
assert.equal(L.freightEstimate(quote,3,1,5000,{...opts,capacity:0}),null);
// Estimated opportunity cost of piloting can be specified separately from cash cost.
const valued=L.freightEstimate(quote,3,1,5000,{...opts,pilotISKHour:1200000});
assert.equal(valued.travelMinutes,6);
assert.equal(valued.timeCost,120000);
assert.equal(valued.net,8980000);
// A partial buy order must not claim to buy the entire load.
const partial=L.freightEstimate({...quote,filled:30,full:false,gross:3000000},3,1,5000,opts);
assert.equal(partial.full,false);
assert.equal(partial.shippedM3,30);
// Existing station-specific order depth still never combines multiple stations.
const two=[{is_buy_order:true,location_id:60000001,system_id:30000001,price:100,volume_remain:3,min_volume:1},{is_buy_order:true,location_id:60000002,system_id:30000002,price:500,volume_remain:3,min_volume:1},{is_buy_order:true,location_id:60000001,system_id:30000001,price:90,volume_remain:5,min_volume:1}];
const quotes=L.rankStationQuotesAll(two,8,2);
assert.equal(quotes[0].gross,750);
assert.equal(quotes[0].full,true);
assert.equal(quotes[1].full,false);
console.log('PASS: raw/compressed physical haul volumes, multi-trip returns, tax, cost/time, partial fills and per-station depth.');