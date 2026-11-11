# 4NIK8 ORE — Industrial Command (Preview v0.2.0)

**Local-only, single-user EVE Online mining-market prototype**, optimized for a **1080×1920 portrait side monitor**. Features the **CB ContraBand Radio** with saved YouTube Music / YouTube playlist channels.

## Start on Windows

1. Extract the ZIP into a folder on your Windows PC.
2. Double-click **`START_COMMAND.cmd`**. It launches a loopback-only Windows PowerShell HTTP server and opens the dashboard at `http://127.0.0.1:48148/`. Keep the launcher window open while using the app. No administrator rights required.
3. Select an EVE system, public comparison market, resource type, and sample mining volume, then select **SCAN MARKETS**.
4. Open **CB ContraBand Radio**. Paste a shared **YouTube Music** or **YouTube** playlist link, provide a channel name, and click **SAVE CB CHANNEL**.
5. Click the saved channel's **TUNE** button to load the playlist using the **official visible YouTube IFrame Player API**. Use the player and dashboard transport/volume controls.
6. Try **TRUCK LIVERY** in the upper right to switch among **Bandit Amber**, **4NIK8 Steel (draft)**, and **Salvage Oxide (draft)**.

There are **no EVE or Google account credentials required** for public market scanning or shared playlist links. The local dashboard does need internet access to load ESI, public YouTube playlists, and streamed radio.

## CB ContraBand Radio details

- Save up to 40 locally named playlist presets; rename, delete, tune, skip, pause, and adjust playback volume.
- Accepts `https://music.youtube.com/playlist?list=...`, `https://www.youtube.com/playlist?list=...`, and YouTube Music shared `watch?...&list=...` or `/browse/VL...` URLs.
- Saved channels, volume, and livery are stored in **browser `localStorage`** under the **localhost** origin. Use the same browser/profile and launcher for persistence. Clearing site data will erase saved presets; a future build will add backup/export.
- Does not download, extract, or stream YouTube audio independently. YouTube embeds are shown in a visible player. **Collapsing the radio pauses YouTube playback**; the playlist remains available after expanding.
- Some private, blocked, age-restricted, geographic, or otherwise unembeddable playlists cannot play. Autoplay may require clicking the video player. YouTube Music Premium-specific features and private-account library syncing are **not supported**.
- Local music files and direct HTTPS audio streams are separate sources; local file selections must be chosen again after restart.
- YouTube requires a visible embedded player and an HTTP origin; opening `index.html` as `file://` is **not supported for playlist playback**. Always launch using the `.cmd` file.

## Visual livery preview

We could not reliably retrieve the exact colors of the provided RSI organization site in the build environment, so the palettes are **design experiments**, not authenticated copies of the organization's logo or banner. Keep **4NIK8 Steel** as the draft default, or switch back to **Bandit Amber** while comparing. A screenshot of the organization banner can be used to extract a precise palette in a later update.

## What the market preview actually does

- Resolves the entered system and security rating from CCP ESI.
- Resolves a curated subset of raw and compressed ore/ice item names and volumes.
- Fetches **public regional buy orders** for the operating region and chosen hub region, respecting a short client-side cache.
- Ranks gross price per mined cubic meter using **single-station order depth** and marks partially covered loads.
- Lets you request a safer stargate route to public NPC buyer stations.
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
- `python tests/browser_test.py` runs an **offline, mocked YouTube player UI test** in Chromium/Playwright covering saves, tuning, transport controls, volume, collapse, persistence, edits, deletion, URL rejection, and livery changes. This does **not** verify actual playback on YouTube or live ESI connectivity.

## Official references

- [CCP ESI documentation](https://developers.eveonline.com/docs/services/esi/overview/)
- [CCP API market rate limits](https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026)
- [YouTube embedded player requirements](https://developers.google.com/youtube/player_parameters)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)

EVE Online and YouTube are trademarks of their respective owners. This is an independent 4NIK8 fan application, not an official CCP or Google product.