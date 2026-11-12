"""Mocked ESI browser integration: six regions, dated POST routes, NPC station names,
route-adjusted net return, compressed cargo, and saved freight preferences.
Does not represent live EVE data.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>').replace('<script src="logic.js"></script>', '<script>'+(root/'logic.js').read_text()+'</script>').replace('<script src="app.js"></script>', '<script>'+(root/'app.js').read_text()+'</script>')
prelude=r"""
window.__store={};window.__disk=null;window.__marketRequests=[];window.__routeRequests=[];
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__store[k]??null},setItem(k,v){window.__store[k]=String(v)},removeItem(k){delete window.__store[k]}}});
const itemNames=['Pyroxeres','Omber III-Grade','Kernite','Dark Ochre','Gneiss','Crokite','Clear Icicle','White Glaze','Blue Ice','Glacial Mass'];
window.__items={};for(const [i,n] of itemNames.entries()){window.__items[n]=100001+i;window.__items['Compressed '+n]=200001+i;}
const sysByRegion={10000002:30000142,10000043:30000100,10000030:30000130,10000042:30000142,10000032:30000132,10000038:30001234};
const stationByRegion={10000002:60010002,10000043:60010043,10000030:60010030,10000042:60010042,10000032:60010032,10000038:60010038};
const systemJumps={30000142:18,30000100:2,30000130:8,30000132:12,30001234:0};
window.fetch=async(input,opts={})=>{
 if(input==='/api/settings'){
   if(opts.method==='PUT'){window.__disk=JSON.parse(opts.body);return{ok:true,json:async()=>({})};}
   return {ok:true,json:async()=>window.__disk};
 }
 const u=new URL(input,'http://127.0.0.1:48148/'),p=u.pathname;
 const headers=opts.headers||{};
 if(!u.host.includes('esi.evetech.net') || p.startsWith('/latest/') || headers['X-Compatibility-Date']!=='2025-12-16')throw Error('Deprecated ESI endpoint or missing compatibility header: '+u.toString());
 if(p==='/universe/ids'){
   const names=JSON.parse(opts.body);
   return{ok:true,json:async()=>({systems:names.includes('Gammel')?[{name:'Gammel',id:30001234}]:[],inventory_types:names.filter(n=>window.__items[n]).map(n=>({name:n,id:window.__items[n]}))})};
 }
 if(p==='/universe/systems/30001234')return{ok:true,json:async()=>({name:'Gammel',constellation_id:20001234,security_status:0.5})};
 if(p==='/universe/constellations/20001234')return{ok:true,json:async()=>({region_id:10000038})};
 if(p==='/universe/regions/10000038')return{ok:true,json:async()=>({name:'The Bleak Lands'})};
 const sys=p.match(/^\/universe\/systems\/(\d+)$/);
 if(sys)return{ok:true,json:async()=>({name:'Test system '+sys[1],security_status:0.5})};
 const t=p.match(/^\/universe\/types\/(\d+)$/);
 if(t)return{ok:true,json:async()=>({volume:Number(t[1])>=200000?0.5:5})};
 const station=p.match(/^\/universe\/stations\/(\d+)$/);
 if(station){const r=Object.keys(stationByRegion).find(k=>stationByRegion[k]===Number(station[1]));return{ok:true,json:async()=>({name:'NPC station '+station[1]+' · '+r,system_id:sysByRegion[r]})};}
 const market=p.match(/^\/markets\/(\d+)\/orders$/);
 if(market){
   window.__marketRequests.push(u.href);
   const region=Number(market[1]),type=Number(u.searchParams.get('type_id'));
   const base=type===100005||type===200005?1000:100; // Gneiss should lead
   const price=base*(region===10000002?4:region===10000043?3:1);
   return{ok:true,json:async()=>[{is_buy_order:true,location_id:stationByRegion[region],system_id:sysByRegion[region],price,volume_remain:100000,min_volume:1}]};
 }
 const route=p.match(/^\/route\/(\d+)\/(\d+)$/);
 if(route){
   if(opts.method!=='POST')return{ok:false,status:405,statusText:'Method Not Allowed'};
   window.__routeRequests.push({path:p,method:opts.method,body:opts.body,compat:headers['X-Compatibility-Date']});
   const dest=Number(route[2]),jumps=systemJumps[dest]||0;
   return{ok:true,json:async()=>({route:[30001234,...Array(Math.max(0,jumps-1)).fill(30000001),dest]})};
 }
 throw Error('Unexpected URL '+u.toString());
};
true;
"""
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate(prelude)
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('#settingsStatus').textContent.includes('SAVED')")
 assert page.locator('#hubSelect').input_value()=='all'
 assert page.locator('[data-resource=both]').get_attribute('aria-pressed')=='true'
 page.locator('#haulCostJump').fill('500000')
 page.locator('#haulCostJump').dispatch_event('change')
 page.locator('#scanButton').click()
 page.wait_for_function("document.querySelector('#connectionBadge').innerText.includes('CROSS-REGION')",timeout=30000)
 reqs=page.evaluate('window.__marketRequests')
 assert len(reqs)==120,len(reqs)
 assert len(set(r.split('/markets/')[1].split('/orders')[0] for r in reqs))==6
 assert 'Gneiss' in page.locator('#opportunities').inner_text()
 assert 'net' in page.locator('#opportunities').inner_text().lower()
 assert 'FREIGHT PROFIT ANALYZER' in page.locator('.detail').inner_text()
 assert 'NPC station ' in page.locator('#haulDetails').inner_text()
 assert 'OTHER QUOTED BUYERS' not in page.locator('#haulDetails').inner_text()
 assert 'EST. NET' in page.locator('#haulDetails').inner_text()
 assert 'FULL LOAD' in page.locator('#haulDetails').inner_text()
 assert 'JUMPS' in page.locator('#haulDetails').inner_text()
 routes=page.evaluate('window.__routeRequests')
 assert routes and all(r['method']=='POST' for r in routes)
 assert all(r['compat']=='2025-12-16' for r in routes)
 assert all('Safer' in r['body'] for r in routes)
 # Jita has a higher gross quote than Amarr, but configured high freight cost
 # means Amarr should beat it in estimated net proceeds.
 first=page.locator('.freight-destination').first.inner_text()
 assert '60010043' in first,first
 assert 'The Forge' in page.locator('#haulDetails').inner_text()
 # Changing assumptions recomputes from cached route data without another scan.
 page.locator('#haulCostJump').fill('0')
 page.locator('#haulCostJump').dispatch_event('change')
 assert '60010002' in page.locator('.freight-destination').first.inner_text()
 assert len(page.evaluate('window.__marketRequests'))==120
 # Preference change makes a new dated POST with different JSON body.
 page.locator('#haulRoutePref').select_option('Shorter')
 page.wait_for_function("window.__routeRequests.some(r=>r.body.includes('Shorter'))")
 page.wait_for_function("document.querySelector('#haulDetails').innerText.includes('SHORTER')")
 page.wait_for_timeout(600)
 assert page.evaluate('window.__disk.scanner.resource')=='both',page.evaluate('window.__disk')
 assert page.evaluate('window.__disk.scanner.hub')=='all'
 assert page.evaluate('window.__disk.haul.cashPerJump')==0
 assert not errors,errors
 page.screenshot(path=str(root/'dashboard-v0.4.1-portrait-preview.png'),full_page=True)
 print('PASS: 120 market requests; dated POST route objects; real station names; gross vs net; compressed volume; mutable, persisted cost assumptions.')
 browser.close()