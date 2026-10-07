# Two independent KAYAN APK projects

Open `/projects` in the app, or select **Download APK projects** in passenger navigation. Download:

- `/downloads/kayan-passenger-github-project.zip`
- `/downloads/kayan-driver-github-project.zip`

These source ZIPs are generated from current source at dev-server startup and before production builds by `src/project-export/generate-projects.mjs`. Build-time generation verifies each standalone web build before creating archives. `/downloads/projects.json` includes generation time, file counts, sizes, SHA-256 hashes and standalone build verification status. Preview-start exports do not run standalone build verification; production exports do. Generated files are ignored in Git and regenerated on deployment builds.

Each ZIP contains its own root folder, source, public assets, build configs, lockfile, Capacitor config, GPS checklist, README and `.github/workflows/build-apk.yml`. Exported App.tsx and Vite config are variant-specific: passenger opens passenger at `/` and website at `/website`; driver opens driver at `/` only. No cross-app navigation or dependency on this combined preview. Common source modules may be included for maintenance but are not routed into the other app. Exported passenger imagery uses the supplied eagle where this repository references an unavailable driver image. The unavailable standalone HTML demo download is omitted from exports.

Create separate GitHub repositories, extract each ZIP, and upload the **contents** of its root project folder to the repository root. Include hidden `.github` files. Do not upload just the ZIP or place package.json inside a nested folder. Commit on main to trigger the APK build or select the manual action. On a successful run, download the corresponding APK artifact. The repositories retain `com.kayan.passenger.demo` and `com.kayan.driver.demo` so APKs can coexist.

Web/location dependencies use the included pnpm lockfile with frozen installation. Android CLI/framework tools resolve within major 7 in a separate temporary tools folder to avoid modifying the web lockfile. Node 22, Java 21 and Android SDK are installed in CI. Foreground location permissions and eagle launcher icons are applied after Capacitor sync. Artifacts expire after 14 days. Debug signatures may change between clean runners; reinstalling can require uninstalling the previous demo and clears its local preferences.

These are **source projects, not APK files**. Actual APK compilation requires GitHub Actions to complete. Physical GPS accuracy, native permissions, lifecycle and launcher icons remain device-test requirements. Driver applications can upload required documents to private Supabase storage, but no staff review or approval is included. Passenger live dispatch and payments are not added. Driver Google Play subscriptions are implemented in the Driver project; live billing requires the Play Console and Supabase configuration described in [ANDROID_DRIVER_DEMO.md](ANDROID_DRIVER_DEMO.md). Never put production signing secrets or genuine identity documents into these demos.
