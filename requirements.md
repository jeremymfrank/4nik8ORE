# 4NIK8 Industrial Command — Product Requirements

## Product statement
Automatic opportunity intelligence for ore and ice mining plus hauling across all EVE space, displayed on a dedicated portrait monitor. No fake prices; provenance and age on every quote.

## First-release product constraints
- Windows local only, single user (Jawatech) to start.
- No dependency on other pilots connecting data.
- ESI public market feeds without authentication first; ESI OAuth/PKCE later.
- Corporate and personal assets are separate ownership categories.
- No gameplay automation, client interaction, or private game-cache scraping.
- Show opportunities as conditional when resource site availability is not known.
- Ship/skill yield derived from explicit authorized profile or an identified estimate, never implicit.

## Later features
1. Live gross ISK/m³ and single-station depth for more ore/ice types (preview implements a subset).
2. Net profit after actual sales tax, broker fee where applicable, hauling costs, reprocessing yields and compression logistics.
3. Mining ISK/hour calibrated via authorized skills/ships, measured mining data, or a clearly marked ship profile.
4. Nearby-region and route selection, nullsec buyback markets (authenticated when allowed), jump freighter logistics, and manual/imported wormhole map connections.
5. SQLite history, snapshots, alert thresholds, recurring sync and offline readiness.
6. CB ContraBand Radio — **v0.2 supports saved public YouTube Music playlist channels**, visible official IFrame playback, local audio and HTTPS streams; future: preset backup/export, richer channel browser, stream failure handling.
7. Reusable app launcher and self-updating installer.

## Accuracy invariant
Never label market price as a guaranteed executable payout; never label a market opportunity as a verified mineable anomaly; never treat wormhole topology as persistent or automatically known.


## v0.3 — Radio, color and settings
- Persist CB channels, radio volume, livery and scanner preferences to per-user Windows AppData independent of extracted release folders.
- Maintain browser storage as v0.2 migration/fallback, keep a disk backup, and provide explicit JSON export/import.
- Treat YouTube error 2 as a bad player parameter; never conflate unlisted playlist sharing with embed compatibility.
- Reset the YouTube iframe/player when tuning another channel; keep a direct link to the selected playlist on YouTube.
- Separate NEW CHANNEL from EDIT; prevent duplicate entries for the same playlist ID.
- Offer neon multicolor livery inspired by the 4NIK8 org banner while maintaining accessible profit numbers.
- Correct route endpoint method to GET, validate via real ESI on user system.

- Launcher script must be valid in Windows PowerShell 5.1: use ASCII-only for `.ps1` source or UTF-8 BOM, and include a static regression test to catch non-ASCII syntax hazards.
- Release ZIP must include every referenced asset.

## CB Shuffle and link handling (v0.3.2)
- Toggle SHUFFLE with a persistent pressed state; YouTube `setShuffle(true/false)` and restore shuffle on station change once playlist data is loaded.
- Playlist error 2 triggers at most one alternate official embed initialization. Do not retry indefinitely.
- Store original validated music.youtube.com share URLs in AppData; preserve all user station presets and volume.
- 4NIK8 Neon Freight is the first-install default; existing selected livery overrides the default.

- v0.3.3: On failed embed, hide nonfunctional video, show original YouTube Music playlist link and external-control warning; keep saved channel and do not mark it ON AIR.

## v0.4
- Factory radio preset Jupiluxe on fresh empty install only; never overwrite existing settings.
- Remove external YouTube Music fallback UI and buttons.
- One scan covers major public trading regions plus operating region; list actual single-station depth and gross value for each item, with trade-region alternatives.
- Auto route via CCP documented POST where stargate routes exist; no route estimates for unknown wormhole exits.
- Mining-site presence, private structure markets, net profit and genuine ISK/hour are not available in v0.4.


### Freight Analyzer v0.4.1
- Fetch and cache new ESI `POST /route` response, use documented `route` field and check origin/destination.
- Prefetch up to 28 common buyer-system routes during a market scan; avoid unrealistically exhaustive route calls.
- Use actual buy-order quantities from one station; do not sum different stations to make a sale.
- Fetch NPC station names via public ESI; restricted Upwell structures remain unverified.
- Price compressed cargo using the ESI physical volume of the compressed type; compare gross and estimated net, with user-defined tax, haul allowance and trip count.
- Never claim mining-site availability, price PvP risk without evidence, or infer real ship cargo capacity from the target mined volume.
### v0.4.2 cash freight default

Default monetary stargate hauling expense is 0 ISK/jump for own-ship hauling. Time is tracked separately. Existing saved user-defined charges remain unchanged during upgrades.
