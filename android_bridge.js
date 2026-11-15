/* 4NIK8 ORE Industrial Command – secure, origin-scoped Android shell adapter.
 * On Windows/Linux this script is inert. On Android no local PowerShell
 * process, loopback server, remote API proxy or account is necessary.
 */
(function(global){
'use strict';
if(global.location?.hostname!=='appassets.androidplatform.net'||!global.IndustrialAndroid)return;
const bridge=global.IndustrialAndroid,pending=new Map();
let nonce=0;
bridge.addEventListener('message',event=>{
 let packet;
 try{packet=JSON.parse(event.data);}catch(_){return;}
 const slot=pending.get(packet?.id);
 if(!slot)return;
 pending.delete(packet.id);if(slot.timer)clearTimeout(slot.timer);
 if(packet.ok)slot.resolve(packet.data??null);
 else slot.reject(Error(String(packet.error||'Android operation failed')));
});
function request(action,params={},timeout=18000){
 return new Promise((resolve,reject)=>{
  const id=String(++nonce);
  const timer=timeout?setTimeout(()=>{
   pending.delete(id);reject(Error('Android storage did not respond in time'));
  },timeout):null;
  pending.set(id,{resolve,reject,timer});
  try{bridge.postMessage(JSON.stringify({id,action,...params}));}
  catch(err){pending.delete(id);if(timer)clearTimeout(timer);reject(err);}
 });
}
global.ICAndroid={
 loadSettings:()=>request('settings.load'),
 saveSettings:settings=>request('settings.save',{settings}),
 exportFile:(name,content,mime='text/plain')=>request('file.export',{name,content,mime},0),
};
function mobileNavigation(){
 if(!global.document?.querySelector('main'))return;
 const sections={
  mine:['controls','profit','mining'],
  freight:['detail','trade'],
  market:['market-explorer'],
  ships:['ship-library'],
  radio:['radio']
 };
 const labels=[
  {id:'mine',icon:'⛏',text:'Mine'},
  {id:'freight',icon:'▣',text:'Freight'},
  {id:'market',icon:'⌕',text:'Market'},
  {id:'ships',icon:'◈',text:'Ships'},
  {id:'radio',icon:'♫',text:'Radio'}
 ];
 const panelSelectors={
  controls:'.controls.panel',profit:'.profit.panel',mining:'.mining.panel',
  detail:'.detail.panel',trade:'.trade.panel',
  'market-explorer':'.market-explorer.panel','ship-library':'.ship-library.panel',radio:'.radio.panel'
 };
 const nav=global.document.createElement('nav');nav.id='androidTabBar';nav.setAttribute('aria-label','Industrial Command sections');
 const nodes={};
 for(const tab of labels){
  const button=global.document.createElement('button');button.type='button';
  button.className='android-tab';button.dataset.tab=tab.id;
  button.setAttribute('aria-label',tab.text);
  const symbol=global.document.createElement('span');symbol.className='android-tab-icon';symbol.textContent=tab.icon;
  const caption=global.document.createElement('span');caption.className='android-tab-label';caption.textContent=tab.text;
  button.append(symbol,caption);
  button.addEventListener('click',()=>openTab(tab.id,true));
  nav.appendChild(button);nodes[tab.id]=button;
 }
 global.document.body.classList.add('android-app');
 global.document.body.appendChild(nav);
 const screen=global.document.querySelector('main');
 let active='mine';
 function openTab(value,scroll){
  if(!sections[value])return;
  active=value;
  for(const [kind,selector] of Object.entries(panelSelectors)){
   const panel=global.document.querySelector(selector);
   if(panel)panel.classList.toggle('android-hidden',!sections[value].includes(kind));
  }
  for(const button of Object.values(nodes)){
   const on=button.dataset.tab===value;button.setAttribute('aria-pressed',String(on));
   button.classList.toggle('active',on);
  }
  if(scroll)global.scrollTo({top:0,behavior:'instant'});
  try{global.sessionStorage.setItem('industrial.android.tab',value);}catch(_){}
  screen?.setAttribute('data-android-tab',value);
 }
 global.ICAndroidUI={openTab,id:()=>active};
 let saved='mine';try{saved=global.sessionStorage.getItem('industrial.android.tab')||'mine';}catch(_){}
 openTab(sections[saved]?saved:'mine',false);
}
function onReady(){
 const stylesheet=global.document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='android.css';
 global.document.head.appendChild(stylesheet);
 mobileNavigation();
}
if(global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',onReady,{once:true});
else onReady();
})(window);
