"""Offline in-dashboard YouTube sample control test; no network / streaming assertion."""
from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
for path,tag in [('styles.css','link'),('logic.js','script'),('app.js','script')]:
 content=(root/path).read_text()
 if tag=='link': html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+content+'</style>')
 else:html=html.replace(f'<script src="{path}"></script>','<script>'+content+'</script>')
bootstrap=r'''
window.__store={};window.__disk=null;
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return this.__map?.[k]??null},setItem(k,v){(this.__map??={})[k]=String(v)},removeItem(k){delete (this.__map??={})[k]}}});
window.fetch=async (u,o={})=>{if(u==='/api/settings'){
 if(o.method==='PUT'){window.__disk=JSON.parse(o.body);return {ok:true,status:200,json:async()=>({ok:true})};}
 return {ok:true,status:200,json:async()=>window.__disk};}
 throw Error('simulated test has no external data');};
window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class{
 constructor(el,opts){this.opts=opts;this.destroyed=false;window.fakeYT=this;setTimeout(()=>opts.events.onReady({target:this}),0);}
 setVolume(v){this.volume=v;}
 playVideo(){this.opts.events.onStateChange({target:this,data:1});}
 pauseVideo(){this.opts.events.onStateChange({target:this,data:2});}
 loadPlaylist(p){this.last=p;}
 destroy(){this.destroyed=true;}
 getPlaylist(){return [];}
 getVideoData(){return {title:'Sample'};}
 emitError(n){this.opts.events.onError({target:this,data:n});}
}};
'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate(bootstrap);page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelectorAll('.channel-preset').length===1")
 page.locator('[data-tune]').first.click()
 page.wait_for_function('window.fakeYT && window.fakeYT.last')
 page.evaluate('window.fakeYT.emitError(150)')
 assert 'TUNE FAILED' in page.locator('#channelList').inner_text()
 page.locator('#testYouTubeEmbed').click()
 page.wait_for_function("window.fakeYT && window.fakeYT.opts.videoId==='M7lc1UVf-VE'")
 assert 'Jupiluxe' in page.locator('#channelList').inner_text()
 assert page.locator('#youtubeChannelNumber').inner_text()=='TEST'
 assert 'Sample player loaded' in page.locator('#radioStatus').inner_text()
 page.evaluate('window.fakeYT.playVideo()')
 assert 'TEST PASS' in page.locator('#radioStatus').inner_text()
 page.evaluate('window.fakeYT.emitError(150)')
 assert 'TEST FAILED' in page.locator('#radioStatus').inner_text()
 assert 'Jupiluxe' in page.locator('#channelList').inner_text()
 page.locator('[data-tune]').first.click()
 page.wait_for_function("window.fakeYT && window.fakeYT.last && window.fakeYT.last.list==='PLfXw8cc_z-vY'")
 assert 'Jupiluxe' in page.locator('#nowPlaying').inner_text()
 assert not errors,errors
 print('PASS: same-context YouTube sample diagnostic, error-150 reporting, saved preset integrity, return to channel.')
 browser.close()