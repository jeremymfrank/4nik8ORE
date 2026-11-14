'use strict';
// Test the simple-mode layout and preservation of optional expert controls.
// Run: node tests/simple_ui.test.js
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const market=fs.readFileSync(path.join(root,'market_explorer.js'),'utf8');
for(const id of ['shipQuickStats','shipCatalogSearch','shipCatalogResults','shipCatalogAdd',
 'shipLibrarySelect','shipFitAdvanced','shipManualBase','shipFetch','shipSave','shipImport',
 'marketAuditRegion','marketAuditTable','freightShipSelect','oreShipSelect','tradeShipSelect',
 'miningShipSelect','resourceCatalogLoad','refreshButton','testYouTubeEmbed']){
 assert(html.includes('id="'+id+'"'),'Missing control '+id);
}
for(const area of ['ship-advanced','ship-technical','ship-maintenance-tools',
 'freight-advanced','market-order-audit','resource-maintenance','scan-maintenance',
 'market-catalog-maintenance','radio-test-options']){
 assert(html.includes('<details class="'+area+'"'),'Expected collapsed optional section '+area);
}
assert(html.includes('ADD THIS SHIP'));
assert(html.includes('SEARCH BY SHIP NAME OR CLASS'));
assert(html.includes('CUSTOMIZE MY FIT'));
assert(!html.includes('BEST QUOTED OPPORTUNITY'),'Best resource banner must not repeat top opportunity');
assert(!html.includes('<div class="headline">'),'No duplicate headline banner');
assert(html.indexOf('id="shipQuickStats"')<html.indexOf('id="shipGeneral"'));
assert(html.indexOf('id="shipFitAdvanced"')<html.indexOf('id="shipGeneral"'));
assert(html.indexOf('id="shipFitAdvanced"')<html.indexOf('id="shipEft"'));
assert(html.indexOf('class="market-order-audit"')<html.indexOf('id="marketAuditTable"'));
assert.equal((html.match(/<details\b/g)||[]).length,(html.match(/<\/details>/g)||[]).length);
assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length);
assert(app.includes('function ensureHullAttributes('),'Ship data must hydrate without a manual button');
assert(app.includes('function shipQuickSummary('));
assert(app.includes('shipLibrary.push(p);shipMenus();'),'One-click imported EFT saves profile');
assert(market.includes('loadCatalog(false).catch('),'Market catalog sync on first use without technical button');
assert(css.includes('.ship-stat-cards'));
assert(css.includes('.freight-selected'));
console.log('PASS v0.6.2 simple-mode layout: automatic hull data, no repeat banners, optional diagnostics, intact expert controls and responsive styles');
