# KAYAN Driver — separate Android demo

## App identity

- Driver app: **KAYAN Driver Demo**
- Android package: **com.kayan.driver.demo**
- Passenger package remains **com.kayan.passenger.demo**. Both APKs can be installed side by side.
- Driver configuration: `capacitor.driver.config.json`
- Driver web build: `build:driver` package script (Vite driver mode), output `dist-driver`.
- The Driver APK uses the native Android Google Maps SDK through Capacitor. The interactive Driver experience is also available in browser previews, which use Google Maps JavaScript API.

## Build an APK using GitHub

1. In Google Cloud, enable **Maps SDK for Android** and create a key restricted to that API. The Driver package ID is `com.kayan.driver.demo`. Android app restrictions require the matching signing certificate SHA-1; these workflows use CI debug signing that can change between runners, so app restrictions need a stable signing certificate to work reliably.
2. Enable **Maps JavaScript API** and create a separate browser key restricted to that API and the HTTPS referrers used for your browser preview/deployment. This key is visible in browser code; referrer and API restrictions are required.
3. Push this project to a GitHub repository with Actions enabled. In **Settings → Secrets and variables → Actions**, create `GOOGLE_MAPS_API_KEY` for Android and `GOOGLE_MAPS_BROWSER_API_KEY` for browser builds. Never commit either key or post it in chat.
4. Open **Actions → Build KAYAN Driver Android demo → Run workflow** and select the desired branch.
5. After a successful run, download **KAYAN-Driver-Android-Demo-APK** from the run’s artifacts and unzip it.
6. Transfer `app-debug.apk` to an Android test device. Allow installation from that source only if you trust it, then install the APK.

The isolated runner builds driver mode, replaces the runner’s Capacitor config with the driver config, builds the browser preview with the restricted browser key, installs native Google Maps, injects the Android key into the generated manifest, and compiles a debug APK. It does not change the committed passenger configuration or passenger workflow. Node 22, Java 21, Android SDK, and Capacitor 7 follow the passenger packaging setup. This is a debug/test build, not a signed store release. The Android key is visible in the APK and the browser key is visible in web code, so API restrictions are essential. See [GPS_ANDROID_TESTING.md](GPS_ANDROID_TESTING.md) for setup and signing limitations. Artifacts expire after 14 days.

**No Android APK has been compiled or device-tested in this editing session.** The workflow must complete in GitHub to produce the artifact. Do not describe the demo as Android-validated until that run and device checks pass.

## Demo behavior and data

First launch asks for fictional contact and vehicle information and sample document selection. No file chooser, camera, upload, account, application submission, or driver approval is connected. Finishing the introduction saves only `kayan-driver-intro=complete` on the device. Personal details stay in page memory; subsequent launches show a generic demo driver. Trip history, chat, earnings, and availability reset on reload; online starts off.

Light/Dark/System selection uses the independent `kayan-driver-theme` device preference. The passenger theme key is unchanged. **Restart pre-registration** clears the introduction flag and session data without changing the theme.

All requests are locally generated. Pickup and trip progression are manual. The Android driver map uses native Google Maps centered on Lusaka. Device location is shown on the map after the driver grants Android location permission; coordinates are not displayed in the UI or shared with KAYAN. Google receives device location for the map indicator. Browser previews use Google Maps JavaScript API with optional browser location. Device location is separate from trip simulation. Chat replies are scripted and call connection is visual only (no audio, telephone link or microphone). See [GPS_ANDROID_TESTING.md](GPS_ANDROID_TESTING.md) for permissions, privacy and GPS acceptance checks. Completed fares form illustrative gross totals; actual payable balance is zero. No real dispatch, payments, wallet, payouts, uploads, document review, or approval occur. Subscription pricing and rewards remain **unfinalized**; the demo defines no plans, prices, or rewards.

## Device acceptance checklist

- Install passenger and driver APKs together and confirm their distinct labels/package IDs.
- First launch: complete all three steps with fictional inputs; sample selection never opens device files.
- Relaunch: introduction is skipped with a generic profile; no personal details or trips persist.
- Test Light, Dark, and System, including Android system appearance changes.
- Go online; decline, generate another request, accept, and advance pickup/trip/drop-off.
- Test chat, call connection/end, trip cancellation, earnings and history. Only completed trips contribute fares.
- Confirm the online toggle is locked during a trip and offline removes pending requests.
- Restart pre-registration and verify all session data is cleared.
- Check narrow screens, keyboard interaction, Android back behavior, and no payment/upload prompts. On a fresh Android Driver launch, confirm the precise-location gate is shown before the Driver experience and Google Map; location appears only after permission and a fresh fix. Confirm eagle launcher icons on both apps.

Google Fonts are optional external presentation resources; app simulation does not need a backend. Without network access, system font fallbacks are used. Production dispatch, approval, subscriptions, payments, signing, and store publication are outside this demo workflow.
