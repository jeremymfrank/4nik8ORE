# 4NIK8 ORE — Industrial Command (Preview v0.6.1)

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
- Does not download, extract, or stream YouTube audio independently. YouTube embeds are shown in a visible player. **Collapsing the radio keeps a smaller but visible YouTube player on screen and does not pause playback**; it hides channel editing and secondary controls. Local music can fully collapse without pausing.
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

The Mining Performance panel, underneath Freight Profit Analyzer, models **two separate production rates**: ore strip mining and ice harvesting. Its factory ship profile is a generic **Retriever** with two mining modules; the yield and cycle time fields intentionally begin **blank** because actual rates depend on the fitted modules, trained skills, current boosts, implants, critical successes and resource type. ESI does not report live mining laser cycles or live cargo quantities.

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

## v0.4.5: correct Jupiluxe factory channel

- Factory CH 01 now uses the user's verified working shared URL: `https://music.youtube.com/playlist?list=PLfXw8cc_z-vY&si=Dl5vr0dXqf0enefV` (playlist ID `PLfXw8cc_z-vY`). The previously packaged URL was an unrelated playlist.
- Factory preset applies only on truly fresh installs. **Existing Windows AppData/browser presets are never overwritten or repaired silently**, including user-corrected Jupiluxe channels.
- Adds an exact playlist-ID and share-URL regression test. No player API changes, external music launch buttons, or auto-skip behavior.

## v0.4.6: Trade Run Scanner / keep CB on air

**Trade Run Scanner** is an independent buy-low/sell-high discovery tool. It does **not** require mining ore. Select an operating system in the navigation panel, then in **05 TRADE RUN SCANNER** enter the ISK available for purchases and a comma-separated watchlist of up to 16 *exact EVE item names*. Presets help fill minerals, fuel/ice products and planetary industry goods. Select the same **AUTO** major market coverage or **OPERATING REGION ONLY** above, then press **SCAN TRADE RUNS**. Default buying capital is 25 million ISK; change it to your actual available trading funds.

The scanner retrieves both public buy and sell orders through CCP ESI for the selected goods in up to six regions, matching **individual NPC station order stacks**, without combining disparate stations into fictitious inventory. It computes the affordable shipment from remaining seller quantity, buyer demand and minimum trade sizes, user capital, physical m³ per unit and cargo capacity. Quotes walk best available asking prices and bids rather than multiplying one headline price by an imaginary hold. It subtracts configured sales tax (default 7.5%) and explicit cash hauling expenses (default 0 ISK per stargate jump). No broker fee is charged for executing existing orders immediately; listing a new sell order or using a courier is outside this first release.

For each candidate with positive after-tax margin, the scanner verifies the route **operating system → purchase station → sale station**, optionally **sale station → operating system**, and adds configured minutes per jump and handling time. Results rank by estimated cash **ISK/hour**, net profit per trip, or return on capital. It displays the two named NPC stations, quantity, m³, purchase cost, gross resale value, tax, freight cash expenses, profit, ROI, jump counts and travel time. Freight assumptions come from Freight Profit Analyzer; trade-specific budget, handling, watchlist, sort and return preference save to the same Windows AppData settings JSON, with backward compatibility and no changes to saved radio stations.

**Important limits:** This is a bounded *watchlist scan*, not exhaustive surveillance of every marketable item in New Eden; it considers selected stations and a capped number of route candidates per item to avoid abusive ESI requests. It may miss opportunities outside the shortlist or outside the selected regions. Public ESI orders can disappear or move before you arrive and do **not** reserve a profitable spread. Buyer orders with range beyond the buyer station are not evaluated; NPC station orders only. It excludes player structures with unverified docking access, wormhole routes without live exits, piracy, cargo-loss probability, skills and taxes other than your entered sales tax, fuel for special drives, buy-order posting and broker costs, and price changes during transit. Return-home is optional and defaults off for a one-way run. Route planning uses ESI stargates and is unverified for null-sec interdiction hazards. No verified live Windows ESI integration test is claimed; the browser tests use simulated API responses.

**Radio:** The YouTube player was previously intentionally paused and hidden when the panel was collapsed. Collapse now hides the playlist editor and secondary controls but leaves the original official YouTube iframe **visible at minimum compliant size (at least 200×200 px)** and keeps it playing. Expanding reveals the controls again. Collapsing a local audio file/source simply hides the controls without stopping audio. The factory Jupiluxe channel remains `PLfXw8cc_z-vY`, and the user-corrected URL in existing AppData is not replaced.

## v0.5.0: Shared Ship Fitting Library & Responsive Industrial Command

