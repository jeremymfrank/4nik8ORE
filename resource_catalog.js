/* 4NIK8 – resource browsing through the full market-catalog ESI item index */
(function(global){
'use strict';
const $=id=>document.getElementById(id);
const KEY='4nik8.resource.selection.v1', MAX_SELECTED=12;
let selected=new Set(),mode='both',firstLaunch=false;
function market(){return global.ICMarketExplorer;}
function family(item){return market().familyOf(item);}
function filtered(){
 const search=$('resourceFilter').value.trim().toLowerCase();
 return market().resourceItems(mode).filter(x=>!search||x.name.toLowerCase().includes(search)||x.group.toLowerCase().includes(search));
}
function save(){try{localStorage.setItem(KEY,JSON.stringify([...selected]));}catch(_){}}
function render(){
 const all=market().resourceItems(mode),found=filtered(),list=$('resourcePick');
 list.innerHTML='';
 for(const item of found.slice(0,200)){
  const opt=document.createElement('option');
  opt.value=String(item.id);
  opt.textContent=item.name+' · '+family(item).toUpperCase();
  opt.selected=selected.has(item.id);
  list.appendChild(opt);
 }
 const inCategory=all.filter(x=>selected.has(x.id)).length;
 $('resourceCatalogStatus').textContent=market().catalogState().count.toLocaleString()+
  ' EVE market item IDs indexed · '+all.length+' resources in selected class · '+
  inCategory+' selected in this class · '+found.length+' matches'+(found.length>200?' (first 200 shown; refine search)':'')+
  ' · Scan 1–12 selected variants (Ctrl-click to select multiple).';
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
 seedDefaultSelection();render();
}
async function loadResources(resource,force=false){
 const M=market();
 if(!M.catalogState().count)await M.loadCatalog();
 const candidates=M.resourceItems(resource);
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
global.ICResourceBrowser={init,setMode,loadResources,family,render,selected:()=>[...selected]};
})(window);
