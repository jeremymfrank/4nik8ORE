'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const context={URL,console};context.window=context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../logic.js'),'utf8'),context);
const parse=s=>context.ICLogic.parseYouTubePlaylistUrl(s);
const id='PL1234567890abcdefghij';
assert.equal(parse('https://music.youtube.com/playlist?list='+id+'&si=something').playlistId,id);
assert.equal(parse('https://music.youtube.com/watch?v=abcdefghijk&list='+id).playlistId,id);
assert.equal(parse('https://www.youtube.com/playlist?list='+id).playlistId,id);
assert.equal(parse('https://music.youtube.com/playlist?list=PLRyHdbzeN03A').playlistId,'PLRyHdbzeN03A');
assert.equal(parse('https://music.youtube.com/playlist?list=PLfXw8cc_z-vY&si=keep-share-link').shareUrl,'https://music.youtube.com/playlist?list=PLfXw8cc_z-vY&si=keep-share-link');
assert.equal(parse('https://music.youtube.com/browse/VL'+id).playlistId,id);
assert.equal(parse('https://youtube.com/watch?list='+id+'&v=abcdefghijk').canonicalUrl,'https://music.youtube.com/playlist?list='+id);
assert.throws(()=>parse('https://music.youtube.com/watch?v=abcdefghijk'),/No usable playlist ID/);
assert.throws(()=>parse('https://example.com/playlist?list='+id),/Only shared YouTube/);
assert.throws(()=>parse('http://music.youtube.com/playlist?list='+id),/HTTPS/);
assert.throws(()=>parse('https://music.youtube.com/playlist?list=LM'),/No usable playlist ID/);
console.log('Playlist link normalization: 9 passing assertions');

// Cross-region scanner must never combine distinct buyer stations into a fictitious sale.
const orders=[
 {is_buy_order:true,location_id:60000001,system_id:30000001,price:100,volume_remain:3,min_volume:1},
 {is_buy_order:true,location_id:60000002,system_id:30000002,price:500,volume_remain:3,min_volume:1},
 {is_buy_order:true,location_id:60000001,system_id:30000001,price:90,volume_remain:5,min_volume:1},
];
const quotes=context.ICLogic.rankStationQuotesAll(orders,8,2);
assert.equal(quotes[0].locationId,60000001);
assert.equal(quotes[0].gross,3*100+5*90);
assert.equal(quotes[0].full,true);
assert.equal(quotes[0].systemId,30000001);
assert.equal(quotes[1].full,false);
assert.equal(quotes[1].gross,3*500);
assert.equal(context.ICLogic.rankStationQuotes(orders,8,2).locationId,60000001);
console.log('Cross-regional station-depth ranking: passing');