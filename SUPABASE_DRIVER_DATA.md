# Supabase driver data foundation

The private driver-data migration creates the schema and row-level security used by the Driver UI. The app writes profile and vehicle rows directly through Supabase's client API under the driver's phone-verified Auth session.

## Included

- `driver_profiles`: a driver's contact profile and a server-controlled review status.
- `driver_vehicles`: vehicle details owned by a driver profile.
- `driver_documents`: private-storage object references, document type, expiry date, and server-controlled review status. Files themselves are not stored in Postgres.
- `driver-documents`: a private Storage bucket limited to JPEG, PNG, and PDF files up to 10 MiB each.
- Row-level security and grants limiting authenticated drivers to their own rows and their own storage folder.
- Phone OTP authentication through Supabase Auth; registration links and verifies the phone on the existing anonymous session to preserve its driver UUID, while returning sign-ins use passwordless SMS OTP.
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

The Driver demo stores profile and vehicle details and uploads four required documents to private Supabase Storage. The app first creates an anonymous Auth session, then links a verified phone to that same user so existing driver and document records keep their UUID. Returning drivers can sign in on a new device using passwordless SMS OTP. This is phone possession authentication, not true two-factor authentication. Documents start in `pending_review`; no staff review interface or staff access policy is configured, and the demo cannot approve applications. Access depends on continued access to the verified phone number. Do not upload genuine identity documents with this demo build. Before public use, add CAPTCHA/rate limits, a stronger recovery plan, a server-authorized staff review flow, retention/deletion controls, and confirm applicable Zambia privacy and data-residency requirements.

## Yoola SMS setup for phone OTP

The app uses Supabase Auth to create and verify OTPs. The `yoola-send-sms` Edge Function only delivers Supabase's signed OTP event through Yoola's normal SMS API; the Yoola API key is never included in the mobile app. Do not use Yoola's separate Verify API for this flow because it would move OTP verification outside Supabase Auth.

1. Enable **Phone** under **Authentication → Sign In / Providers** in the Supabase dashboard.
2. In the Supabase dashboard, create an access token under your account's **Access Tokens** page and copy the project reference from **Project Settings → General**. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add repository secrets named `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. These let GitHub deploy the function; never paste the token into source or chat.
3. In GitHub **Actions**, run **Deploy KAYAN Yoola SMS hook**. It deploys `supabase/functions/yoola-send-sms` with JWT verification disabled for the endpoint; the function verifies Supabase's signed webhook itself.
4. In Supabase **Edge Functions → Secrets**, add `YOOLA_API_KEY` from your Yoola dashboard. Optionally add `YOOLA_SENDER_ID` after approving a sender ID with Yoola. Never add these provider credentials to GitHub, `.env.driver.local`, or the APK.
5. In Supabase **Authentication → Hooks**, enable the **Send SMS** hook and set its endpoint to `https://<project-ref>.supabase.co/functions/v1/yoola-send-sms`. Generate the hook secret, then add that same value as the `SEND_SMS_HOOK_SECRET` Edge Function secret. Do not share any of these secrets in chat.
6. Set conservative SMS/OTP rate limits before testing. CAPTCHA is recommended before public launch, but enable it only after a CAPTCHA token is wired into the app's OTP requests. Test to numbers you control on MTN, Airtel, and Zamtel; verify sender-ID approval and current Yoola pricing. Each send or resend may cost one SMS.

The app normalizes local Zambian numbers to `+260` E.164 format. The Edge Function sends the number to Yoola without the leading `+`, as expected by its Zambia API. OTP codes and provider credentials are not written to logs. Linking an existing anonymous account must be completed before clearing app data; otherwise its current session may be unrecoverable.

App and Google Maps credentials are app-owner build configuration, not driver input. For local development, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.driver.local` file. Set both `GOOGLE_MAPS_ANDROID_API_KEY` and `VITE_GOOGLE_MAPS_ANDROID_API_KEY` to the same Android-restricted Maps key: the first writes Android manifest metadata, and the second is passed to the native Maps plugin. See [`.env.driver.example`](./.env.driver.example). The Supabase values are public client configuration; RLS enforces access. The Maps key is packaged in the APK and must be restricted in Google Cloud to the Android package name and signing-certificate SHA-1. Never put a Supabase service-role/secret key in the app.
