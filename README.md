# 4NIK8 ORE — Industrial Command (Preview v0.1.0)

This is a **local-only, single-user, 1080×1920 portrait-optimized first prototype**, not a finished Windows installer.

## Start on Windows

1. Extract the ZIP into a permanent folder on your Windows PC.
2. Double-click **index.html** to open it in Microsoft Edge or Google Chrome.
3. Choose a real EVE Online system (Gammel, Sosala, Jita, or a J-system), then select a comparison market.
4. Select **ORE** or **ICE** and click **SCAN MARKETS**.
5. Click an opportunity to inspect public buy-order depth and calculate a safer route to its buyer station.
6. Expand the **CB ContraBand Radio** panel to load local audio files or tune in to a direct HTTPS radio-stream URL. Browser playback may require clicking Play.

No installation, server, VPN, EVE password, or API key is required in this preview.

## What the preview actually does

- Resolves your entered system through CCP ESI.
- Determines the system's region and security rating.
- Resolves curated ore and ice item types and volumes from CCP ESI.
- Fetches **public regional buy orders** for raw and compressed types in the operating region and selected comparison region.
- Ranks buyers using actual order quantities and **single-station** buy-order depth for the sample load.
- Displays a gross ISK/m³ value and marks partial liquidity.
- Resolves an NPC buyer station and a safer stargate route on demand.
- Provides a real local-audio/stream playback panel.

## Important limitations

- This is a functional **prototype**, not a complete mining-profitability model. ISK/m³ is **gross sale value**, not ISK/hour or net profit. No ship-yield model, taxes, reprocessing, loading time, fuel expense, or gank risk is included yet.
- A **market opportunity does not prove the ore or ice is available** in the selected system. ESI has no public real-time anomaly scanner.
- Wormhole system names are accepted, but wormhole connections and current exits are not published by ESI. Public market orders in a wormhole region may be unavailable.
- No private Upwell structure market orders are included. Some null-sec markets need authenticated access.
- An ESI market quote is a snapshot, not a guaranteed executable trade. Prices and order volumes can change, regional buy orders can be limited to particular locations, and seller travel remains necessary.
- The app prioritizes a single station that can buy the sample amount, so it will not artificially aggregate prices from scattered buyer stations.
- Loaded local audio files are not automatically reopened after closing the browser. This is a browser security restriction.
- EVE APIs and internet radio require connectivity. The UI and code run locally.
- If ESI is down or browser CORS prevents access, the app displays an explicit error and *never invents prices*.
- Data is held temporarily in memory for the ESI cache interval; there is no permanent history database yet.

## Notes for the full Windows build

The next engineering step is to put this UI behind a local ASP.NET Core/.NET 10 host with SQLite, a durable cache, EVE SSO with PKCE for optional read-only data, and a real Windows launcher. A host also avoids browser/file-origin limitations, allows robust scheduled refreshes, and protects any future tokens with Windows DPAPI.

Initial deployment should be **Windows, local only, one user, portrait screen**. Multiuser and VPN come later if the corporation wants them.

## Sources

- [CCP ESI documentation](https://developers.eveonline.com/docs/services/esi/overview/)
- [CCP ESI best practices](https://developers.eveonline.com/docs/services/esi/best-practices/)
- [CCP market endpoint rate limiting](https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026)
- [CCP route API update](https://developers.eveonline.com/blog/route-to-the-future-upgrading-the-route-route)
- [CCP static data](https://developers.eveonline.com/docs/services/static-data/)

EVE Online is a trademark of CCP hf. This is an independent fan-created proof of concept, not an official CCP product.