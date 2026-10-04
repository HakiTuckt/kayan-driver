# KAYAN Android demo

## Status

Android packaging is configured with Capacitor. No APK has been compiled or device-tested in the editing workspace. The workflow must successfully complete before an APK exists. Native packaging dependencies are installed in CI, not required for the browser preview.

## Get the APK without terminal commands

1. Export/sync this project to a GitHub repository, including `.github/workflows/android-demo.yml` and `capacitor.config.json`.
2. In GitHub, open **Actions → Build KAYAN Android demo → Run workflow**.
3. After a successful run, download **KAYAN-Android-Demo-APK** from the run's Artifacts section.
4. Extract the archive and transfer `app-debug.apk` to your Android phone.
5. Open the APK. If prompted, allow installation from the trusted app you used to open it. Turn that permission off again afterwards.

Only install the artifact from your own trusted repository and successful workflow. Do not disable Play Protect. If Android reports an incompatibility or blocks installation, investigate the message rather than bypassing protections. Capacitor 7 targets Android 6.0/API 23 and later; actual compatibility must be verified on devices.

## What is included

The current responsive passenger demo is bundled locally: booking previews, themes, simulated driver stages, local chat/call screens and website demo forms. The application name is **KAYAN Demo**, with provisional application ID `com.kayan.passenger.demo`. No real GPS, VoIP, dispatch, payment processing, accounts or uploads are connected. Fonts may fall back to system fonts without internet access. Native document downloads, file picking, navigation/back handling, clipboard and layout still require device testing. No camera, microphone or location plugins have been added.

## Signing and production

This is a debug-signed test build, not a Play Store release or a hardened production app. Clean CI runs may use different debug keys; installing a later test build might require uninstalling the earlier one. Never put real customer information into the demo. Select a permanent package ID, private release signing, versioning, native permissions, approved backend and privacy controls before production. Never commit signing keys or passwords. Use Android/iOS native integrations and test them separately for background tracking and incoming calls.

## Next operational step

Choose the managed database/authentication provider and resolve permitted hosting/data residency before live accounts and driver-document storage. The demo APK does not implement those services.
