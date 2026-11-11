"""Offline Chromium integration tests: 2-channel switching, AppData migration mock,
radio persistence across restart, livery, and error-2 messaging. External YouTube
streaming and the Windows PowerShell HTTP server are NOT mocked as successful.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
html=html.replace('<script src="logic.js"></script>', '<script>'+(root/'logic.js').read_text()+'</script>')
html=html.replace('<script src="app.js"></script>', '<script>'+(root/'app.js').read_text()+'</script>')
# A fake YouTube iframe API deliberately triggers an error for channel 2 on first
# attempt, so the real onError callback and player teardown paths are exercised.
bootstrap=r"""
window.__store=window.__store||{};
window.__diskSettings=window.__diskSettings??null;
window.__playerInstances=[];
Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem(k){return Object.hasOwn(window.__store,k)?window.__store[k]:null;},
 setItem(k,v){window.__store[k]=String(v);},
 removeItem(k){delete window.__store[k];}
}});
window.fetch=async(input,opts={})=>{
 if(input==='/api/settings'){
  if(opts.method==='PUT'){
   window.__diskSettings=JSON.parse(opts.body);
   return {ok:true,status:200,json:async()=>({ok:true})};
  }
  return {ok:true,status:200,json:async()=>window.__diskSettings};
 }
 throw Error('network disabled in integration test');
};
window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class {
 constructor(el,opts){this.opts=opts;this.last=null;this.volume=0;this.destroyed=false;this.queue=[];this.shuffleCalls=[];
  window.__playerInstances.push(this);window.fakeYT=this;
  setTimeout(()=>opts.events.onReady({target:this}),0);
 }
 setVolume(n){this.volume=n;}
 loadPlaylist(args){this.last=args;this.queue=['one','two','three'];this.opts.events.onStateChange({target:this,data:1});}
 setShuffle(on){this.shuffleCalls.push(on);}
 getPlaylist(){return this.queue;}
 playVideo(){this.opts.events.onStateChange({target:this,data:1});}
 pauseVideo(){this.opts.events.onStateChange({target:this,data:2});}
 destroy(){this.destroyed=true;}
 previousVideo(){this.prev=true;}
 nextVideo(){this.next=true;}
 getVideoData(){return {title:'Test track'};}
 emitError(n){this.opts.events.onError({target:this,data:n});}
}};
"""
ID1='PL1234567890abcdefghij'
ID2='PLabcdefghij0987654321'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 page.evaluate(bootstrap)
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('#settingsStatus').textContent.includes('SAVED')")
 assert page.locator('#liverySelect').input_value()=='neon'
 assert page.locator('#shuffleButton').get_attribute('aria-pressed')=='false'
 page.locator('#shuffleButton').click()
 assert page.locator('#shuffleButton').get_attribute('aria-pressed')=='true'
 page.locator('#liverySelect').select_option('oxide')
 assert page.evaluate('document.documentElement.dataset.livery')=='oxide'
 page.locator('#channelName').fill("Scooter's Roadhouse")
 page.locator('#channelUrl').fill('https://music.youtube.com/playlist?list='+ID1+'&si=share')
 page.locator('#saveChannel').click()
 assert page.locator('.channel-preset').count()==1
 page.locator('[data-tune]').first.click()
 page.wait_for_function('window.fakeYT && window.fakeYT.last && window.fakeYT.last.list==="'+ID1+'"')
 assert page.locator('#youtubeShell').is_visible()
 assert 'Test track' in page.locator('#nowPlaying').inner_text()
 assert page.evaluate('window.fakeYT.shuffleCalls')==[True]
 # New station must add rather than overwrite the existing one.
 page.locator('#newChannel').click()
 page.locator('#channelName').fill('Wormhole Country')
 page.locator('#channelUrl').fill('https://music.youtube.com/playlist?list='+ID2+'&si=share')
 page.locator('#saveChannel').click()
 assert page.locator('.channel-preset').count()==2
 page.locator('[data-tune]').nth(1).click()
 page.wait_for_function('window.fakeYT && window.fakeYT.last && window.fakeYT.last.list==="'+ID2+'"')
 assert page.evaluate('window.__playerInstances[0].destroyed')
 assert page.evaluate('window.__playerInstances.length')==2
 assert page.evaluate('window.fakeYT.shuffleCalls')==[True]
 assert 'list='+ID2 in page.locator('#youtubeExternal').get_attribute('href')
 page.evaluate('window.fakeYT.emitError(2)')
 page.wait_for_function('window.__playerInstances.length===3')
 assert page.evaluate('window.__playerInstances[1].destroyed')
 assert page.evaluate('window.fakeYT.opts.playerVars.list')==ID2
 page.evaluate('window.fakeYT.emitError(2)')
 assert 'YouTube rejected the embedded playlist request' in page.locator('#radioStatus').inner_text()
 assert 'playback in the embedded player was rejected' in page.locator('#channelMessage').inner_text()
 assert page.locator('#youtubeExternalFallback').is_visible()
 assert page.locator('#youtubePlayerMount').is_hidden()
 assert page.locator('#youtubeExternalFallbackLink').get_attribute('href')=='https://music.youtube.com/playlist?list='+ID2+'&si=share'
 assert 'OPEN IN MUSIC' in page.locator('#channelList').inner_text()
 assert 'ON AIR' not in page.locator('#channelList').inner_text()
 # CB controls cannot control an externally playing playlist.
 page.locator('#playPause').click()
 assert 'cannot operate an external player' in page.locator('#radioStatus').inner_text()
 page.locator('[data-tune]').first.click()
 page.wait_for_function('window.fakeYT && window.fakeYT.last && window.fakeYT.last.list==="'+ID1+'"')
 assert page.evaluate('window.__playerInstances.length')==4
 assert page.locator('#youtubeExternalFallback').is_hidden()
 assert page.locator('#youtubePlayerMount').is_visible()
 assert 'ON AIR' in page.locator('#channelList').inner_text()
 # Editing remains isolated; switching back/forth retains IDs.
 page.locator('[data-edit]').nth(0).click()
 page.locator('#channelName').fill('Scooter FM')
 page.locator('#saveChannel').click()
 assert page.locator('.channel-preset').count()==2
 assert 'Scooter FM' in page.locator('#channelList').inner_text()
 assert 'Wormhole Country' in page.locator('#channelList').inner_text()
 page.locator('#radioVolume').fill('45')
 assert page.evaluate('window.fakeYT.volume')==45
 # Debounced persistence goes to a simulated AppData server, not just browser cache.
 page.wait_for_function('window.__diskSettings && window.__diskSettings.radio.channels.length===2 && window.__diskSettings.radio.volume===45',timeout=5000)
 assert page.evaluate('window.__diskSettings.livery')=='oxide'
 assert page.evaluate('window.__diskSettings.radio.shuffle') is True
 page.locator('#radioCollapse').click()
 assert page.locator('#youtubeShell').is_hidden()
 page.locator('#radioCollapse').click()
 assert page.locator('#youtubeShell').is_visible()
 # Restart with local browser storage deliberately cleared: disk copy restores it.
 page.evaluate('window.__store={}')
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelectorAll('.channel-preset').length===2")
 assert page.locator('#radioVolume').input_value()=='45'
 assert page.locator('#liverySelect').input_value()=='oxide'
 assert page.locator('#shuffleButton').get_attribute('aria-pressed')=='true'
 assert 'Scooter FM' in page.locator('#channelList').inner_text()
 # Export settings is a real, user-initiated download.
 with page.expect_download() as item:
  page.locator('#exportSettings').click()
 assert item.value.suggested_filename=='4nik8-industrial-command-settings.json'
 page.once('dialog',lambda d:d.accept())
 page.locator('[data-delete]').nth(1).click()
 assert page.locator('.channel-preset').count()==1
 page.locator('#channelName').fill('Wrong Domain')
 page.locator('#channelUrl').fill('https://example.com/?list='+ID1)
 page.locator('#saveChannel').click()
 assert 'Only shared' in page.locator('#channelMessage').inner_text()
 # Toggle back to normal playback and verify its saved setting.
 page.locator('#shuffleButton').click()
 assert page.locator('#shuffleButton').get_attribute('aria-pressed')=='false'
 page.wait_for_function('window.__diskSettings.radio.shuffle===false',timeout=5000)
 assert not errors, errors
 print('PASS: shuffled playlists, switching/reapply, error-2 fallback, settings migration, editing, export, portrait neon default.')
 browser.close()