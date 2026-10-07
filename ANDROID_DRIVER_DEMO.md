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

The checked-in `kayan-driver-ui-test.apk` predates the current registration flow. Build a fresh artifact to test application submission, the thank-you screen, and the **Discover Demo Mode** button. The Meta WhatsApp Cloud API hook is still needed only to test sign-in for returning accounts with an already verified phone.

## Demo behavior and data

First launch offers **Restore Demo Driver** to reopen the fictional Lusaka demo profile without signing in; only a demo-mode marker is saved locally, and trip activity still resets on reload. Otherwise, registration asks for driver contact and vehicle information without phone verification, then requires a driving licence, national registration card, vehicle registration, and roadworthiness certificate file (PDF/JPG/PNG, maximum 10 MiB each). After submission, a thank-you screen confirms receipt, says the KAYAN team will contact the driver at the provided number, and offers **Discover Demo Mode**. The application is stored under an anonymous Supabase Auth session; clearing app data or reinstalling can make it unrecoverable, so do not sign out of that session or upload genuine identity documents. The in-app demo does not review or approve applications. Returning accounts that already have a verified phone can still sign in with WhatsApp OTP. This is passwordless phone authentication, not true 2FA. Chat, earnings, and availability reset on reload; online starts off.

Light/Dark/System selection uses the independent `kayan-driver-theme` device preference; the passenger app uses its own theme preference. **Restart pre-registration** clears the introduction flag and session data without changing the theme.

By default, requests are locally generated. Optional Supabase live dispatch can be enabled for passenger-to-driver offers; the backend only notifies approved drivers who are online. Pickup and trip progression remain manual. The driver map uses Google Maps and requests foreground device location when opened; location is not sent to the dispatch backend. Trip fare collection, commission settlement, chat, call, wallet, and payout are not connected. See [GPS_ANDROID_TESTING.md](GPS_ANDROID_TESTING.md) for permissions, privacy and GPS acceptance checks. Fuel use is a broad estimate based on entered engine size, fuel type, model category, and year—not a manufacturer-rated figure.

### Optional live ride offers and Android push

Live dispatch is off unless `VITE_ENABLE_LIVE_DISPATCH=true`. Before enabling it, apply [`supabase/migrations/20261005214000_live_ride_dispatch.sql`](supabase/migrations/20261005214000_live_ride_dispatch.sql), [`supabase/migrations/20261006050000_driver_passenger_ride_stages.sql`](supabase/migrations/20261006050000_driver_passenger_ride_stages.sql), then [`supabase/migrations/20261006135000_mtn_momo_collection.sql`](supabase/migrations/20261006135000_mtn_momo_collection.sql); keep Supabase Anonymous sign-ins enabled and deploy `supabase/functions/create-ride-request` with JWT verification enabled. The migrations add ride/offer tables, driver availability, realtime publication, protected RPCs, ordered driver trip stages, and MTN payment records. The passenger can request one of the built-in Lusaka destinations and choose a payment preference.

When the driver marks arrival, starts the trip, or reaches drop-off, the passenger receives an in-app realtime alert and a persisted Activity update. These stage alerts are not push notifications; both apps must have live dispatch enabled and be connected for immediate in-app alerts.

### Passenger MTN MoMo Collection sandbox

When **MTN MoMo** is selected for a booking, the passenger can request payment only after the driver completes the ride. The passenger enters a Zambian MTN MoMo number then; the app sends it to MTN for that sandbox request and does not save it or collect the MoMo PIN/OTP. The fare comes from the completed ride record, not the browser. The app polls MTN's Request to Pay status and prevents another request while one is pending or after one succeeds. This integration is sandbox-only; it cannot collect production funds. Other payment choices remain preferences and are not processed.

