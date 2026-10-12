# HypertroPhy

Lifting log for Chris (Android app) and his wife (iPhone, web app). Read PLAN.md for decisions and status, PARKING_LOT.md for deferred ideas.

## Every change ships to both apps

- The web app (GitHub Pages, https://statman15.github.io/HypertroPhy/) and the Android app (Capacitor APK on GitHub Releases) run the **same web files** at the repo root. A push to `main` deploys Pages and builds a signed APK release.
- Never build a feature only into `android/`. Native-only behaviour (Capacitor plugins, plain-http LAN access, the update banner) needs a web equivalent, or tell Chris what the iPhone can't do.
- After pushing, confirm both: the Pages build finished and serves the new code, and the Android APK workflow published a release.

## Delegate to cheaper models

Chris asked (2026-10-12) that work be handed to sub-agents on Haiku 5.5 and Sonnet 5.5 where it makes sense, instead of doing everything on Opus 5.5. Use the Agent tool's `model` parameter:
- **haiku**: mechanical work. File and code searches, running `npm test`, checking CI runs, releases and Pages deploys, simple well-specified edits, screenshots and read-only checks.
- **sonnet**: well-scoped building. Implementing a feature from a clear spec, writing or updating tests, code and security reviews, browser or emulator test passes.
- **Opus (the main session)**: planning, design decisions and question cards, specs for the agents, integrating and checking their work, and talking with Chris.
Give each agent a self-contained prompt (paths, the spec, what "done" means) and check its result before shipping.

## Working here

- No build step for the web app: plain ES modules. `npm test` runs the checks; `npm run sync` copies the web files into the Android project.
- Local preview: `npx http-server -p 5173 -c-1` from the repo root.
- Android Studio's bundled Java 25 can't run Gradle 8.14; the build asks for Java 21 (see PLAN.md, "Android build notes").
