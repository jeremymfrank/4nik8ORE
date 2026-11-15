'use strict';
// Regression for the Android scrolling trap in native multi-select resource UI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('android.css'),html=read('index.html'),bridge=read('android_bridge.js');
assert(html.includes('id="androidResourceChoices"'),'Mobile resource target required');
assert(css.includes('body.android-app #resourcePick{display:none!important}'),
  'Android must not render the swipe-trapping native multi-select');
assert(css.includes('overflow-y:auto!important;'),'Android app viewport must scroll');
assert(css.includes('height:100%;max-height:100%;min-height:0;'),'Viewport has bounded scroll height');
assert(css.includes('padding-bottom:calc(116px + env(safe-area-inset-bottom, 0px))'),
  'Last items must be accessible above fixed navigation');
assert(bridge.includes('pane.scrollTop=0'),'Tab changes reset the actual scrolling element');
assert(css.includes('body.android-app .trade-results,'),'Trade results must not trap vertical gestures');
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.attributes={};
  this.value='';this.textContent='';this.className='';this.options=[];this.disabled=false;}
 appendChild(child){this.children.push(child);if(child.tag==='option')this.options.push(child);return child;}
 replaceChildren(...children){this.children=children;this.options=children.filter(x=>x.tag==='option');}
 addEventListener(name,callback){this.events[name]=callback;}
 setAttribute(name,value){this.attributes[name]=String(value);}
 set innerHTML(value){this.children=[];this.options=[];this._html=value;}
 get innerHTML(){return this._html||'';}
}
const ids=new Map(['resourcePick','resourceFilter','androidResourceChoices','resourceCatalogStatus',
 'resourceCatalogLoad','resourcePickMatches','resourcePickClear'].map(id=>[id,new Node()]));
const local=new Map();
const items=[
 {id:101,name:'Dark Ochre',group:'Asteroid Ores',path:'Asteroid Ores'},
 {id:102,name:'Veldspar',group:'Asteroid Ores',path:'Asteroid Ores'},
 {id:103,name:'Cobaltite',group:'Moon Ores',path:'Moon Ores'}
];
const window={
 ICAndroid:{},ICMarketExplorer:{
  resourceItems(mode){return mode==='moon'?items.filter(x=>x.id===103):items;},
  familyOf(item){return item.id===103?'moon':'ore';},
  catalogState(){return {count:25000,complete:false}}
 },
 addEventListener(){},dispatchEvent(){},CustomEvent:class{constructor(type){this.type=type;}}
};
const document={getElementById:id=>ids.get(id),createElement:tag=>new Node(tag)};
const localStorage={getItem:key=>local.get(key)??null,setItem:(key,val)=>local.set(key,val)};
new Function('window','document','localStorage',read('resource_catalog.js'))(window,document,localStorage);
window.ICResourceBrowser.init();
let host=ids.get('androidResourceChoices');
function findButtons(root){
 let all=[];for(const child of root.children){
  if(child.tag==='button')all.push(child);
  all.push(...findButtons(child));
 }
 return all;
}
let buttons=findButtons(host);
assert.equal(buttons.filter(x=>x.className.startsWith('android-resource-choice')).length,3);
buttons.find(x=>x.textContent.includes('Dark Ochre')).events.click();
assert.deepEqual(window.ICResourceBrowser.selected(),[101]);
assert.deepEqual(JSON.parse(local.get('4nik8.resource.selection.v1')),[101]);
ids.get('resourceFilter').value='vel';
ids.get('resourceFilter').events.input();
buttons=findButtons(host).filter(x=>x.className.startsWith('android-resource-choice'));
assert.equal(buttons.length,1);
assert(buttons[0].textContent.includes('Veldspar'));
buttons[0].events.click();
assert.deepEqual(window.ICResourceBrowser.selected(),[101,102]);
assert(findButtons(host).some(x=>x.className==='android-resource-chip'&&x.textContent.includes('Dark Ochre')),
 'Selected ore remains visible and removable while searching another resource');
const chip=findButtons(host).find(x=>x.className==='android-resource-chip'&&x.textContent.includes('Dark Ochre'));
chip.events.click();
assert.deepEqual(window.ICResourceBrowser.selected(),[102]);
console.log('PASS Android vertical scroll layout and selectable resource buttons/chips without a native multi-select trap');
