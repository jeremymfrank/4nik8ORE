# 4NIK8 ORE — Industrial Command (Preview v0.4.4)

**Local-only, single-user EVE Online mining-market prototype**, optimized for a **1080×1920 portrait side monitor**. Features the **CB ContraBand Radio** with saved YouTube Music / YouTube playlist channels.

## Start on Windows

1. Extract the ZIP into a folder on your Windows PC.
2. Double-click **`START_COMMAND.cmd`**. Close the old launcher window before starting a new release. It launches a loopback-only Windows PowerShell HTTP server and opens the dashboard at `http://127.0.0.1:48148/`. Keep the launcher window open while using the app. No administrator rights required.
3. Select an EVE operating system, automatic cross-region coverage, ore/ice resources, and sample mining volume, then select **SCAN MARKETS**.
4. Open **CB ContraBand Radio**. Paste a shared **YouTube Music** or **YouTube** playlist link, provide a channel name, and click **SAVE CB CHANNEL**.
5. Use **NEW CHANNEL** before adding an additional preset. Click a saved channel's **TUNE** button to load the playlist using the **official visible YouTube IFrame Player API**. Use the player and dashboard transport/volume controls.
6. Try **TRUCK LIVERY** in the upper right to switch among **4NIK8 Neon Freight**, **Bandit Amber**, **4NIK8 Steel**, and **Salvage Oxide**.

There are **no EVE or Google account credentials required** for public market scanning or shared playlist links. The local dashboard does need internet access to load ESI, public YouTube playlists, and streamed radio.

## CB ContraBand Radio details

- First install includes **CH 01 Jupiluxe** (a saved YouTube Music playlist link, not audio files). Existing AppData presets are preserved; Jupiluxe is only seeded for an empty fresh installation and is not resurrected after deletion. Save up to 40 locally named playlist presets; rename, delete, tune, skip, pause, adjust playback volume, and **toggle SHUFFLE**. The shuffle preference is stored alongside your stations in Windows AppData and is reapplied when you tune a new YouTube playlist. Local file tracks shuffle as well.
- Accepts `https://music.youtube.com/playlist?list=...`, `https://www.youtube.com/playlist?list=...`, and YouTube Music shared `watch?...&list=...` or `/browse/VL...` URLs.
- Saved channels, volume, livery and scanner preferences are written to **`%LOCALAPPDATA%\4NIK8 ORE\Industrial Command\settings.json`**, independent of the ZIP extraction folder. Browser `localStorage` remains as a fallback; first v0.3 launch migrates presets from v0.2. **`settings.json.bak`** is maintained on updates. The local server now retains the original verified YouTube Music share URLs and shuffle state when saving settings. **EXPORT SETTINGS** downloads a JSON backup; **IMPORT SETTINGS** restores one. Install updates by extracting the next build and closing the old local server first.
- **Second-channel bug fix:** Each TUNE initializes a fresh YouTube iframe. The player no longer carries old playlists into a newly selected station. Separate NEW CHANNEL and EDIT flows prevent accidental overwrites.
- **Error 2** is reported as an invalid YouTube player request/identifier, not assumed to mean a private playlist. If YouTube returns error 2, the radio tries the official alternative playlist embed once, then shows an in-radio error if embedding fails. There is no external YouTube playback button or workaround.
- Does not download, extract, or stream YouTube audio independently. YouTube embeds are shown in a visible player. **Collapsing the radio pauses YouTube playback**; the playlist remains available after expanding.
- Some private, blocked, age-restricted, geographic, or otherwise unembeddable playlists cannot play. Autoplay may require clicking the video player. YouTube Music Premium-specific features and private-account library syncing are **not supported**.
- Local music files and direct HTTPS audio streams are separate sources; local file selections must be chosen again after restart.
- YouTube requires a visible embedded player and an HTTP origin; opening `index.html` as `file://` is **not supported for playlist playback**. Always launch using the `.cmd` file.

## Visual livery preview

We could not reliably retrieve the exact colors of the provided RSI organization site in the build environment, so the palettes are **design experiments**, not authenticated copies of the organization's logo or banner. **4NIK8 Neon Freight** is now the default on first install. Previously chosen liveries are respected across upgrades. The v0.3 **Neon Freight** livery uses the colorful user-provided 4NIK8 banner image as a subtle masthead overlay with green, cyan, magenta, violet and orange accents. Palette switching remains available.

## What the market preview actually does

