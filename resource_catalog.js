/* 4NIK8 – resource browsing through the full market-catalog ESI item index */
(function(global){
'use strict';
const $=id=>document.getElementById(id);
const KEY='4nik8.resource.selection.v1', MAX_SELECTED=12;
let selected=new Set(),mode='both',firstLaunch=false,lastCatalogProgress='';
// These EVE type IDs are a limited first-launch starter set, not a substitute
// for the full ESI-derived catalog. The full index replaces the browse list
// when it is ready; each item is still verified via ESI before quoting prices.
const QUICK_START=[
 {id:1232,name:'Dark Ochre',path:'Raw Materials > Standard Ores > Dark Ochre',group:'Dark Ochre'},
 {id:17437,name:'Dark Ochre III-Grade',path:'Raw Materials > Standard Ores > Dark Ochre',group:'Dark Ochre'},
 {id:1224,name:'Pyroxeres',path:'Raw Materials > Standard Ores > Pyroxeres',group:'Pyroxeres'},
 {id:17460,name:'Pyroxeres III-Grade',path:'Raw Materials > Standard Ores > Pyroxeres',group:'Pyroxeres'},
 {id:1229,name:'Gneiss',path:'Raw Materials > Standard Ores > Gneiss',group:'Gneiss'},
 {id:1227,name:'Omber',path:'Raw Materials > Standard Ores > Omber',group:'Omber'},
 {id:16262,name:'Clear Icicle',path:'Raw Materials > Ice Ores',group:'Ice Ores'}
];
function browseItems(mode='both'){
 if(market().catalogState().count)return market().resourceItems(mode);
 const allowed=mode==='both'?new Set(['ore','moon','ice']):mode==='ore'?new Set(['ore','moon']):new Set([mode]);
 return QUICK_START.filter(x=>allowed.has(family(x))).sort((a,b)=>a.name.localeCompare(b.name));
}
function market(){return global.ICMarketExplorer;}
function family(item){return market().familyOf(item);}
function filtered(){
 const search=$('resourceFilter').value.trim().toLowerCase();
 return browseItems(mode).filter(x=>!search||x.name.toLowerCase().includes(search)||x.group.toLowerCase().includes(search));
}
function save(){
 firstLaunch=false;
 try{localStorage.setItem(KEY,JSON.stringify([...selected]));}catch(_){}
 if(typeof global.CustomEvent==='function')
  global.dispatchEvent(new global.CustomEvent('ic-resource-selection-changed'));
}
// The native <select multiple> consumes Android touch swipes. Keep it only
// for desktop; Android gets ordinary tap buttons without a nested scroll box.
function touchResourcePicker(visible){
 const host=$('androidResourceChoices');
 if(!host||!global.ICAndroid)return;
 host.replaceChildren();
 const catalog=browseItems('both');
 const byId=new Map(catalog.map(item=>[item.id,item]));
 const chosen=[...selected].map(id=>byId.get(id)).filter(Boolean);
 const header=document.createElement('div');
 header.className='android-resource-picked-heading';
 header.textContent='SELECTED FOR NEXT SCAN · '+chosen.length+'/'+MAX_SELECTED;
 host.appendChild(header);
 const picked=document.createElement('div');
 picked.className='android-resource-picked';
 if(!chosen.length){
  const hint=document.createElement('p');
  hint.textContent='Nothing selected. Tap resource names below to add them.';
  picked.appendChild(hint);
 }
 function button(item,removeChip=false){
  const node=document.createElement('button');
  node.type='button';
  const pickedNow=selected.has(item.id);
  node.className=removeChip?'android-resource-chip':'android-resource-choice'+(pickedNow?' selected':'');
  node.textContent=(removeChip?'× ':'')+(pickedNow&&!removeChip?'✓ ':'')+item.name+
    (removeChip?'':' · '+family(item).toUpperCase());
  node.setAttribute('aria-pressed',String(pickedNow));
  node.setAttribute('aria-label',(removeChip?'Remove ':'Toggle ')+item.name);
  node.addEventListener('click',()=>{
   if(selected.has(item.id))selected.delete(item.id);
   else if(selected.size>=MAX_SELECTED){
    $('resourceCatalogStatus').textContent='Maximum '+MAX_SELECTED+' selected resources. Remove a resource above before adding another.';
    return;
   }else selected.add(item.id);
   save();render();
  });
  return node;
 }
 for(const item of chosen)picked.appendChild(button(item,true));
 host.appendChild(picked);
 const matchesHeading=document.createElement('div');
 matchesHeading.className='android-resource-picked-heading';
 const term=$('resourceFilter').value.trim();
 matchesHeading.textContent=market().catalogState().count?(term?'MATCHING RESOURCES · TAP TO SELECT':'BROWSE RESOURCES · TAP TO SELECT'):'QUICK START · FULL EVE CATALOG STILL LOADING';
 host.appendChild(matchesHeading);
 if(!catalog.length){
  const hint=document.createElement('p');
  hint.className='android-resource-help';
  hint.textContent='Preparing the EVE resource catalog… On the first launch this can take a while. Keep the app open; matching ores will appear automatically when the index is ready.';
  host.appendChild(hint);
 }else if(!visible.length){
  const hint=document.createElement('p');
  hint.className='android-resource-help';
  hint.textContent='No matching resources. Try another name or choose a different resource category above.';
  host.appendChild(hint);
 }else{
  const list=document.createElement('div');
  list.className='android-resource-matches';
  // Do not create another scrollable list inside the Android WebView.
  for(const item of visible.slice(0,16))list.appendChild(button(item));
  host.appendChild(list);
  if(visible.length>16){
   const hint=document.createElement('p');hint.className='android-resource-help';
   hint.textContent='Showing 16 of '+visible.length+' results. Type more of the name above to narrow the list.';
   host.appendChild(hint);
  }
 }
}
function render(){
 const all=browseItems(mode),found=filtered(),list=$('resourcePick');
 list.innerHTML='';
 for(const item of found.slice(0,200)){
  const opt=document.createElement('option');
  opt.value=String(item.id);
  opt.textContent=item.name+' · '+family(item).toUpperCase();
  opt.selected=selected.has(item.id);
  list.appendChild(opt);
 }
 touchResourcePicker(found);
 const inCategory=all.filter(x=>selected.has(x.id)).length;
 if(!market().catalogState().count){
  $('resourceCatalogStatus').textContent='QUICK START · '+all.length+
   ' verified starter resource types available while the full ESI index loads. '+
   (lastCatalogProgress||'Contacting ESI…')+
   ' · Prices are still fetched from ESI. More resource types will appear when indexing finishes.';
 }else{
  $('resourceCatalogStatus').textContent=(global.ICAndroid?'Tap a resource to add/remove it · ':'Ctrl-click to select multiple · ')+
   inCategory+'/'+MAX_SELECTED+' selected · '+found.length+' matches in '+all.length+
   ' mineable types. Tap SCAN MARKETS to refresh quotations.';
 }
}
function seedDefaultSelection(){
 if(!firstLaunch||!market().catalogState().complete)return;
 firstLaunch=false;
 const defaults=['Pyroxeres','Kernite','Dark Ochre','Omber III-Grade','Gneiss','Crokite',
  'Clear Icicle','White Glaze','Blue Ice','Glacial Mass'];
 const lookup=market().resourceItems('both');
 selected=new Set(defaults.map(name=>lookup.find(x=>x.name===name)?.id).filter(Boolean).slice(0,MAX_SELECTED));
 save();
}
function onCatalogLoaded(){seedDefaultSelection();render();}
function setMode(value){mode=value;render();}
function restore(ids){
 if(!Array.isArray(ids)||ids.length>MAX_SELECTED||ids.some(x=>!Number.isInteger(x)||x<=0))return;
 if(!ids.length&&localStorage.getItem(KEY)===null)return; // v0.5 settings had no resource selections; seed the familiar starter set
 selected=new Set(ids);firstLaunch=false;save();render();
}
function init(currentMode='both'){
 mode=currentMode;
 firstLaunch=localStorage.getItem(KEY)===null;
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(Array.isArray(raw)&&raw.length<=MAX_SELECTED)selected=new Set(raw.filter(x=>Number.isInteger(x)&&x>0));
 }catch(_){}
 const picker=$('resourcePick');
 picker.addEventListener('change',()=>{
  for(const opt of picker.options)selected.delete(+opt.value);
  for(const opt of picker.selectedOptions)if(+opt.value>0)selected.add(+opt.value);
  if(selected.size>MAX_SELECTED){
   selected=new Set([...selected].slice(0,MAX_SELECTED));
   $('resourceCatalogStatus').textContent='Maximum 12 resource variants per scan.';
  }
  save();render();
 });
 $('resourceFilter').addEventListener('input',render);
 $('resourceCatalogLoad').addEventListener('click',async()=>{
  const btn=$('resourceCatalogLoad');btn.disabled=true;
  $('resourceCatalogStatus').textContent='Retrieving full ESI market catalog; see Market Explorer for progress…';
  try{await market().loadCatalog(true);render();}
  catch(e){$('resourceCatalogStatus').textContent='ESI market catalog unavailable · '+e.message;}
  finally{btn.disabled=false;}
 });
 $('resourcePickMatches').addEventListener('click',()=>{
  const items=filtered().slice(0,MAX_SELECTED);
  if(!items.length){$('resourceCatalogStatus').textContent='No matching resources. Sync the catalog or refine search.';return;}
  selected=new Set(items.map(x=>x.id));save();render();
 });
 $('resourcePickClear').addEventListener('click',()=>{selected.clear();save();render();});
 global.addEventListener('ic-market-catalog-updated',onCatalogLoaded);
 global.addEventListener('ic-market-catalog-progress',event=>{
  lastCatalogProgress=String(event.detail||'');
  if(!market().catalogState().count)
   $('resourceCatalogStatus').textContent='QUICK START AVAILABLE · '+lastCatalogProgress;
 });
 seedDefaultSelection();render();
}
async function loadResources(resource,force=false){
 const M=market();
 if(!M.catalogState().count&&!browseItems(resource).some(x=>selected.has(x.id))){
  await M.loadCatalog();
 }
 const candidates=browseItems(resource);
 const chosen=candidates.filter(x=>selected.has(x.id));
 if(!chosen.length)throw Error('Select 1–12 variants in the ESI RESOURCE CATALOG first, then SCAN MARKETS. Use SELECT MATCHING to pick from all known types.');
 if(chosen.length>MAX_SELECTED)throw Error('Too many selected resources. Limit scanning to 12 variants so public ESI orders are not flooded.');
 const found=Array(chosen.length);
 let index=0;
 await Promise.all(Array.from({length:Math.min(4,chosen.length)},async()=>{
  while(index<chosen.length){
   const n=index++,item=chosen[n];
   try{
    const detail=await M.esi('/universe/types/'+item.id+'/',{ttl:86400000,force});
    const compressed=M.compressedFor(item);let compressedVolume=null;
    if(compressed&&['ore','ice','moon'].includes(family(item))){
     try{const c=await M.esi('/universe/types/'+compressed.id+'/',{ttl:86400000,force});compressedVolume=+c.volume||null;}
     catch(_){} // Compressed form unpriced if volume unavailable.
    }
    found[n]={name:item.name,id:item.id,kind:family(item),volume:+detail.volume||0,
     compressedId:compressedVolume?compressed.id:null,compressedVolume};
   }catch(e){found[n]={name:item.name,kind:family(item),error:e.message};}
  }
 }));
 return found;
}
global.ICResourceBrowser={init,setMode,restore,loadResources,family,render,selected:()=>[...selected]};
})(window);
