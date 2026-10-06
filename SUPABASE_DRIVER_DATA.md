# Supabase driver data foundation

The private driver-data migration creates the schema and row-level security used by the Driver UI. The app writes profile and vehicle rows directly through Supabase's client API under the driver's anonymous Auth session or existing signed-in session.

## Included

- `driver_profiles`: a driver's contact profile and a server-controlled review status.
- `driver_vehicles`: vehicle details owned by a driver profile.
- `driver_documents`: private-storage object references, document type, expiry date, and server-controlled review status. Files themselves are not stored in Postgres.
- `driver-documents`: a private Storage bucket limited to JPEG, PNG, and PDF files up to 10 MiB each.
- Row-level security and grants limiting authenticated drivers to their own rows and their own storage folder.
- Anonymous Supabase Auth sessions for first-time application submissions. Phone verification is disabled during registration; WhatsApp OTP remains available only for returning accounts that already have a verified phone.
- Required application uploads: driving licence, national registration card, vehicle registration, and roadworthiness certificate. Each file is stored privately; only document metadata and the private object path are stored in Postgres. Trip simulations are not stored.

New driver profiles and document records start in `pending_review`. The client cannot set or edit the account or document review status. No public access or staff-review policy is added. Staff access should be introduced later through a server-verified role system; never put a Supabase service-role key in the browser or mobile app.

The registration flow accepts PDF, JPG, or PNG files up to 10 MiB each. The document path uses this form so the storage policies can isolate each driver's files:

```text
<authenticated-user-uuid>/<document-uuid>/<filename>
```

## Apply to your Supabase project

1. Confirm this is the KAYAN-owned project and enable multi-factor authentication for project owners.
2. In the Supabase dashboard, open **SQL Editor → New query**.
3. For a new database only, copy and run [`supabase/migrations/20261005171500_driver_private_data.sql`](./supabase/migrations/20261005171500_driver_private_data.sql). If already applied successfully, do not run it again.
4. Under **Authentication → Sign In / Providers**, enable **Anonymous sign-ins**.
5. Check **Table Editor** for the three `driver_*` tables and **Storage** for a private `driver-documents` bucket.
6. Keep a copy of the migration with the project source so future schema changes are tracked and repeatable.

Before using real files, inspect the project's existing Storage policies. Supabase combines permissive policies with `OR`, so remove any existing policy that grants broader access to this bucket or to all storage objects; this migration does not delete policies it does not own.

The Driver demo stores profile and vehicle details and uploads four required documents to private Supabase Storage. On submission, the app creates an anonymous Auth session if needed and saves the application and documents under that session's user ID. The phone number is contact information only and is not verified during registration. The thank-you screen tells applicants that KAYAN will contact them using that number; the in-app demo does not review or approve applications. Anonymous applications are tied to the current app session and cannot be recovered if app data is cleared or the app is reinstalled. Do not sign out of an anonymous application session or upload genuine identity documents with this demo build. Returning accounts that already have a verified phone can still use passwordless WhatsApp OTP sign-in; users must consent to receive that message and have WhatsApp at the verified number. There is no SMS delivery or fallback. This is phone-possession authentication, not true two-factor authentication. Before public use, add a stronger recovery plan, a server-authorized staff review flow, retention/deletion controls, and confirm applicable Zambia privacy and data-residency requirements.

## Meta WhatsApp Cloud API setup for phone OTP

Supabase Auth generates and verifies OTPs for returning accounts that already have a verified phone. New driver registration does not send an OTP. The `whatsapp-send-otp` Edge Function verifies Supabase's signed phone-auth hook and sends sign-in OTPs with Meta's [WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started.md/). It uses a dedicated KAYAN sender number and an approved authentication template named `kayan_driver_otp` in `en_US`, with a copy-code OTP button. The sign-in screen collects recipient opt-in before requesting a code. No SMS service or fallback is configured.

Supabase calls this integration a **Send SMS** Auth Hook and its phone OTP API uses an internal `sms` event field. Those are Supabase's required phone-auth interfaces; this setup sends messages only through WhatsApp.

