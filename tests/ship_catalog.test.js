'use strict';
// Offline mocked ESI catalog regression. Run: node tests/ship_catalog.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
require('../logic.js');
const logic=globalThis.ICLogic;
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const anchor='settingsManager.load().finally(()=>{shipInit();liveryInit();radioInit();miningInit();});';
assert(app.includes(anchor),'App startup hook changed; update this regression test');
const testApp=app.replace(anchor,
 'window.__test={shipCatalogInit,shipInit,fetchShipCatalog,addShipFromCatalog,catalogCsv,getLibrary:()=>shipLibrary,getCatalog:()=>shipCatalog,getSelections:()=>selectedShips};');
const elements=new Map();
function element(id){
 if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,
  checked:false,readOnly:false,listeners:{},addEventListener(t,cb){this.listeners[t]=cb;},
  classList:{add(){},remove(){}},querySelectorAll(){return [];}});
 return elements.get(id);
}
const document={getElementById:element,querySelectorAll(){return [];}};
const store=new Map(),localStorage={getItem(k){return store.get(k)??null;},setItem(k,v){store.set(k,String(v));}};
const known={
 category:{category_id:6,name:'Ship',groups:[20,21]},
 mining:{category_id:6,group_id:20,name:'Mining Barge',published:true,types:[17480,17481]},
 industrial:{category_id:6,group_id:21,name:'Industrial',published:true,types:[649]},
 names:[{id:17480,name:'Retriever'},{id:17481,name:'Procurer'},{id:649,name:'Badger'}],
 procurer:{name:'Procurer',group_id:20,published:true,mass:11000000,capacity:350,
  dogma_attributes:[{attribute_id:70,value:.6},{attribute_id:600,value:3}]}
};
const calls=[];
async function fetch(url){
 calls.push(String(url));
 let value;
 if(url.includes('/universe/categories/6'))value=known.category;
 else if(url.includes('/universe/groups/20'))value=known.mining;
 else if(url.includes('/universe/groups/21'))value=known.industrial;
 else if(url.includes('/universe/names'))value=known.names;
 else if(url.includes('/universe/types/17481'))value=known.procurer;
 else throw Error('Unexpected mocked ESI call '+url);
 return {ok:true,json:async()=>value};
}
const win={ICLogic:logic};
new Function('window','document','fetch','localStorage','setTimeout','clearTimeout','AbortController',testApp)(
 win,document,fetch,localStorage,(fn,ms)=>{if(ms<500)fn();return 1;},()=>{},
 class {abort(){}get signal(){return {};}}
);
(async()=>{
 assert.equal(win.__test.getCatalog().length,0);
 await win.__test.shipCatalogInit(); // ESI fetch starts automatically on first use.
 win.__test.shipInit(); // On a cached startup, no additional category fetch occurs.
 assert.equal(win.__test.getLibrary().find(p=>p.id==='retriever').name,'Retriever');
 assert.deepEqual(win.__test.getCatalog().map(s=>s.name),['Badger','Procurer','Retriever']);
 const completeCsv=win.__test.catalogCsv();
 assert(completeCsv.includes('"17481","Procurer","Mining Barge"'));
 assert(completeCsv.includes('"649","Badger","Industrial"'));
 assert.equal(completeCsv.trim().split(/\r?\n/).length,4);
 assert.equal(element('shipCatalogExport').disabled,false);
 assert(store.has('4nik8.ship.catalog.v1'));
 assert(element('freightShipSelect').innerHTML.includes('catalog:17481'));
 const p=await win.__test.addShipFromCatalog(17481);
 assert.equal(p.name,'Procurer');
 assert.equal(p.base.warp,3);
 assert(logic.shipStats(p,'general').align>0);
 assert.equal(win.__test.getLibrary().filter(x=>x.hull==='Procurer').length,1);
 // Each section retains its own selection, including one just loaded from the full catalog.
 element('oreShipSelect').value=p.id;
 await element('oreShipSelect').listeners.change();
 assert.equal(win.__test.getSelections().ore,p.id);
 assert.equal(win.__test.getSelections().trade,'manual');
 assert.equal(win.__test.getSelections().freight,'manual');
 assert(calls.some(url=>url.includes('/universe/categories/6')));
 console.log('PASS auto ESI ship catalog, complete CSV export, neutral defaults, hull attributes, independent selectors and cached catalog');
})().catch(error=>{console.error(error);process.exitCode=1;});
