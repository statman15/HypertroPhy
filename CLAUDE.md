# HypertroPhy

Lifting log for Chris (Android app) and his wife (iPhone, web app). Read PLAN.md for decisions and status, PARKING_LOT.md for deferred ideas.

## Every change ships to both apps

- The web app (GitHub Pages, https://statman15.github.io/HypertroPhy/) and the Android app (Capacitor APK on GitHub Releases) run the **same web files** at the repo root. A push to `main` deploys Pages and builds a signed APK release.
- Never build a feature only into `android/`. Native-only behaviour (Capacitor plugins, plain-http LAN access, the update banner) needs a web equivalent, or tell Chris what the iPhone can't do.
- After pushing, confirm both: the Pages build finished and serves the new code, and the Android APK workflow published a release.

## Working here

- No build step for the web app: plain ES modules. `npm test` runs the checks; `npm run sync` copies the web files into the Android project.
- Local preview: `npx http-server -p 5173 -c-1` from the repo root.
- Android Studio's bundled Java 25 can't run Gradle 8.14; the build asks for Java 21 (see PLAN.md, "Android build notes").
