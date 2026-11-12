"""Trade-run UI mocked ESI integration. This does NOT verify live market execution."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
for filename,tag in [('styles.css','link'),('logic.js','script'),('app.js','script')]:
 text=(root/filename).read_text()
 if tag=='link':html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+text+'</style>')
 else:html=html.replace(f'<script src="{filename}"></script>','<script>'+text+'</script>')
bootstrap=r'''
window.__disk=null;window.__calls=[];window.__paused=0;
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return this._d?.[k]??null},setItem(k,v){(this._d??={})[k]=String(v)},removeItem(k){delete (this._d??={})[k]}}});
window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class{
 constructor(el,options){this.opts=options;this.destroyed=false;window.__yt=this;const target=document.getElementById(el);target.innerHTML='<iframe title="YouTube player" src="about:blank"></iframe>';setTimeout(()=>options.events.onReady({target:this}),0);}
 setVolume(){} getPlaylist(){return [];} setShuffle(){} getVideoData(){return{title:'Jupiluxe track'};}loadPlaylist(v){this.playlist=v;}
 pauseVideo(){window.__paused++;this.opts.events.onStateChange({target:this,data:2});}
 playVideo(){this.opts.events.onStateChange({target:this,data:1});}destroy(){this.destroyed=true;}
}};
window.fetch=async(input,opts={})=>{
 if(input==='/api/settings'){
  if(opts.method==='PUT'){window.__disk=JSON.parse(opts.body);return{ok:true,json:async()=>({ok:true})};}
  return{ok:true,json:async()=>window.__disk};
 }
 const u=new URL(input,'http://127.0.0.1:48148/'),path=u.pathname;
 if(!u.host.includes('esi.evetech.net')||opts.headers['X-Compatibility-Date']!=='2025-12-16')throw Error('Bad API request '+u.href);
 window.__calls.push({path,method:opts.method,url:u.href});
 if(path==='/universe/ids'){
  const names=JSON.parse(opts.body),items=names.includes('Robotics')?[{name:'Robotics',id:9848}]:[];
  return{ok:true,json:async()=>({systems:names.includes('Gammel')?[{name:'Gammel',id:30001234}]:[],inventory_types:items})};
 }
 if(path==='/universe/systems/30001234')return{ok:true,json:async()=>({name:'Gammel',constellation_id:20001234,security_status:0.4})};
 if(path==='/universe/constellations/20001234')return{ok:true,json:async()=>({region_id:10000038})};
 if(path==='/universe/regions/10000038')return{ok:true,json:async()=>({name:'The Bleak Lands'})};
 if(path==='/universe/types/9848')return{ok:true,json:async()=>({volume:6})};
 const market=path.match(/^\/markets\/(\d+)\/orders$/);
 if(market){
  const region=+market[1];
  if(u.searchParams.get('order_type')!=='all')throw Error('Expected both buy/sell orders');
  const source=region===10000038?[{is_buy_order:false,location_id:60010038,system_id:30001234,price:1000,volume_remain:6000,min_volume:1}]:[];
  const dest=region===10000002?[{is_buy_order:true,location_id:60010002,system_id:30000142,price:2000,volume_remain:6000,min_volume:1}]:[];
  return{ok:true,json:async()=>[...source,...dest]};
 }
 const route=path.match(/^\/route\/(\d+)\/(\d+)$/);
 if(route){
  if(opts.method!=='POST')return{ok:false,status:405,statusText:'Method Not Allowed'};
  return{ok:true,json:async()=>({route:[+route[1],30000001,+route[2]]})};
 }
 const station=path.match(/^\/universe\/stations\/(\d+)$/);
 if(station)return{ok:true,json:async()=>({name:station[1]==='60010038'?'Pickup depot, Gammel':'Buyer depot, Jita',system_id:30000142})};
 throw Error('Unexpected '+u.href);
};
true;
'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate(bootstrap);page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelectorAll('.channel-preset').length===1",timeout=5000)
 # A playing YouTube player remains on screen at compliant dimensions after collapse.
 page.locator('[data-tune]').first.click()
 page.wait_for_function('window.__yt && window.__yt.playlist',timeout=5000)
 assert page.evaluate('window.__yt.playlist.list')=='PLfXw8cc_z-vY'
 page.evaluate('window.__yt.playVideo()')
 page.locator('#radioCollapse').click()
 assert page.locator('#radioContent').evaluate('e=>e.classList.contains("radio-compact")')
 assert page.locator('#youtubePlayerMount iframe').is_visible()
 assert page.evaluate('window.__paused')==0,'collapsing radio must not pause YouTube'
 page.locator('#radioCollapse').click()
 assert not page.locator('#radioContent').evaluate('e=>e.classList.contains("radio-compact")')
 # One trade scan, across six major+local regions, with user-set budget.
 page.locator('#tradeItems').fill('Robotics')
 page.locator('#tradeBudget').fill('2500000')
 assert page.evaluate("document.querySelector('#tradeForm').checkValidity()")
 page.locator('#tradeScan').click()
 page.wait_for_function("document.querySelector('#tradeStatus').textContent.includes('confirmed profitable runs')",timeout=7000)
 page.wait_for_function("document.querySelector('#tradeResults').textContent.includes('Buyer depot, Jita')",timeout=7000)
 assert 'Robotics' in page.locator('#tradeResults').inner_text()
 assert 'Pickup depot, Gammel' in page.locator('#tradeResults').inner_text()
 assert page.locator('#tradeResults .trade-run').count()==1
 assert 'NET ISK / HOUR' in page.locator('#tradeResults').inner_text()
 assert page.evaluate('window.__disk.trade.budget')==2500000
 assert page.evaluate('window.__disk.radio.channels[0].playlistId')=='PLfXw8cc_z-vY'
 assert page.evaluate('window.__calls.filter(c=>c.path.startsWith("/markets/")).length')==6
 assert not errors,errors
 print('PASS: YouTube stays visible/playing when compact; six-region buy/sell arbitrage; real route; station names; trade and Jupiluxe settings preserved.')
 browser.close()