**One ship library, independent choices.** Mining Performance, Freight Profit Analyzer, Ore/Ice Opportunity Board and Trade Run Scanner now have separate ship selectors. They all read the same saved ship profiles. Mining Performance retains independent measured and cycle-derived ore/ice rates per mining ship, so a newly selected miner does not inherit the Retriever's calibration. Existing manual freight rates remain available in **MANUAL / LEGACY** mode.

**Set up a ship:** In **06 SHIP FITTING LIBRARY**, select a hull or create a profile. Press **FETCH HULL FROM ESI** to retrieve public EVE ship attributes. Optionally paste an in-game EFT-format Copy Fitting and press **IMPORT EFT** to recognize supported modules and rigs; confirm the resulting module list and press **SAVE PROFILE**. Profiles and ship selections save locally in Windows AppData, alongside the existing settings and backup. No EVE SSO required. **Exact fitted** hold capacity, alignment time, and warp speed override uncertain skills, implants, ship bonuses, or unsupported fittings. Label exact capacity as **general**, **ore/ice**, or **mineral** so that special hold volume cannot falsely increase ordinary trade capacity.

**Cargo and rig model:** The engine distinguishes general, mining/ice, mineral and fleet holds. Cargohold expanders and rigs enlarge ordinary holds, not special holds. Recognized agility and hyperspatial modules adjust estimated align and warp performance. More fitted capacity means fewer calculated loaded/empty-return trips. The warp approximation includes acceleration, cruise, deceleration and alignment. **AVERAGE WARP DISTANCE (AU PER GATE)** is configurable but is an explicit assumption, not verified gate-to-gate geometry. When ship navigation attributes are incomplete, the manual **MINUTES PER JUMP** setting remains the fallback.

**All-in earnings:** Ore/Ice Opportunity Board ranking uses its own selected hauler, and mining all-in ISK/hour includes that hauler's travel time and trip count. Freight and Trade use independent ships. Trade evaluates hold eligibility for each good (mineral, ore/ice, or general), purchase quantity and route time. Changing the Trade ship requires a rescan because offered quantities may change.

**Screen sizes:** Responsive fluid grids, wrapping dashboard controls and distinct layouts for compact windows, 1080×1920 portrait displays, standard widescreen, ultrawide, and 4K portrait/landscape. The former narrow display cap no longer applies to landscape ultrawide monitors.

**Verification:** Run **node tests/ship.test.js** for deterministic EFT parsing, separated holds, exact-capacity restrictions, fitting multipliers, warp duration, loaded trips, legacy fallback and mining all-in ISK/hour. The ship unit checks and JS syntax checks pass. Existing browser/mock-ESI tests should be run on the Windows PC before calling the release fully integrated.

**Known approximations:** This release does not yet derive actual gate-to-gate/station-to-gate distances from universe spatial data. Pilot skills, implants, special hull bonuses, modules not in the whitelist, server ticks, undock/dock time, and navigation hazards may affect actual rates. Enter the exact fitted stats or calibrate real runs. A live Windows/ESI end-to-end test and all browser viewport tests are pending.


## v0.5.1: Complete ship catalog, generic defaults

The initial eight hulls were never a complete list of EVE ships. **06 SHIP FITTING LIBRARY** now offers **LOAD / REFRESH SHIP CATALOG**, powered by CCP's public ship category (GET /universe/categories/6/), its ship groups (GET /universe/groups/{id}/), and type-name lookup (POST /universe/names/). After loading, search by hull or ship class, choose **ADD SELECTED HULL**, or choose any catalog hull directly from a section's ship selector. A newly selected hull becomes a locally saved profile using its official hull name and its publicly available ESI base stats. The catalog is cached in the browser for seven days; users may also enter a specific hull name manually without fetching the complete list. If ESI cannot load the full catalog, the UI reports the partial result or retains the last complete cache rather than claiming complete coverage.

**Neutral defaults:** All factory ship-profile names now equal their hull names (including **Retriever**, **Tayra**, etc.). The former personalized Retriever label has been removed from defaults, placeholders, and default mining rates. Older records using that exact factory label are migrated to **Retriever**; independently named, user-created profiles and fitted settings are preserved. Player-specific ship nicknames remain optional and local to the player's saved fitting.

The ship library holds up to 128 locally saved fits, while the searchable EVE ship catalog is kept separately; having hundreds of catalog hulls does not fill the saved-profile limit. Fitted skill/implant stats still require entered overrides when ESI has only public hull data. Some unpublished NPC/developer hull types may be listed by the public ship category but will be rejected when selected if their type is not published; the catalog is not a claim that every ship is flyable.

Deterministic ship math tests remain available through node tests/ship.test.js; full live ESI catalog loading and the Windows UI still require on-machine testing.


## v0.5.2: Automatic ESI ship list and complete CSV export