Subscribe to **Collection** and provision sandbox **API User**, **API Key**, and **Collection subscription key** in the [MTN MoMo Developer Portal](https://momodeveloper.mtn.com/API-collections#api=collection). Add these as Supabase Edge Function secrets—never Vite variables, APK contents, or source control:

- `MTN_MOMO_API_USER`
- `MTN_MOMO_API_KEY`
- `MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY`

After applying the migrations, deploy `create-ride-request` and `mtn-momo-payment`; both use JWT verification. `mtn-momo-payment` calls MTN from the server and uses sandbox target environment with ZMW. MTN status is checked by polling, so no callback URL is configured. Use only MTN's sandbox test accounts and numbers; do not enter production API credentials into this sandbox integration.

Only drivers whose `driver_profiles.account_status` is `active` can go online. New applications are `pending_review`; there is no staff-approval screen or client-side approval shortcut. Approve test drivers only through an authorized server-side process. Drivers must be online, recently active, and not already handling a ride or offer.

For web builds, set `VITE_ENABLE_LIVE_DISPATCH=true`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.driver.local` (or the relevant web-build environment). For the GitHub driver APK workflow, set those three as repository Actions variables; set the dispatch variable to `true` only after the Supabase setup is complete.

### Driver subscriptions and commission

Only approved driver accounts can subscribe. Free drivers accrue **5% of each completed live-trip fare** as commission due to KAYAN. Plus costs **ZMW 399/month** and Premium costs **ZMW 499/month**; either active paid plan accrues **0% commission** during its paid period. Commission is recorded by the server when a live ride is completed; MTN MoMo collection is a separate sandbox passenger payment and does not settle driver commission.

Premium also earns one fuel-tank benefit for each complete three-month period of uninterrupted Premium coverage with at least **100 successful live trips in that period**. An authorized KAYAN reviewer enters the voucher value and reference after arranging the benefit; the app does not buy fuel or transfer funds.

Google Play handles auto-renewal and cancellation. Configure two monthly subscription products in Play Console:

| Product ID | Base plan ID | Price |
|---|---|---:|
| `kayan_driver_plus` | `monthly` | ZMW 399/month |
| `kayan_driver_premium` | `monthly` | ZMW 499/month |

The APK must be distributed through a Play testing track and installed from Google Play for purchase testing; a side-loaded debug APK cannot complete a real Play subscription. Add license testers in Play Console. The app reads localized prices from Play, and the backend independently verifies every purchase.

Apply [`supabase/migrations/20261006060000_driver_subscriptions_commission.sql`](supabase/migrations/20261006060000_driver_subscriptions_commission.sql) after the live-dispatch and driver-stage migrations. Deploy `verify-driver-subscription` and `driver-subscription-admin` with JWT verification enabled, and deploy `google-play-rtdn` with Supabase JWT verification disabled; that endpoint verifies Google Pub/Sub OIDC tokens itself. In Supabase Edge Function secrets, configure `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` for a service account authorized to use the Google Play Developer API. Configure an authenticated Pub/Sub push subscription for the RTDN endpoint and set `GOOGLE_PLAY_RTDN_AUDIENCE` to its exact URL and `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` to the push-auth service account email. Keep all private keys and service-account JSON in Supabase secrets, never in the APK, Actions variables, `.env` files, or source control.

Push delivery additionally requires:

1. Register a Firebase Android app whose package is `com.kayan.driver.demo` and download its `google-services.json`.
2. Base64-encode that file as the GitHub Actions secret `FIREBASE_ANDROID_CONFIG_BASE64`. The driver workflow applies the Google Services Gradle plugin only when this config is present; builds without it can receive foreground Realtime offers but cannot register an FCM token.
3. Create a Firebase service account allowed to send Firebase Cloud Messaging messages. Add its entire JSON as the Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`; never put it in the app, `.env` files, GitHub build logs, or source control.
4. Deploy the request function and configure its secret in the KAYAN Supabase project. Push is best effort; the in-app offer remains the source of truth.

The preview does not include live driver location sharing, passenger-driver chat/calls, payment processing, or emergency monitoring. ETA and route distance are calculated on the driver device from its current location to the destination; they are not shared with the passenger.

## Native Google Maps API keys

The Android driver APK displays the **native Google Maps Android SDK**, not a map inside an HTML/JavaScript map widget. Browser previews continue to use Google Maps JavaScript. The native map and browser/route requests need distinct keys because Google requires different application restrictions. Enable billing on the same Google Cloud project and enable:

- **Maps SDK for Android** — native Android map rendering.
- **Maps JavaScript API** and **Routes API** — browser preview and traffic-aware driving-route calculation.
- **Geocoding API** — Passenger reverse geocoding for the device’s default pickup and addresses selected by dropping a pin on the map.

After accepting a ride, the driver gets a traffic-aware route to the pickup point; after marking the pickup and starting the trip, the route changes to the passenger destination. The fastest returned route is drawn on the map. As fresh foreground GPS fixes arrive, the map shows the current route instruction and distance to the next step, and the ETA/fuel estimate updates for the remaining route. Once guidance appears, the trip details panel smoothly minimizes and can be expanded again.

This is visual, on-device guidance only: trip stages remain manual, and the app does not provide spoken directions, background navigation, or automatic off-route rerouting. A stale GPS fix is labelled and must not be treated as current guidance.

Create two restricted keys in the same Cloud project:

1. **Android SDK key:** API restriction = **Maps SDK for Android** only. Application restriction = Android apps; package name `com.kayan.driver.demo` and SHA-1 signing certificate fingerprint for the debug certificate used by the APK. Do not use a website-restricted key for this SDK.
2. **Web and Routes key:** API restrictions = **Maps JavaScript API** and **Routes API**; add **Geocoding API** when building the Passenger app so the device’s default pickup and saved map pins can be resolved to street addresses. Application restriction = Websites; allow `https://localhost/*` for the Capacitor Android WebView, and the exact browser-preview origin and port. For example, allow both `http://localhost:8081/*` and `http://127.0.0.1:8081/*` if the preview is accessed through both addresses. This key is embedded in the web bundle and is not a server-side secret; keep the restrictions in place.

### GitHub APK build secrets

Add these repository Actions secrets:

- `GOOGLE_MAPS_ANDROID_API_KEY` — Android SDK-restricted key.
- `GOOGLE_MAPS_API_KEY` — website-restricted Maps JavaScript/Routes key.
- `ANDROID_DEBUG_KEYSTORE_BASE64` — a stable debug signing keystore encoded as one-line base64. The Android key's package/SHA-1 restriction must match this keystore; ephemeral CI signing keys would cause the native map to be rejected.
- `FIREBASE_ANDROID_CONFIG_BASE64` — optional base64-encoded Firebase `google-services.json` for package `com.kayan.driver.demo`; required for Android FCM.

For live dispatch APKs, also set the repository Actions variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_ENABLE_LIVE_DISPATCH` (`true` to enable).

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
- First launch: confirm **Restore Demo Driver** opens and restores the fictional profile after reload; then use pre-registration to complete profile and vehicle questions and select four test documents.
- Relaunch: a profile with all four stored document records opens the demo dashboard. A saved profile missing any required document resumes at the document-upload steps with its profile data preserved.
- Test Light, Dark, and System, including Android system appearance changes.
- Go online; decline, generate another request, accept, and advance pickup/trip/drop-off.
- With live dispatch enabled and two configured test sessions, request a built-in passenger destination and confirm an approved online driver receives the offer, can accept/decline it, and the passenger sees status changes. A missing Firebase config or denied push permission should leave foreground offer delivery available and show a warning.
- Test chat, call connection/end, trip cancellation, earnings and history. Only completed trips contribute fares.
- Confirm the online toggle is locked during a trip and offline removes pending requests.
- Restart pre-registration and verify demo-mode preference and session UI state are cleared.
- Check narrow screens, keyboard interaction, Android back behavior, and no payment prompts. Opening the driver map automatically requests foreground location permission; confirm denying permission shows an actionable error and no fabricated position. Confirm eagle launcher icons on both apps.
- On Android, confirm the Google map is rendered by the native SDK, the device marker updates, and an accepted demo ride draws its computed route. In a browser preview, confirm the JavaScript map still loads and the route is visible.

Google Fonts are optional external presentation resources; app simulation does not need a backend. Without network access, system font fallbacks are used. Production trip dispatch, approval, trip-payment settlement, signing, and store publication are outside this demo workflow.
