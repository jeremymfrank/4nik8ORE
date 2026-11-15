'use strict';
// Mobile first-launch regression: ores must be searchable and tappable before
// a 20k+ item ESI market-group index has finished downloading.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','resource_catalog.js'),'utf8');
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{
  id,value:'',textContent:'',innerHTML:'',children:[],options:[],
  listeners:{},selectedOptions:[],disabled:false,
  appendChild(child){this.children.push(child);if(this.id==='resourcePick')this.options.push(child);return child;},
  replaceChildren(...kids){this.children=[...kids];},
  addEventListener(kind,fn){this.listeners[kind]=fn;},
  setAttribute(k,v){this[k]=v;}
 });
 return elements.get(id);
}
const document={
 getElementById:el,
 createElement(tag){return {tagName:tag,type:'',className:'',children:[],textContent:'',
  attributes:{},listeners:{},appendChild(child){this.children.push(child);return child;},
  setAttribute(k,v){this.attributes[k]=v;},
  addEventListener(kind,fn){this.listeners[kind]=fn;}};}
};
const storage=new Map(),localStorage={
 getItem:k=>storage.get(k)??null,
 setItem:(k,v)=>storage.set(k,String(v))
};
const handlers=new Map();
let catalogReady=false,loadFullCalled=false;
const fullCatalog=[
 {id:1232,name:'Dark Ochre',group:'Dark Ochre',path:'Raw Materials > Standard Ores > Dark Ochre'},
 {id:1227,name:'Omber',group:'Omber',path:'Raw Materials > Standard Ores > Omber'}
];
const market={
 familyOf(item){return item.path.includes('Ice')?'ice':'ore';},
 resourceItems(mode='both'){return catalogReady?fullCatalog:[];},
 catalogState(){return {count:catalogReady?20070:0,complete:catalogReady};},
 compressedFor(){return null;},
 loadCatalog(){loadFullCalled=true;throw Error('Full index should not block valid ESI quick start ore');},
 async esi(){return {volume:8};}
};
const win={
 ICAndroid:{},ICMarketExplorer:market,
 CustomEvent:class{constructor(type){this.type=type;}},
 addEventListener:(kind,fn)=>handlers.set(kind,fn),
 dispatchEvent:event=>{handlers.get(event.type)?.(event);}
};
new Function('window','document','localStorage',source)(win,document,localStorage);
const B=win.ICResourceBrowser;
(async()=>{
 el('resourceFilter').value='Dark';
 B.init('both');
 assert(el('resourcePick').options.some(x=>x.textContent.includes('Dark Ochre')));
 assert(el('androidResourceChoices').children.length>0);
 const choices=el('androidResourceChoices').children.find(x=>x.className==='android-resource-matches');
 assert(choices,'Android tap list rendered');
 const target=choices.children.find(x=>x.textContent.includes('Dark Ochre'));
 assert(target,'Dark Ochre visible from starter index');
 target.listeners.click();
 assert.deepEqual(B.selected(),[1232]);
 const result=await B.loadResources('both');
 assert.equal(result.length,1);
 assert.equal(result[0].name,'Dark Ochre');
 assert.equal(result[0].volume,8);
 assert.equal(loadFullCalled,false,'Full index not required for the starter item live ESI quote');
 assert(el('resourceCatalogStatus').textContent.includes('QUICK START'));
 catalogReady=true;
 handlers.get('ic-market-catalog-updated')();
 assert(B.selected().includes(1232),'Live catalog must not replace intentional first-run choice');
 assert(el('resourceCatalogStatus').textContent.includes('selected'));
 console.log('PASS Android first-run Dark Ochre search, one-tap selection, immediate ESI quote, background full catalog transition');
})().catch(e=>{console.error(e);process.exitCode=1;});