The Ship Fitting Library now **automatically requests the complete public Ship-category list** from CCP's live ESI when no valid cached catalog exists or the prior catalog is more than seven days old. It downloads category 6's groups, discovers all type IDs from published groups, and resolves their names via bounded batches of ESI POST requests. Fetches are nonblocking, so normal dashboard controls and CB radio remain usable during initialization. Public ESI needs an internet connection but does not require character authentication.

When an ESI name batch contains an unresolvable or unpublished type ID and returns 400/404, the loader bisects that batch and retries the valid subsets. Type IDs that still cannot be named remain in the catalog as **UNRESOLVED TYPE #ID**, with their ship class. This preserves every returned type ID without falsely claiming that an unidentified hull is flyable. Other request failures flag a partial catalog and do not overwrite a previously complete cache. The UI displays the number of loaded ship-category type IDs, groups, and unresolved names, and allows a manual refresh.

**EXPORT FULL LIST · CSV** downloads every indexed type ID, hull name (or unresolved-ID placeholder) and group. The export contains all fetched rows, not just the first 80 visible search results. File name: `4nik8-eve-ship-catalog-YYYY-MM-DD.csv`. The complete catalog is kept separate from the per-user saved fitting library; no personal ship names or fittings are published.

Verified locally with mocked ESI responses via `node tests/ship_catalog.test.js`, including automatic load, caching, independent selection, CSV rows, and a failing-name-batch split/retry. Existing ship math tests also pass via `node tests/ship.test.js`. **The real ESI download and precise current number of hull IDs have not been verified in this environment**; inspect the in-app count or CSV after launching the updated version on a PC with ESI access.


## v0.6.0: Full ESI market items + visual New Eden Market Explorer

**Complete market-listed item index, not just ores.** The Market Explorer's **SYNC ALL MARKET ITEMS FROM ESI** button retrieves every ID in the ESI market-group index (GET /markets/groups/), obtains each market group's item type IDs (GET /markets/groups/{id}/) and resolves their names using POST /universe/names/. It includes ships, modules, ammunition, components, minerals, ores, ice, gas, PLEX and other market-listed types, rather than only the previously hardcoded resources. Parent market groups with no direct types are supported. Every returned type ID is retained; unresolvable names are labeled as such, and an incomplete group sync never silently replaces an earlier complete catalog. The complete catalog is cached in browser storage for seven days; if local browser storage quota is unavailable it remains in memory for the session. Use the exact item name/type ID lookup if a catalog sync is unavailable. **EXPORT COMPLETE ITEM LIST · CSV** downloads every indexed market type's ID, name, market group and hierarchy (not only matching search suggestions), enabling offline inspection.

**Resource catalog:** Resource browsing filters the ESI item catalog to asteroid ores, moon ores, ice and gas (all variants and grades found in public market groups). Browse the whole set, filter by name, and select up to 12 resource types to price per scan. A bounded scan is intentional because the ESI regional market-order endpoint is rate limited. For new users, previously supported common ore and ice examples are automatically selected after the first catalog sync, but they do not define or restrict the catalog. The old 10-item hardcoded list is no longer a pricing index. Ore/ice scan settings and selected ESI type IDs are preserved through Windows settings backups. Compressed ore/ice/moon variants are cross-referenced when ESI exposes them and their per-unit volumes. Gas is quotable in the resource board but **does not** invent a gas-harvester m³/hour from strip miner or ice harvester settings; gas-harvesting yield still needs a dedicated model.

**Visual cross-region Market Explorer:** Type any market-listed item's exact EVE name or numeric type ID, or choose from the indexed catalog's search suggestions. Compare all public known-space market regions returned by ESI, or choose the five major trade-hub regions for a quicker look. Each region's filtered ESI order book (GET /markets/{region_id}/orders/?order_type=all&type_id=...) is summarized by **lowest sell ask** (price to BUY), **highest buy bid** (price to SELL), visible order count and quantity. The explorer shows global top quotes, approximate locations, two ranked horizontal bar-chart views and a scrollable regional table. Known-space scope excludes wormhole-space regions that do not expose public regional markets. Results include the timestamp, total regions attempted and failure count; regions missing due to an API error are *not* treated as zero-price markets. Each filtered ESI order query is cached for at least five minutes; calls are paced and concurrency limited. Item quantity, order range, docking access, taxes, transport, price movement and risk still matter. A cross-region unit spread is **not** a guaranteed executable arbitrage profit. Public ESI cannot display private structure-market orders without the relevant authentication and access.

**Source files:** market_explorer.js (market groups, complete item ID catalog, public regional order comparison), resource_catalog.js (mineable-resource selection), plus app.js, logic.js, index.html and styles.css. The Windows launcher now serves both new JavaScript modules. The default routing preference remains stargates only; wormhole connection routing is **not** implemented in this release.