1. Enable **Phone** under Supabase **Authentication → Sign In / Providers**. Do not configure an SMS provider.
2. In Meta for Developers, create a business app with the WhatsApp product, connect a **separate KAYAN sender number**, and complete Meta's setup for that number. Meta may require a separate verification call or message to activate the sender number; that does not change the driver's WhatsApp-only OTP delivery.
3. Create and get approval for an **Authentication** message template named `kayan_driver_otp`, language `English (US)`, with a **Copy code** OTP button. See Meta's [authentication template guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates).
4. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. These allow GitHub to deploy the Edge Function; never paste the access token into source or chat.
5. In GitHub **Actions**, run **Deploy KAYAN WhatsApp OTP hook**. It deploys `supabase/functions/whatsapp-send-otp` with JWT verification disabled for the endpoint; the function verifies Supabase's signed hook itself.
6. In Supabase **Edge Functions → Secrets**, add `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_GRAPH_API_VERSION` from the Meta Cloud API setup. Use a long-lived System User access token with `whatsapp_business_messaging` permission for production; a temporary dashboard token is only suitable for initial testing. Never put the access token in GitHub, `.env.driver.local`, or the APK.
7. In Supabase **Authentication → Hooks**, configure the **Send SMS** hook as an HTTP endpoint: `https://<project-ref>.supabase.co/functions/v1/whatsapp-send-otp`. Copy its generated signing secret to the Edge Function secret `PHONE_AUTH_HOOK_SECRET`. Do not share any of these secrets in chat.
8. Set conservative phone OTP rate limits before testing. CAPTCHA is recommended before public launch, but enable it only after a CAPTCHA token is wired into the app's OTP requests. Test with a number you control that has WhatsApp and confirm the approved template and Meta messaging setup before wider use.

After the Meta hook is deployed and verified, remove any old SMS-provider credentials and the previous SMS relay function from Supabase if present. Remove the old `SEND_SMS_HOOK_SECRET` Edge Function secret after the hook uses `PHONE_AUTH_HOOK_SECRET`.

The app normalizes local Zambian numbers to `+260` E.164 format. The Edge Function sends the recipient to Meta without the leading `+` and supplies the OTP in the approved template's body and button parameters. OTP codes and access tokens are not written to logs. Anonymous application sessions cannot currently be recovered after app data is cleared or the app is reinstalled.

App and Google Maps credentials are app-owner build configuration, not driver input. For local development, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.driver.local` file. Set both `GOOGLE_MAPS_ANDROID_API_KEY` and `VITE_GOOGLE_MAPS_ANDROID_API_KEY` to the same Android-restricted Maps key: the first writes Android manifest metadata, and the second is passed to the native Maps plugin. See [`.env.driver.example`](./.env.driver.example). The Supabase values are public client configuration; RLS enforces access. The Maps key is packaged in the APK and must be restricted in Google Cloud to the Android package name and signing-certificate SHA-1. Never put a Supabase service-role/secret key in the app.

## Optional live ride dispatch and push alerts

Live dispatch is disabled by default. To enable the passenger-to-driver offer flow:

1. Apply [`supabase/migrations/20261005214000_live_ride_dispatch.sql`](./supabase/migrations/20261005214000_live_ride_dispatch.sql) once to the KAYAN project. It adds driver fuel/engine fields, online availability, device tokens, ride requests, driver offers, protected accept/decline/cancel/finish RPCs, row-level security, and the required Realtime publication entries. Do not re-run an already-applied migration.
2. Keep **Authentication → Sign In / Providers → Anonymous sign-ins** enabled. The passenger request function requires an authenticated Supabase session; the app creates an anonymous session when one does not exist.
3. Deploy `supabase/functions/create-ride-request` with JWT verification enabled (as configured in `supabase/config.toml`). The function validates the fixed Lusaka destination catalog, records the request, and creates offers for eligible online drivers. Passenger fares and destinations come from the app's preview catalog; no payment is taken.
4. For local builds, set `VITE_ENABLE_LIVE_DISPATCH=true`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.driver.local`. The flag is embedded at build time; rebuild both passenger and driver apps after changing it. For APK builds, use the GitHub repository Actions variables documented in [ANDROID_DRIVER_DEMO.md](./ANDROID_DRIVER_DEMO.md).
5. New driver applications remain `pending_review`, and cannot go online until an authorized staff process changes the status to `active`. The app intentionally has no self-approval path. Test with an approved driver profile and a separate passenger session.

Foreground offers and passenger status updates use Supabase Realtime. Driver availability expires for dispatch purposes if its heartbeat is older than 90 seconds; the app refreshes it while online. Accepted rides take the driver offline until that ride is completed or cancelled.

Android background notifications are optional and require Firebase setup. Register a Firebase Android app with package name `com.kayan.driver.demo`; provide its `google-services.json` to the GitHub driver workflow as the `FIREBASE_ANDROID_CONFIG_BASE64` Actions secret. In Supabase **Edge Functions → Secrets**, set `FCM_SERVICE_ACCOUNT_JSON` to the Firebase service-account JSON. This service account must have Firebase Cloud Messaging send permission. The app contains only Firebase client configuration; all message-sending credentials remain server-side. Without this setup, foreground offers can still arrive, but background push cannot. Push is best effort and is not a substitute for the Realtime/database offer state.

Live ride dispatch remains a preview, not production transport service: driver approval has no in-app review interface, fare quotes are illustrative, route stages are manually advanced, and passenger live location, messaging, payment, payout, and emergency response are not connected. Route ETA uses the driver device's current fix; fuel use is a broad heuristic from the driver's entered vehicle details, not a manufacturer-rated consumption value.