- Resolves the entered system and security rating from CCP ESI.
- Resolves a curated subset of raw and compressed ore/ice item names and volumes.
- Fetches **public regional buy orders** for the operating region (when available) and all five major trade regions automatically, respecting the five-minute ESI market cache. A local-only toggle is available.
- Ranks gross price per mined cubic meter using **single-station order depth** and marks partially covered loads.
- Automatically requests a safer stargate route to the selected quoted buyer system (2026 CCP POST route API; real ESI connectivity still needs Windows testing). Also lists alternative public buyer stations from the same scan.
- Keeps all calculations, playlist presets, and user settings on the local PC/browser (no hosted application account).

## Important limitations

- Cross-region quotes are **not** proof a resource is currently available in the operating system. Gross ISK/m³ is **not** net ISK or actual ISK/hour. No mining-yield model, taxes, reprocessing, shipping costs, fuel, risk or time estimates are included yet.
- **Market demand does not prove there is an ore or ice anomaly** in the selected system; live sites are not discoverable from ESI.
- Wormhole systems can be entered, but current wormhole exits are not automatically known.
- Private Upwell structure markets and some null-sec buybacks require legitimately authorized access not present in this build.
- Public trade-region names indicate the region searched, **not** a guarantee that the quote is at the named hub station (e.g. Jita). Each displayed buyer station is taken from the actual order. Regional buy orders may have range conditions; a quoted buyer does not guarantee that a load can be sold from every station in the system. Verify the destination in-game.
- Cached market quotes are snapshots, not guaranteed trades; public ESI market orders normally have a five-minute cache period.
- The loopback server launches only on `127.0.0.1`; other computers on your network cannot reach it. It serves only the four whitelisted app files plus HTML, with no folder traversal or data uploading.
- A native Windows installer, SQLite snapshots, resilient ESI refreshes, backup/export and optional account-based data can come later.

## Verification

- `node --check app.js` and `node --check logic.js` (syntax).
- `node tests/radio.test.js` validates playlist URL normalization and rejection of unsupported URLs.
- `python tests/browser_test.py` runs an **offline, mocked YouTube player test** in Chromium/Playwright covering two-station switching, fresh player teardown, error-code handling, local server snapshot restoration, volume, editing, deletion, settings export and new livery. This does **not** verify actual playback on YouTube or the Windows PowerShell settings server.

## Official references