**Tests:** node tests/market_explorer.test.js covers complete market-group enumeration, mining group categorization, compressed-ore linking, valid market name lookup, all-region quote comparison and price graph rendering with mocked ESI; node tests/ship_catalog.test.js and node tests/ship.test.js continue to test ships. The real public ESI endpoints and Windows browser integration were not reachable for full live tests in the development environment. Initial full catalog sync requires online access and may take time because ESI market-group requests are individually rate-limited.


## v0.6.1: Public market-order parity, price execution & reliability

**Every scanned public order, every scanned region:** The new market_accuracy.js preserves ESI order IDs, exact numeric prices (displayed to two ISK decimals), current remaining and original quantities, minimum trade volumes, issuing location IDs and solar systems, buy/sell side, issued time, duration and the exact original order-range code. Range codes include station, solarsystem, region, and 1/2/3/4/5/10/20/30/40 jumps. The order-audit table shows 50 orders per page with side and region filters, and **EXPORT ALL FETCHED ORDERS · CSV** includes every validated order from every successfully scanned public region, not just the best bid. The raw CSV can be compared with EVE's own market interface by order ID. Invalid books are reported as failed regions rather than misrepresented as complete.

**Pagination & failure transparency:** When ESI explicitly returns X-Pages > 1 for an item's regional order query, all advertised pages are fetched; a partial page failure excludes that region from global rankings. The same complete, validated order retrieval is shared by the Market Explorer, ore/ice scanner and NPC trade-run scanner. ESI cache and the number of regions/pages/orders checked are displayed. If a region fails, the UI reports partial coverage rather than inventing prices. Order calls have roughly five-minute caching and can differ from the in-game order book as trades occur.

**Trade accuracy & ranges:** The explorer separates the highest advertised bid and lowest advertised ask from *quantity-checked single-issuing-station* book quotes. Quantity analysis respects remaining volume, minimum volume, actual per-order prices and partial fills, without combining unrelated station books. NPC-only and all-public filters are available. Ranged buy orders can be checked against a verified NPC delivery station in the operating system; station, solar-system and region scopes are evaluated directly, while numeric jump scopes use only ESI Shorter stargate routes verified to remain inside the issuing region. To cap route load, up to 12 distinct local-region issuer systems are automatically tested. Other numerical ranges are marked **unverified**, never guessed. Structure order access stays unverified; public ranged structure bids may be fulfillable at an NPC station without direct access to the issuer structure. The scope is public regional ESI data; private structure markets usually require authentication and access.

**Local vs global & visualization:** Compare global unit prices, the selected operating system's region, and all-region/hubs/local scopes. Chart bars now normalize so the longest bar means the most favorable side (cheapest ask or highest bid). Market quantities, station labels and the order-level audit are separate from guaranteed trade profit. **CALCULATE STARGATE TRADE RUN** sends the selected item to the Trade Run Scanner to evaluate NPC-only public station books against ESI stargate routes, available capital, taxes, cargo capacity and pilot-time assumptions. Models show **estimated profitable opportunities**, not confirmed trades.

**Resource accuracy:** The mining catalog excludes compressed, batch-compressed and processed products from mineable raw-resource selections. Filtering names does not implicitly rerun prices. If selected variants or the resource class change, the Opportunity Board marks old results **STALE** until a new scan finishes.

**Compact responsive interface:** Trade opportunity cards are collapsed by default and expand on demand, with a bounded independently scrolling area. Explorer filters and audit tables adapt to monitor widths.

**Windows settings error reporting:** The v0.6.1 PowerShell server now accepts bounded 1 MB settings snapshots (with the same per-field validation) and returns the specific validation error in the HTTP 400 response, which the dashboard displays as **SETTINGS NOT SAVED**. The application no longer embeds a redundant full selected-ship object inside the saved haul settings and does not falsely claim a durable backup on failure. Existing Windows AppData files and settings schema remain unchanged. Because the precise original rejection wasn't captured and the Windows PowerShell server wasn't executable in this development environment, **the user's prior HTTP 400 cannot be declared fixed until a full restart/save/restore test is run on Windows**.

**Regression coverage:** node tests/market_accuracy.test.js checks all 12 documented range values, exact prices and quantities, partial fills, minimums, regional and station delivery constraints, invalid books and duplicates. node tests/market_explorer.test.js tests multi-region comparison, paginated X-Pages order retrieval, delivery eligibility and audit rendering with mocked public ESI. Existing node tests/ship_catalog.test.js and node tests/ship.test.js remain green in the harness. Live EVE order parity, Windows settings persistence and authenticated private markets remain unverified.
