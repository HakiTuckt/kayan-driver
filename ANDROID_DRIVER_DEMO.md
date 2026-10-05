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

**A local debug APK has been compiled and its archive and signing certificate validated, but it has not been installed or device-tested.** GitHub Actions must complete separately to produce the downloadable workflow artifact. Do not describe the demo as device-validated until the APK has been installed and the checks below pass.

The checked-in `kayan-driver-ui-test.apk` predates the phone OTP changes. Build a fresh artifact after configuring and testing the Supabase Send SMS hook with Yoola WhatsApp delivery; the checked-in APK cannot validate phone registration or sign-in.

## Demo behavior and data

First launch asks for driver contact and vehicle information, then presents WhatsApp code verification as its own registration progress step before requiring a driving licence, national registration card, vehicle registration, and roadworthiness certificate file (PDF/JPG/PNG, maximum 10 MiB each). The driver must explicitly consent to the WhatsApp message. Back from code entry returns to the phone field. The verified phone is linked to the current Supabase identity, preserving its private profile and document storage. Returning drivers can sign in with phone OTP on another device. This is passwordless phone authentication, not true 2FA; the test build has no staff review or approval flow. Do not upload genuine identity documents. Trip history, chat, earnings, and availability reset on reload; online starts off.

Light/Dark/System selection uses the independent `kayan-driver-theme` device preference. The passenger theme key is unchanged. **Restart pre-registration** clears the introduction flag and session data without changing the theme.

All requests are locally generated. Pickup and trip progression are manual. The driver map uses Google Maps and automatically requests foreground device location when opened. Location is separate from trip simulation; system permission is required. Chat replies are scripted and call connection is visual only (no audio, telephone link or microphone). See [GPS_ANDROID_TESTING.md](GPS_ANDROID_TESTING.md) for permissions, privacy and GPS acceptance checks. Completed fares form illustrative gross totals; actual payable balance is zero. No real dispatch, payments, wallet, payouts, staff document review, or driver approval occur. Subscription pricing and rewards remain **unfinalized**; the demo defines no plans, prices, or rewards.

## Native Google Maps API keys

The Android driver APK displays the **native Google Maps Android SDK**, not a map inside an HTML/JavaScript map widget. Browser previews continue to use Google Maps JavaScript. The native map and browser/route requests need distinct keys because Google requires different application restrictions. Enable billing on the same Google Cloud project and enable:

- **Maps SDK for Android** — native Android map rendering.
- **Maps JavaScript API** and **Routes API** — browser preview and traffic-aware driving-route calculation.

After a driver accepts a demo request, Routes API returns alternative routes from the current device fix to the ride destination; the shortest traffic-aware duration is drawn on the native map.

Create two restricted keys in the same Cloud project:

1. **Android SDK key:** API restriction = **Maps SDK for Android** only. Application restriction = Android apps; package name `com.kayan.driver.demo` and SHA-1 signing certificate fingerprint for the debug certificate used by the APK. Do not use a website-restricted key for this SDK.
2. **Web and Routes key:** API restrictions = **Maps JavaScript API** and **Routes API** only. Application restriction = Websites; allow `https://localhost/*` for the Capacitor Android WebView, and the actual localhost origin/port used for browser preview (for example `http://localhost:8081/*`). This key is embedded in the web bundle and is not a server-side secret; keep the restrictions in place.

### GitHub APK build secrets

Add these repository Actions secrets:

- `GOOGLE_MAPS_ANDROID_API_KEY` — Android SDK-restricted key.
- `GOOGLE_MAPS_API_KEY` — website-restricted Maps JavaScript/Routes key.
- `ANDROID_DEBUG_KEYSTORE_BASE64` — a stable debug signing keystore encoded as one-line base64. The Android key's package/SHA-1 restriction must match this keystore; ephemeral CI signing keys would cause the native map to be rejected.

Create a dedicated debug keystore locally and keep the file private (do not commit it):

```sh
keytool -genkeypair -v -keystore kayan-driver-debug.keystore \
  -storepass android -alias AndroidDebugKey -keypass android \
  -dname "CN=KAYAN Driver Debug,O=KAYAN,C=ZM" \
  -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore kayan-driver-debug.keystore \
  -storepass android -alias AndroidDebugKey
```

Use the displayed SHA-1 fingerprint in the Android key restriction. Add the base64-encoded keystore as `ANDROID_DEBUG_KEYSTORE_BASE64` (Linux: `base64 -w 0 kayan-driver-debug.keystore`; macOS: `base64 < kayan-driver-debug.keystore | tr -d '\n'`). The workflow installs it as the stable CI debug signer. The keystore uses the standard debug alias/password expected by Android's debug build configuration; store it only in a trusted secret manager.

### Local build and browser preview

- Set `VITE_GOOGLE_MAPS_ANDROID_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` for `npm run build:driver`. They can be placed in the ignored `.env.driver.local` file; never commit keys.
- Also set `GOOGLE_MAPS_ANDROID_API_KEY` in the shell when running `node src/android/prepare-android.mjs`, so the Android manifest receives the native key.
- For a locally compiled APK restricted to the CI certificate, securely install/use the same debug keystore locally. Otherwise register the local debug certificate's SHA-1 as an additional allowed Android app fingerprint.
- Browser preview uses only `VITE_GOOGLE_MAPS_API_KEY`; allow the exact preview origin and port in its website restrictions.

The passenger app continues to use OpenStreetMap and does not need this key.

## Device acceptance checklist

- Install passenger and driver APKs together and confirm their distinct labels/package IDs.
- First launch: complete the profile and vehicle questions, then select four test documents; confirm each file step opens the Android file picker and has an explicit required state.
- Relaunch: a profile with all four stored document records opens the demo dashboard. A saved profile missing any required document resumes at the document-upload steps with its profile data preserved.
- Test Light, Dark, and System, including Android system appearance changes.
- Go online; decline, generate another request, accept, and advance pickup/trip/drop-off.
- Test chat, call connection/end, trip cancellation, earnings and history. Only completed trips contribute fares.
- Confirm the online toggle is locked during a trip and offline removes pending requests.
- Restart pre-registration and verify the session UI state is cleared.
- Check narrow screens, keyboard interaction, Android back behavior, and no payment prompts. Opening the driver map automatically requests foreground location permission; confirm denying permission shows an actionable error and no fabricated position. Confirm eagle launcher icons on both apps.
- On Android, confirm the Google map is rendered by the native SDK, the device marker updates, and an accepted demo ride draws its computed route. In a browser preview, confirm the JavaScript map still loads and the route is visible.

Google Fonts are optional external presentation resources; app simulation does not need a backend. Without network access, system font fallbacks are used. Production dispatch, approval, subscriptions, payments, signing, and store publication are outside this demo workflow.
