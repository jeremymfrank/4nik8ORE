'use strict';
// Deterministic offline regression tests for v0.5 ship fitting and freight math.
// Run: node tests/ship.test.js
const assert=require('node:assert/strict');
require('../logic.js');
const L=globalThis.ICLogic;
const ship={
 name:'Test Miasmos',hull:'Miasmos',
 base:{general:550,mining:42000,mineral:0,fleet:0,mass:12975000,inertia:.94,warp:3.5,maxSpeed:120},
 modules:['expanded cargohold ii','cargohold optimization i','hyperspatial velocity optimizer i','low friction nozzle joints i']
};
const ore=L.shipStats(ship,'ore'),general=L.shipStats(ship,'general');
assert(ore.capacity>42000);
assert(general.capacity<1000);
assert(ore.capacity>general.capacity);
assert(ore.align>0&&ore.warp>ship.base.warp);
assert(L.warpSeconds(80,ore.warp)>L.warpSeconds(5,ore.warp));
assert(L.warpSeconds(80,5)<L.warpSeconds(80,3));
assert(L.shipTravelMinutes(12,{ship,cargoKind:'ore',averageAU:80}) >
       L.shipTravelMinutes(12,{ship,cargoKind:'ore',averageAU:5}));
const exact={...ship,exactCapacity:50000,exactCapacityKind:'mining'};
assert.equal(L.shipStats(exact,'ore').capacity,50000);
assert.equal(L.shipStats(exact,'general').capacity,general.capacity);
const mineral={...ship,base:{...ship.base,mineral:30000}};
assert.equal(L.shipStats(mineral,'mineral').capacity,30000+general.capacity);
const parsed=L.parseEftFit('[Tayra, My Cargo Fit]\nExpanded Cargohold II\nMedium Hyperspatial Velocity Optimizer I\nUnknown Module');
assert.equal(parsed.hull,'Tayra');
assert.equal(parsed.name,'My Cargo Fit');
assert.deepEqual(parsed.modules,['expanded cargohold ii','hyperspatial velocity optimizer i']);
const quote={gross:5000000,filled:10000,full:true};
const shared={taxPct:7.5,cashPerJump:0,minutesPerJump:2,pilotISKHour:0};
const manual=L.freightEstimate(quote,12,4,40000,{...shared,capacity:20000});
const fitted=L.freightEstimate(quote,12,4,40000,{...shared,capacity:ore.capacity,ship,cargoKind:'ore',averageAU:20});
assert.equal(manual.trips,2);
assert.equal(fitted.trips,1);
assert.equal(manual.travelMinutes,72);
assert(fitted.travelMinutes>0&&fitted.travelMinutes<manual.travelMinutes);
assert.equal(fitted.salesTax,375000);
const miningProfile={oreYield:1000,oreCycle:180,oreModules:2,uptimePct:80,
 observedOreM3Hour:null,observedIceM3Hour:null,handlingMinutes:5,returnHome:true};
const item={name:'Omber',volume:40000,units:10000};
const est=L.miningPerformance(item,{quote,estimate:fitted},miningProfile,{...shared,ship,cargoKind:'ore',averageAU:20},'ore');
assert(est?.allInIskHour>0);
assert(est.allInIskHour<est.miningIskHour);
assert(est.travelMinutes>fitted.travelMinutes);
const fallback=L.shipTravelMinutes(12,{minutesPerJump:2,ship:null});
assert.equal(fallback,24);
console.log('PASS ship holds, EFT, rigs, align, warp acceleration, trips, fallback and mining all-in ISK/hour');
