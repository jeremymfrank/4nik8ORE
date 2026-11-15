# 4NIK8 ORE Industrial Command — Android edition (v0.6.2)

The Android app uses the SAME checked-in HTML, CSS, ESI market order logic, ship catalog, ship math and radio code as the Windows Industrial Command dashboard. It is packaged in a native Android WebViewAssetLoader, with a five-tab touch interface and private on-device settings.

## Install on Scooter's device

1. Open the repository's **Actions** tab on GitHub.
2. Select **Android Industrial Command APK**, then a successful run on `main`.
3. Download the artifact named **IndustrialCommand-Android-v0.6.2-debug**.
4. Extract `app-debug.apk` from the ZIP, transfer it to the Android device, and tap it to install. Android may require **Allow from this source** for the Files or browser application used to open the APK.
5. Open **Industrial Command**. Use the bottom tabs: **Mine / Freight / Market / Ships / Radio**. The app automatically loads the public ship and market catalog when online. No Windows computer or local server is needed.

This is a **debug-signed test APK**, not a Google Play release. CI runners create a fresh debug signing key. **For subsequent APK builds you may need to export settings and uninstall the older build before installing a build signed by another key.** On the device, **EXPORT SETTINGS** saves a JSON backup through Android Files; after reinstalling, **IMPORT SETTINGS** restores it. Do not assume an APK update with a different signature preserves app storage. A real production release should use a stable private signing key stored securely in GitHub Actions secrets (never commit it to the repository).

## Using Industrial Command

The **Ships** tab is simple: search EVE's hull catalog, choose the matching ship, and click **ADD THIS SHIP**. The hull's ESI values are fetched and stored automatically. Pilots can independently select their ships in mining, freight, trade and opportunity comparisons. **CUSTOMIZE MY FIT** is optional and collapsed by default, for personal skill bonuses, rigs, EFT imports, or exactly measured fitting values.

The **Mine** tab contains navigation, ore/ice/gas selection, the Opportunity Board, and mining performance. Tap an ore to view its Freight destinations. The **Freight** tab contains the profit analyzer and Trade Run Scanner. **Market** searches all public regional ESI orders, preserving exact prices, quantities and ranges; **Radio** provides the existing CB ContraBand channels.

The dashboard ships with its UI/code bundled for local use, but public ESI market prices, routes and refreshed ship data still require an internet connection. Cached markets can become stale offline. Public ESI does not disclose private structure markets, personal skills, implants or all fitted effects without authentication. Existing ESI limitations and stargates-only default routing remain in force. Some music services restrict embedded playback and may open externally.

Android and Windows each keep their own settings by default. They can exchange explicit JSON exports/imports; there is no silent synchronization, external account or tracking service. The app requests **INTERNET only**. Android Settings are atomically saved under the app's private files directory; exports and imports use the system file picker.

## Build it yourself

Open the `android/` directory in Android Studio, with JDK 17, Android SDK platform 35, Android Gradle Plugin 8.7.3 and Gradle 8.9. If using a command line Gradle installation, run:

```sh
cd android
gradle :app:assembleDebug
```

The APK will be written to `android/app/build/outputs/apk/debug/app-debug.apk`.

The Gradle `bundleSharedWeb` task copies the root source files and image assets into the Android APK before every build. **Do not maintain a forked copy of logic.js or app.js**; source changes automatically propagate to both platforms.

CI builds using the GitHub workflow in `.github/workflows/android-apk.yml` and publishes the APK as a downloadable workflow artifact.

## Implementation notes

* `WebViewAssetLoader` provides an HTTPS app origin (`https://appassets.androidplatform.net/assets/index.html`) rather than unsafe `file://` access.
* `WebViewCompat.addWebMessageListener` permits native requests only from this origin and the main frame. Third-party iframes, radio providers and linked sites cannot call the native message handler. The bridge only supports **settings.load**, **settings.save**, and **file.export**.
* `AtomicFile` is used for private durable settings; the system `ACTION_CREATE_DOCUMENT` picker writes exports without storage permissions. Import uses WebChromeClient's file chooser.
* `android_bridge.js` detects the Android origin; on Windows it is inert. `android.css` is loaded only by the Android shell. The Android home/back behavior returns to the Mine tab before exiting.
* Debug and mock regression tests: `node tests/android_bridge.test.js`, `node tests/android_project.test.js`, `node tests/ship_catalog.test.js`, and `node tests/market_accuracy.test.js`. Physical Android installation, touch navigation, ESI access, audio playback and persistent settings require on-device tests after the first APK is built.
