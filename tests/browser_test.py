"""Offline browser smoke test. Does not require external network or localhost navigation.
Network navigation is restricted in the build sandbox, so the app is injected as an inline page.
Official YouTube playback itself is not tested: YT Player is mocked, not streamed.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
from html import escape
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
css=(root/'styles.css').read_text()
logic=(root/'logic.js').read_text()
app=(root/'app.js').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+css+'</style>')
html=html.replace('<script src="logic.js"></script>', '<script>'+logic+'</script>')
html=html.replace('<script src="app.js"></script>', '<script>'+app+'</script>')
init="""
window.__store=window.__store||{};
Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem(k){return Object.hasOwn(window.__store,k)?window.__store[k]:null;},
 setItem(k,v){window.__store[k]=String(v);},
 removeItem(k){delete window.__store[k];}
}});
window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class {
 constructor(el,opts){this.opts=opts;this.last=null;this.volume=0;window.fakeYT=this;setTimeout(()=>opts.events.onReady({target:this}),0);}
 setVolume(n){this.volume=n;}
 loadPlaylist(args){this.last=args;this.opts.events.onStateChange({target:this,data:1});}
 playVideo(){this.opts.events.onStateChange({target:this,data:1});}
 pauseVideo(){this.opts.events.onStateChange({target:this,data:2});}
 stopVideo(){this.opts.events.onStateChange({target:this,data:0});}
 previousVideo(){this.prev=true;}
 nextVideo(){this.next=true;}
 getVideoData(){return {title:'Test track'};}
}};
"""
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.evaluate(init)
 page.set_content(html,wait_until='domcontentloaded')
 assert page.locator('#liverySelect').input_value()=='steel'
 page.locator('#liverySelect').select_option('oxide')
 assert page.evaluate('document.documentElement.dataset.livery')=='oxide'
 assert page.evaluate('window.__store["4nik8.dashboard.livery.v1"]')=='oxide'
 page.locator('#channelName').fill("Scooter's Roadhouse")
 page.locator('#channelUrl').fill('https://music.youtube.com/playlist?list=PL1234567890abcdefghij&si=share')
 page.locator('#saveChannel').click()
 assert page.locator('.channel-preset').count()==1
 assert 'Scooter' in page.locator('#channelList').inner_text()
 assert 'Saved' in page.locator('#channelMessage').inner_text()
 page.locator('[data-tune]').click()
 page.wait_for_function("window.fakeYT && window.fakeYT.last && window.fakeYT.last.list==='PL1234567890abcdefghij'")
 assert page.locator('#youtubeShell').is_visible()
 assert 'Test track' in page.locator('#nowPlaying').inner_text()
 page.locator('#nextTrack').click()
 assert page.evaluate('window.fakeYT.next')
 page.locator('#radioVolume').fill('45')
 assert page.evaluate('window.fakeYT.volume')==45
 page.locator('#radioCollapse').click()
 assert page.locator('#youtubeShell').is_hidden()
 page.locator('#radioCollapse').click()
 assert page.locator('#youtubeShell').is_visible()
 page.locator('#channelForm').scroll_into_view_if_needed()
 page.screenshot(path=str(root/'dashboard-portrait-preview.png'),full_page=True)
 # Re-render with preserved storage to simulate restarting on the same local browser.
 page.set_content(html,wait_until='domcontentloaded')
 assert page.locator('.channel-preset').count()==1
 assert page.locator('#radioVolume').input_value()=='45'
 assert page.locator('#liverySelect').input_value()=='oxide'
 page.locator('[data-edit]').click()
 page.locator('#channelName').fill('Scooter FM')
 page.locator('#saveChannel').click()
 assert 'Scooter FM' in page.locator('#channelList').inner_text()
 page.once('dialog',lambda d:d.accept())
 page.locator('[data-delete]').click()
 assert page.locator('.channel-preset').count()==0
 page.locator('#channelName').fill('Hacker')
 page.locator('#channelUrl').fill('https://example.com/playlist?list=PL1234567890abcdefghij')
 page.locator('#saveChannel').click()
 assert 'Only shared' in page.locator('#channelMessage').inner_text()
 assert page.locator('.channel-preset').count()==0
 assert not errors, errors
 print('PASS: saved playlist channels, mocked tune/playback controls, volume, pause on collapse, persistence, edit, delete, URL rejection, three liv eries.')
 browser.close()