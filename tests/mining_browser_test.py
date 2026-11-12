"""End-to-end browser test of mining projections with MOCKED ESI. Not live EVE."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import ast
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>').replace('<script src="logic.js"></script>', '<script>'+(root/'logic.js').read_text()+'</script>').replace('<script src="app.js"></script>', '<script>'+(root/'app.js').read_text()+'</script>')
# Reuse the same synthetic market conditions used for the freight browser test.
tree=ast.parse((root/'tests/market_browser_test.py').read_text())
prelude=next(n.value.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='prelude' for t in n.targets))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1080,'height':1920})
 errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.evaluate(prelude)
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('#settingsStatus').textContent.includes('SAVED')")
 assert page.locator('#miningOreYield').input_value()==''
 assert page.locator('#miningIceUnits').input_value()==''
 assert page.locator('#miningReturn').is_checked()
 assert page.locator('#haulCostJump').input_value()=='0'
 page.locator('#scanButton').click()
 page.wait_for_function("document.querySelector('#connectionBadge').innerText.includes('CROSS-REGION')",timeout=30000)
 assert 'NOT CALIBRATED' in page.locator('#miningMetrics').inner_text()
 assert 'ISK/H' not in page.locator('#miningMetrics').inner_text()
 # Configured ore mining rate: 100 m3 x 2 lasers x 3600/30 = 24k m3/hr.
 page.locator('#miningOreYield').fill('100')
 page.locator('#miningOreYield').dispatch_event('change')
 page.locator('#miningOreCycle').fill('30')
 page.locator('#miningOreCycle').dispatch_event('change')
 assert '24,000' in page.locator('#miningMetrics').inner_text(),page.locator('#miningMetrics').inner_text()
 assert 'ALL-IN' in page.locator('#miningMetrics').inner_text()
 # Hourly sort uses same live order scan, no extra market API calls.
 page.locator('#miningSort').select_option('hour')
 assert 'ISK / HOUR' in page.locator('#headlineUnit').inner_text()
 assert len(page.evaluate('window.__marketRequests'))==120
 # The extra trip home must affect the elapsed-hour denominator.
 before=page.locator('#miningMetrics .metric-card.best strong').inner_text()
 page.locator('#miningReturn').uncheck()
 after=page.locator('#miningMetrics .metric-card.best strong').inner_text()
 assert before!=after,(before,after)
 page.locator('#miningReturn').check()
 # Ending a real measured session overrides theoretical effective cycle rate.
 page.evaluate('window.__savedTime=Date.now(); window.__clock=window.__savedTime; Date.now=()=>window.__clock;')
 page.locator('#miningSessionToggle').click()
 page.evaluate('window.__clock += 3600000;')
 page.locator('#miningSessionVolume').fill('30000')
 page.locator('#miningSessionToggle').click()
 page.evaluate('Date.now=()=>window.__savedTime;')
 assert '30,000' in page.locator('#miningMetrics').inner_text()
 assert 'MEASURED' in page.locator('#miningMetrics').inner_text()
 # Compare ice independently. No ore yield can substitute for ice.
 page.locator('[data-resource="ice"]').click()
 page.locator('#scanButton').click()
 page.wait_for_function("document.querySelector('#connectionBadge').innerText.includes('CROSS-REGION')",timeout=30000)
 assert 'NOT CALIBRATED' in page.locator('#miningMetrics').inner_text(),page.locator('#miningMetrics').inner_text()
 page.locator('#miningIceUnits').fill('1')
 page.locator('#miningIceUnits').dispatch_event('change')
 page.locator('#miningIceCycle').fill('60')
 page.locator('#miningIceCycle').dispatch_event('change')
 assert 'ALL-IN' in page.locator('#miningMetrics').inner_text()
 page.wait_for_timeout(900)
 saved=page.evaluate('window.__disk')
 assert saved['mining']['profileName']=='High on Supply / Retriever',saved
 assert saved['mining']['observedOreM3Hour']>29999
 assert saved['mining']['returnHome'] is True
 assert saved['mining']['oreYield']==100
 assert saved['mining']['sort']=='hour'
 assert saved['haul']['cashPerJump']==0
 assert any(x['name']=='Jupiluxe' for x in saved['radio']['channels'])
 # Simulate a new browser window loading only the Windows AppData snapshot.
 new_page=browser.new_page(viewport={'width':1080,'height':1920})
 new_page.evaluate(prelude)
 new_page.evaluate('(snapshot)=>{window.__disk=snapshot;}',saved)
 new_page.set_content(html,wait_until='domcontentloaded')
 new_page.wait_for_function("document.querySelector('#miningOreYield').value==='100' && document.querySelector('#channelList').innerText.includes('Jupiluxe')",timeout=4000)
 assert new_page.locator('#miningOreYield').input_value()=='100'
 assert new_page.locator('#miningIceCycle').input_value()=='60'
 assert new_page.locator('#miningReturn').is_checked()
 assert new_page.locator('#miningSort').input_value()=='hour'
 assert 'Jupiluxe' in new_page.locator('#channelList').inner_text()
 new_page.close()
 assert not errors,errors
 page.screenshot(path=str(root/'dashboard-v0.4.3-portrait-preview.png'),full_page=True)
 print('PASS: no invented yields; ore and ice independence; measured override; hour ranking; final return; preserved AppData settings/radio; 120 synthetic market queries per scan.')
 browser.close()