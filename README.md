# 4NIK8 ORE — Industrial Command (Preview v0.3.2)

**Local-only, single-user EVE Online mining-market prototype**, optimized for a **1080×1920 portrait side monitor**. Features the **CB ContraBand Radio** with saved YouTube Music / YouTube playlist channels.

## Start on Windows

1. Extract the ZIP into a folder on your Windows PC.
2. Double-click **`START_COMMAND.cmd`**. Close the old launcher window before starting a new release. It launches a loopback-only Windows PowerShell HTTP server and opens the dashboard at `http://127.0.0.1:48148/`. Keep the launcher window open while using the app. No administrator rights required.
3. Select an EVE system, public comparison market, resource type, and sample mining volume, then select **SCAN MARKETS**.
4. Open **CB ContraBand Radio**. Paste a shared **YouTube Music** or **YouTube** playlist link, provide a channel name, and click **SAVE CB CHANNEL**.
5. Use **NEW CHANNEL** before adding an additional preset. Click a saved channel's **TUNE** button to load the playlist using the **official visible YouTube IFrame Player API**. Use the player and dashboard transport/volume controls.
6. Try **TRUCK LIVERY** in the upper right to switch among **4NIK8 Neon Freight**, **Bandit Amber**, **4NIK8 Steel**, and **Salvage Oxide**.

There are **no EVE or Google account credentials required** for public market scanning or shared playlist links. The local dashboard does need internet access to load ESI, public YouTube playlists, and streamed radio.

## CB ContraBand Radio details

- Save up to 40 locally named playlist presets; rename, delete, tune, skip, pause, adjust playback volume, and **toggle SHUFFLE**. The shuffle preference is stored alongside your stations in Windows AppData and is reapplied when you tune a new YouTube playlist. Local file tracks shuffle as well.
- Accepts `https://music.youtube.com/playlist?list=...`, `https://www.youtube.com/playlist?list=...`, and YouTube Music shared `watch?...&list=...` or `/browse/VL...` URLs.
- Saved channels, volume, livery and scanner preferences are written to **`%LOCALAPPDATA%\4NIK8 ORE\Industrial Command\settings.json`**, independent of the ZIP extraction folder. Browser `localStorage` remains as a fallback; first v0.3 launch migrates presets from v0.2. **`settings.json.bak`** is maintained on updates. The local server now retains the original verified YouTube Music share URLs and shuffle state when saving settings. **EXPORT SETTINGS** downloads a JSON backup; **IMPORT SETTINGS** restores one. Install updates by extracting the next build and closing the old local server first.
- **Second-channel bug fix:** Each TUNE initializes a fresh YouTube iframe. The player no longer carries old playlists into a newly selected station. Separate NEW CHANNEL and EDIT flows prevent accidental overwrites.
- **Error 2** is reported as an invalid YouTube player request/identifier, not assumed to mean a private playlist. If the normal YouTube playlist API returns error 2, the radio tries the official playlist embed parameters **once**, then shows an error and keeps the original copied share URL for **OPEN IN YOUTUBE MUSIC**. This is a compatibility attempt, not a guarantee of playback.
- Does not download, extract, or stream YouTube audio independently. YouTube embeds are shown in a visible player. **Collapsing the radio pauses YouTube playback**; the playlist remains available after expanding.
- Some private, blocked, age-restricted, geographic, or otherwise unembeddable playlists cannot play. Autoplay may require clicking the video player. YouTube Music Premium-specific features and private-account library syncing are **not supported**.
- Local music files and direct HTTPS audio streams are separate sources; local file selections must be chosen again after restart.
- YouTube requires a visible embedded player and an HTTP origin; opening `index.html` as `file://` is **not supported for playlist playback**. Always launch using the `.cmd` file.

## Visual livery preview

We could not reliably retrieve the exact colors of the provided RSI organization site in the build environment, so the palettes are **design experiments**, not authenticated copies of the organization's logo or banner. **4NIK8 Neon Freight** is now the default on first install. Previously chosen liveries are respected across upgrades. The v0.3 **Neon Freight** livery uses the colorful user-provided 4NIK8 banner image as a subtle masthead overlay with green, cyan, magenta, violet and orange accents. Palette switching remains available.

## What the market preview actually does

- Resolves the entered system and security rating from CCP ESI.
- Resolves a curated subset of raw and compressed ore/ice item names and volumes.
- Fetches **public regional buy orders** for the operating region and chosen hub region, respecting a short client-side cache.
- Ranks gross price per mined cubic meter using **single-station order depth** and marks partially covered loads.
- Lets you request a safer stargate route to public NPC buyer stations (changed route request to GET after the observed ESI 405; requires live verification).
- Keeps all calculations, playlist presets, and user settings on the local PC/browser (no hosted application account).

## Important limitations

- Gross ISK/m³ is **not** net ISK or actual ISK/hour. No mining-yield model, taxes, reprocessing, shipping costs, fuel, risk or time estimates are included yet.
- **Market demand does not prove there is an ore or ice anomaly** in the selected system; live sites are not discoverable from ESI.
- Wormhole systems can be entered, but current wormhole exits are not automatically known.
- Private Upwell structure markets and some null-sec buybacks require legitimately authorized access not present in this build.
- Regional buy orders may have range conditions; a quoted buyer does not guarantee that a load can be sold from every station in the system. Verify the destination in-game.
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

## v0.3.1 hotfix (Windows PowerShell 5.1)

- Fixed startup error `The string is missing the terminator: "` by using a strictly ASCII PowerShell launcher. The v0.3 source had a Unicode em dash without a BOM, which Windows PowerShell 5.1 could misinterpret as a closing quotation mark.
- Uses explicitly constructed `TcpListener` and UTF-8 encoder objects, compatible with Windows PowerShell 5.1.
- Includes the new in-game 4NIK8 corporation emblem, extracted from the user-provided screenshot, in the header.
- Includes all referenced static assets in the release ZIP.
- Existing CB radio stations and preferences remain in `%LOCALAPPDATA%\4NIK8 ORE\Industrial Command\settings.json`. Updating the program folder does not overwrite this file.

**Upgrade:** Stop the old server window, extract this ZIP into a new folder, then run `START_COMMAND.cmd`. If the old version stored radio channels only in browser storage, open the new release with the **same browser profile and address** on first launch to import them. Use the EXPORT SETTINGS button for an additional portable backup once the app opens.

## v0.3.2 CB radio update

- SHUFFLE on/off next to previous/play/next, using the official YouTube `setShuffle` command for embedded playlists. Applies again when changing channels.
- Saves `radio.shuffle` as an optional boolean in the existing v1 AppData settings format; older settings files are still compatible.
- Preserves full original YouTube Music share links when saving new channels, including query parameters, for the OPEN IN YOUTUBE MUSIC fallback.
- Tries a second official embed initialization method on error 2. A particular YouTube Music playlist can still remain incompatible with embedding; the app does not bypass YouTube's playback restrictions.
- Default theme remains 4NIK8 Neon Freight; previous manual livery selections remain saved.