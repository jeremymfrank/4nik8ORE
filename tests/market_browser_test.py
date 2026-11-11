"""Mocked ESI browser regression: one click scans six public regions, real per-station quote and auto route."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>').replace('<script src="logic.js"></script>','<script>'+(root/'logic.js').read_text()+'</script>').replace('<script src="app.js"></script>','<script>'+(root/'app.js').read_text()+'</script>')
prelude=r"""
window.__store={};window.__disk=null;window.__marketRequests=[];window.__routeRequests=[];
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__store[k]??null},setItem(k,v){window.__store[k]=String(v)},removeItem(k){delete window.__store[k]}}});
const itemNames=['Pyroxeres','Omber III-Grade','Kernite','Dark Ochre','Gneiss','Crokite','Clear Icicle','White Glaze','Blue Ice','Glacial Mass'];
window.__items={};for(const [i,n] of itemNames.entries()){window.__items[n]=100001+i;window.__items['Compressed '+n]=200001+i;}
window.fetch=async(input,opts={})=>{
 if(input==='/api/settings'){
   if(opts.method==='PUT'){window.__disk=JSON.parse(opts.body);return{ok:true,json:async()=>({})};}
   return {ok:true,json:async()=>window.__disk};
 }
 const u=new URL(input,'http://127.0.0.1:48148/'),p=u.pathname;
 if(p==='/latest/universe/ids/'){
   const names=JSON.parse(opts.body);
   return{ok:true,json:async()=>({systems:names.includes('Gammel')?[{name:'Gammel',id:30001234}]:[],inventory_types:names.filter(n=>window.__items[n]).map(n=>({name:n,id:window.__items[n]}))})};
 }
 if(p==='/latest/universe/systems/30001234/')return{ok:true,json:async()=>({name:'Gammel',constellation_id:20001234,security_status:0.5})};
 if(p==='/latest/universe/constellations/20001234/')return{ok:true,json:async()=>({region_id:10000038})};
 if(p==='/latest/universe/regions/10000038/')return{ok:true,json:async()=>({name:'The Bleak Lands'})};
 if(/^\/latest\/universe\/types\/\d+\/$/.test(p))return{ok:true,json:async()=>({volume:5})};
 const market=p.match(/^\/latest\/markets\/(\d+)\/orders\/$/);
 if(market){
   window.__marketRequests.push(u.href);
   const region=Number(market[1]),type=Number(u.searchParams.get('type_id'));
   const base=type===100005||type===200005?1000:100; // Gneiss wins with raw m3=5
   const price=base*(region===10000002?4:region===10000043?3:1);
   // One location per region; buyer is always real station-specific, not a combined book.
   return{ok:true,json:async()=>[{is_buy_order:true,location_id:60000000+(region%10000),system_id:region===10000002?30000142:30000100,price,volume_remain:100000,min_volume:1}]};
 }
 if(/^\/latest\/route\/\d+\/\d+\/$/.test(p)){
   window.__routeRequests.push({path:p,method:opts.method,body:opts.body});
   return{ok:true,json:async()=>[30001234,30000100,30000142]};
 }
 throw Error('Unexpected URL '+u.toString());
};
true;
"""
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate(prelude)
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('#settingsStatus').textContent.includes('SAVED')")
 page.locator('#scanButton').click()
 page.wait_for_function("document.querySelector('#connectionBadge').innerText.includes('CROSS-REGION')",timeout=30000)
 assert page.locator('#hubSelect').input_value()=='all'
 # 6 unique regions (operating + five hubs), ten ores and 2 forms = 120 requests.
 requests=page.evaluate('window.__marketRequests')
 assert len(requests)==120,len(requests)
 assert len(set(r.split('/markets/')[1].split('/orders/')[0] for r in requests))==6
 assert 'Gneiss' in page.locator('#opportunities').inner_text()
 assert 'The Forge' in page.locator('#opportunities').inner_text()
 assert 'OTHER QUOTED BUYERS' in page.locator('#haulDetails').inner_text()
 page.wait_for_function('window.__routeRequests.length>0')
 route=page.evaluate('window.__routeRequests[0]')
 assert route['method']=='POST',route
 assert 'Safer' in route['body']
 assert '2 stargate jumps' in page.locator('#routeResult').inner_text()
 assert not errors,errors
 page.screenshot(path=str(root/'dashboard-v0.4-portrait-preview.png'),full_page=True)
 print('PASS: one-click 6-region scan, 120 order books, station-bound revenue, alternatives, and automatic POST route.')
 browser.close()