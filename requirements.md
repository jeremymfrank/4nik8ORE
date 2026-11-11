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