- [CCP ESI documentation](https://developers.eveonline.com/docs/services/esi/overview/)
- [CCP API market rate limits](https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026)
- [YouTube embedded player requirements](https://developers.google.com/youtube/player_parameters)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)

EVE Online and YouTube are trademarks of their respective owners. This is an independent 4NIK8 fan application, not an official CCP or Google product.

## Historical fixes retained

- PowerShell 5.1 ASCII-safe loopback server launcher, with persistent AppData settings.
- Fresh YouTube IFrame Player for every channel switch, saved shuffle and volume preferences, and official single alternate embed retry for error 2.
- Settings export/import, local backup, and the default Neon Freight paint job. The original shared URL is still retained inside the channel record for editing and exports, **not** for an external playback button.

## v0.4 focus

- **One scan:** automatic five public hub regions plus the operating region, ore and ice, raw and compressed forms. Local-only comparison remains optional.
- **One destination decision:** at each resource, display the top actual buyer station, quoted order depth, gross executable revenue, alternatives, and an automatic ESI stargate route when supported. Quotes from separate locations are never combined.
- **No claimed mining-location discovery yet:** ESI does not publish live deposits or wormhole exits, and static eligibility per system has not yet been indexed. Determining where a deposit really exists remains future work.
- **Factory radio:** Jupiluxe preset ships in the code with its user-provided playlist URL. It does not ship music files or alter existing user settings.
- **No external player UI:** playlists only use the embedded official YouTube player.


## v0.4.1 - Freight Profit Analyzer

- Uses official unversioned ESI, `X-Compatibility-Date: 2025-12-16`, and `POST /route/{origin}/{destination}`. The new ESI response contains a `route` array; we no longer request the deprecated `/latest/route`.
- One market scan now checks a bounded set of destination systems and ranks resources and buyer stations by *estimated net proceeds* where ESI confirms a stargate route. Unrouted offers remain marked **gross / route unverified** and must not be read as realistic profit.
- Fetches NPC station names and correct compressed physical volume. Modern ore/ice compression preserves unit count while reducing physical cargo volume. **Compression service fees** and availability are not priced.
- Configurable shipment hold volume, estimated sales tax, cash hauling cost per jump, minutes per jump, pilot time value, and safer/shorter/less secure routing. Cash cost assumes intermediate empty returns between shipment loads (2 × trips − 1 legs); no estimates of piracy loss probability are made. The default cash cost is **0 ISK/jump** for self-hauling through ordinary stargates. Travel time remains included separately; no money cost is invented for stargate jumps. Existing saved cost overrides are preserved.
- Settings, including new freight preferences, persist in `%LOCALAPPDATA%\4NIK8 ORE\Industrial Command\settings.json`. Fixes a v0.4.0 Windows settings validation mismatch for `ORE + ICE` and `AUTO` market scanning. The radio, playlist presets and theme remain unchanged.
- No authenticated private-structure access, dynamic wormhole exits, mining sites, reprocessing fee calculations, or actual ship profile is implemented. ESI still needs testing on a Windows install.

## v0.4.2 - Own-hauler default

- **Cash expense per jump defaults to 0 ISK** for 4NIK8-owned hauling on ordinary stargate routes. It is optional for courier fees, jump-freighter fuel estimates, or explicit out-of-pocket costs.
- Travel time still contributes to route duration and can be assigned a pilot time value, but cash cost and time are kept separate.
- Existing AppData freight settings are deliberately not overwritten by updates. If a prior installation has 45,000 or 50,000 ISK/jump saved, change that field to **0** once; the app will persist your choice.


## v0.4.3 - Mining Performance (calibrated ISK/hour)

The Mining Performance panel, underneath Freight Profit Analyzer, models **two separate production rates**: ore strip mining and ice harvesting. Its factory ship profile is **High on Supply / Retriever** with two mining modules; the yield and cycle time fields intentionally begin **blank** because actual rates depend on the fitted modules, trained skills, current boosts, implants, critical successes and resource type. ESI does not report live mining laser cycles or live cargo quantities.

To calibrate either mode, enter the module's **effective m3/cycle and seconds per cycle** as shown in EVE, or press **START TIMED SESSION**, mine normally, and enter the actual number of m3 you produced before pressing **END & CALIBRATE**. Observed rates override module estimates, including the time your lasers were idle. The timer measures real wall-clock time; it stays running across app restarts and must be stopped with a mined volume. Ice mode uses actual ice units per cycle and raw item volume from ESI instead of incorrectly applying the ore yield.

After the same cross-regional market scan, choose **ALL-IN ISK/HOUR** in Mining Performance. The Opportunity Board can rank only fully filled, route-verified quotes with a calibrated rate. There are two separate readings:

- **Mining-only ISK/hour** = estimated gross buyer revenue minus configured sale tax, divided by mining hours. It does not include travel time.
- **All-in ISK/hour** = estimated gross buyer revenue minus configured sale tax and explicit cash transport expenses, divided by mining hours + estimated outbound/return hauling hours + configurable handling hours. The optional final empty **Return to Origin** leg is on by default. Pilot time cost is deliberately not deducted in the numerator again because elapsed hours already appear in the denominator.

No market prices are fabricated. The cash-cost default remains **0 ISK per jump**, and all settings, calibrated rates and an active session timestamp live in `%LOCALAPPDATA%\4NIK8 ORE\Industrial Command\settings.json` in the existing schema. Radio presets, Jupiluxe, shuffle, volume, and livery are unchanged.

**Limitations:** No automatic ship skill/fitting import or EVE SSO in this release. The personal ESI mining ledger summarizes quantities by day/system/resource but does not include exact session minutes. This release deliberately requires one-time fit-value entry or a timer calibration instead of calling an unverified output 'actual'. Mining-site existence, local threats, critical bonuses not reflected in effective yield, residue, compression/refining costs, structure access, and wormhole exits remain unverified or excluded. The browser tests use synthetic ESI responses and do not prove live playability or actual EVE yield.

## v0.4.4: YouTube embed diagnostic

- **TEST EMBED** within the CB player loads the official YouTube IFrame API sample video `M7lc1UVf-VE` in the same app context, without touching the saved channels. The user presses Play inside the visible embedded player to confirm actual playback.
- If the sample plays while shared Music playlists error with 150, it suggests restrictions or a format mismatch affecting the playlist items. If the sample also returns 150, investigate the browser, localhost embedding, extensions or a YouTube-side issue. Neither result proves the full root cause.
- No autoplay bypass, download, direct media URL extraction, or external YouTube launch button. No automatic skipping through a possibly fully restricted playlist.
- Existing Windows AppData radio presets, shipping costs and calibrated mining profiles are unchanged.