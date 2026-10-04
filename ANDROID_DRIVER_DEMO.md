# KAYAN Driver — separate Android demo

## App identity

- Driver app: **KAYAN Driver Demo**
- Android package: **com.kayan.driver.demo**
- Passenger package remains **com.kayan.passenger.demo**. Both APKs can be installed side by side.
- Driver configuration: `capacitor.driver.config.json`
- Driver web build: `build:driver` package script (Vite driver mode), output `dist-driver`.
- Driver builds open the driver experience at `/`; the shared web preview exposes it at `/driver`. Passenger booking and registration routes are not available in the driver build.

## Build an APK using GitHub

1. Push this project to a GitHub repository with Actions enabled.
2. Open **Actions → Build KAYAN Driver Android demo → Run workflow** and select the desired branch.
3. After a successful run, download **KAYAN-Driver-Android-Demo-APK** from the run’s artifacts and unzip it.
4. Transfer `app-debug.apk` to an Android test device. Allow installation from that source only if you trust it, then install the APK.

The isolated runner builds driver mode, replaces the runner’s Capacitor config with the driver config, generates Android, and compiles a debug APK. It does not change the committed passenger configuration or the existing passenger workflow. Node 22, Java 21, Android SDK, and Capacitor 7 follow the passenger packaging setup. This is a debug/test build, not a signed store release. No signing credentials are needed. Artifacts expire after 14 days.

**No Android APK has been compiled or device-tested in this editing session.** The workflow must complete in GitHub to produce the artifact. Do not describe the demo as Android-validated until that run and device checks pass.

## Demo behavior and data

First launch asks for fictional contact and vehicle information and sample document selection. No file chooser, camera, upload, account, application submission, or driver approval is connected. Finishing the introduction saves only `kayan-driver-intro=complete` on the device. Personal details stay in page memory; subsequent launches show a generic demo driver. Trip history, chat, earnings, and availability reset on reload; online starts off.

Light/Dark/System selection uses the independent `kayan-driver-theme` device preference. The passenger theme key is unchanged. **Restart pre-registration** clears the introduction flag and session data without changing the theme.

All requests are locally generated. Pickup and trip progression are manual. The map is now a real Leaflet/OpenStreetMap map with optional foreground device location, an accuracy circle and fix age. Device location is separate from trip simulation. Chat replies are scripted and call connection is visual only (no audio, telephone link or microphone). See [GPS_ANDROID_TESTING.md](GPS_ANDROID_TESTING.md) for permissions, privacy and GPS acceptance checks. Completed fares form illustrative gross totals; actual payable balance is zero. No real dispatch, payments, wallet, payouts, uploads, document review, or approval occur. Subscription pricing and rewards remain **unfinalized**; the demo defines no plans, prices, or rewards.

## Device acceptance checklist

- Install passenger and driver APKs together and confirm their distinct labels/package IDs.
- First launch: complete all three steps with fictional inputs; sample selection never opens device files.
- Relaunch: introduction is skipped with a generic profile; no personal details or trips persist.
- Test Light, Dark, and System, including Android system appearance changes.
- Go online; decline, generate another request, accept, and advance pickup/trip/drop-off.
- Test chat, call connection/end, trip cancellation, earnings and history. Only completed trips contribute fares.
- Confirm the online toggle is locked during a trip and offline removes pending requests.
- Restart pre-registration and verify all session data is cleared.
- Check narrow screens, keyboard interaction, Android back behavior, and no payment/upload prompts. Foreground location permission should appear only after explicitly enabling device location. Confirm eagle launcher icons on both apps.

Google Fonts are optional external presentation resources; app simulation does not need a backend. Without network access, system font fallbacks are used. Production dispatch, approval, subscriptions, payments, signing, and store publication are outside this demo workflow.
