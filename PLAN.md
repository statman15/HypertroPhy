# HypertroPhy — Plan

A Hevy-style lifting log for Chris (Android) and his wife (iPhone). It suggests weight targets from your history, builds AI plans for your goal, and shows a photo demo for every exercise.

Repo: `statman15/HypertroPhy` (public). Local folder: `C:\Users\ressl\Claude Code\Weightlifting_App`.

## Decisions (settled 2026-10-11)

| Area | Decision |
|---|---|
| Audience | Family first. No accounts, no app stores. |
| Stack | One plain HTML/JS PWA with native ES modules. **No build step, no framework.** Bookshelf's iPhone look (system font, light/dark follows the phone). |
| iPhone | Installed from GitHub Pages with Add to Home Screen. |
| Android | **Capacitor** wraps the same web files, opens in Android Studio. GitHub Actions builds a signed APK on each push and posts it to Releases. Web files are bundled inside, so it works fully offline. npm is used only for the Capacitor tooling. |
| Data | Kept on each phone only, as JSON in `localStorage`. Export/Import a JSON file, with a nag banner after 14 days without a backup. |
| Exercises | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense, ~800 exercises, tagged by equipment and primary/secondary muscle). The JSON ships with the app. Photos load from jsDelivr (pinned commit) and are cached on demand with the Cache API. The demo flips between the start and end photos. |
| Progression | Rule-based double progression (below). No AI. |
| AI | One OpenAI-compatible connection (URL + key + model) set in Settings and stored only on that phone. Defaults to Gemini's OpenAI endpoint. It powers (1) a **plan builder** that may only use library exercise IDs and (2) a **chat coach** that sees your profile, current plan and the last 4 weeks of workouts and answers in plain text. |
| AI at home | OmniRoute settings take an optional **home address**, tried first (2.5 s probe, remembered for a minute), then the Tailscale address. If neither answers and a Gemini key is saved, Gemini answers and the reply is labelled. The website can't use the http home address; the Android app can. |
| Exercise swap | No AI: the same primary muscle, filtered to the equipment you have. |
| Rest timer | Android: Capacitor LocalNotifications, so it buzzes even when the phone is locked. iPhone: Wake Lock keeps the screen on, plus a beep or flash at 0. |
| v1 scope | Library browse/filter + demos; logging (sets, reps, weight, rest timer); history + PRs; routines; supersets; progression targets; progress charts (hand-drawn SVG); lb/kg setting; AI plans + coach; backup. |
| Cut | Cloud sync, social feed, body weight log. See PARKING_LOT.md. |

## Goal mapping (sets the rep range, rest time and plan style)

| Goal | Reps | Rest | Notes |
|---|---|---|---|
| Strength | 3–6 | 2–3 min | Compound lifts first |
| Gain muscle | 8–12 | 90 s | |
| Get toned | 10–15 | 60 s | |
| Lose fat | 12–15 | 45 s | Supersets by default |

The plan builder also asks for: days per week (2–5), minutes per session, equipment (full gym / home dumbbells / bodyweight), level, and moves to avoid.

## Double progression (`progression.js`, a pure function)

For each exercise, look at the last session's working sets against the rep range `repMin–repMax`:
- **Every set ≥ repMax** → add weight: **+10 lb / +5 kg** for barbell lifts whose primary muscle is quads, hamstrings or glutes; otherwise **+5 lb / +2.5 kg**.
- **Every set ≥ repMin** → keep the weight; the target is +1 rep on the weakest set.
- **Below repMin two sessions in a row** → deload 10%, rounded to the plate step.
- No history → no target. The first session sets the baseline.

While logging, each set shows last time's numbers and today's target, e.g. "Last: 135×10 · Target: 140×8". `progression.test.js` holds the assert checks; run them with `node progression.test.js`.

## Data (localStorage keys)

```
settings  { units:'lb'|'kg', ai:{url,key,model}, lastBackup }
profile   { goal, days, minutes, equipment:[], level, avoid }
routines  [{ id, name, items:[{ exId, sets, repMin, repMax, rest, ss? }] }]
workouts  [{ id, name, routineId?, start, end, items:[{ exId, rest, ss?, repMin?, repMax?, sets:[{ w, r, pr? }] }] }]   newest first
active    the workout in progress (same shape, sets carry done; restEnd timestamp), saved on every change
```
`ss: true` links an exercise to the next one as a superset: checking its set starts no rest timer, and the last exercise in the chain rests. Weights are stored in the current unit; switching units converts everything once (lb rounds to 0.5, kg to 0.1).
<!-- ponytail: localStorage caps at ~5MB, which is years of sets. Move workouts to IndexedDB if export size gets near 3MB. -->

## Files

```
index.html            shell, styles (borrowed from Bookshelf), tab bar, rest bar
app.js                tabs, Exercises tab + exercise picker, Settings
workout.js            Workout tab: routines, live logger, rest timer, routine editor
history.js            History tab, PR display, per-exercise records
ui.js                 $, esc, formatting, the shared bottom sheet
store.js              localStorage read/write, records, unit switch, export/import
exercises.js          load data/exercises.json, filters, swap, photo cache
progression.js        nextTarget() (+ progression.test.js)
ai.js                 chat() over the OpenAI-compatible endpoint, plan builder prompt + validation
sw.js                 offline app shell for the Pages install
manifest.webmanifest, icons
data/exercises.json   copied from free-exercise-db dist
android/              Capacitor project (generated)
.github/workflows/    pages.yml, android.yml
```

## Build phases

1. ✅ **Library.** Copy `exercises.json` (check its path in the repo and pin a commit). Browse and filter by equipment and muscle, search, detail page with the photo flip and instructions. Create the repo and turn on Pages. *Done when:* the Library works on both phones from Pages.
2. ✅ **Logging.** Start an empty workout or one from a routine; add/remove sets; rest timer + Wake Lock; finish and save; History list + detail; PRs (heaviest weight, best estimated 1RM = w×(1+r/30)); routines CRUD; supersets.
3. ✅ **Progression + charts.** `nextTarget()` plus its test; targets shown inline while logging; a per-exercise SVG chart of estimated 1RM over time.
4. ✅ **AI.** Settings for URL/key/model with a "Test" button. **Check first** that Gemini's OpenAI-compatible endpoint allows browser (CORS) calls; if it doesn't, fall back to Gemini's own REST format in `ai.js`. Plan builder: goal form → filter the library to the user's equipment → send the trimmed exercise list → JSON plan → drop any ID not in the library → save as routines. Coach: chat with the profile, plan and 4-week summary in the system prompt.
5. ✅ **Android.** `npx cap init` + `cap add android`; let the WebView call OmniRoute's plain-http **home address** (`http://192.168.1.37:20128/v1`): Android cleartext allowed for that host plus WebView mixed content, because Tailscale is off at home (Chris's automation turns it on only when he leaves); LocalNotifications for the rest timer; generate a keystore (back it up in the password manager, since every future APK needs it); `android.yml` builds the signed APK and publishes a Release. Export goes through the Filesystem + Share plugins, because the WebView can't share files. Check that `sw.js` registers inside the Capacitor WebView. If it doesn't, photos fall back to the WebView's HTTP cache (jsDelivr sends a 1-year max-age).
6. ✅ **Backup + polish.** Export/Import (leave the AI keys out of the export file), the 14-day banner, empty states, icons.

## Phase 7 (2026-10-12): about you, body weight, plates, warm-ups ✅
- **About You** (Settings): sex, birth year, height (stored in cm). Feeds the AI plan prompt and coach context (`aboutYou()` in store.js), **starting-weight guesses** for never-logged exercises (`guess.js`: bodyweight × ratio by equipment/muscle × sex × level, rounded to loadable plates), and a **calorie estimate** per workout (MET 5 × kg × hours, capped at 3 h).
- **Body weight** (History tab card + chart): manual weigh-ins on both apps, one per day; the Android app also **reads weight from Health Connect** (read-only, `@capgo/capacitor-health`), quietly on open after the first allow. The manifest strips every other health permission. iPhone: manual only (a web app can't read Apple Health). `privacypolicy.html` is the page Health Connect links to.
- **Warm-ups**: exercise ⋯ → Add Warm-up Sets: empty bar ×10, 50% ×8, 70% ×5, 85% ×3 of the working weight, marked W. Warm-ups never count toward volume, records, PRs, progression or "Previous", and start no rest timer.
- **Plates**: barbell exercises get a Plates button listing plates per side for each set. Bar weight and owned plates are set in Settings. Barbell guesses, warm-ups and "go up" targets round to bar + plate pairs you can actually load.

## Timed holds and AI rest (2026-10-12) ✅
- **Timed exercises** (planks, side bridges, carries, cardio, stretches): `isTimed()` in exercises.js (force "static", cardio, carries), and the ⋯ menu switches any exercise between Track by Time and Track by Reps. Sets are seconds: a ▶ hold timer counts down the target, buzzes (Android notification id 2), logs the set and starts the rest; Done stops early and logs the time held. The default range is 20–60 s, the first-time default is 20 s, progression is +5 s on the shortest hold (`nextHold`), and the PR/record is the longest hold. Timed items are left out of volume.
- **AI picks rest per exercise** (`rest_seconds`, snapped to the timer choices; heavy compounds longer, isolation and supersets shorter) and **seconds for holds**; the goal's rest is only the fallback.

## Month plans (2026-10-12) ✅
- The AI builds **4 weeks** in one request (`planPrompt`/`parsePlan` in ai.js): the same days and muscle slots every week, exercises swapped within a slot for others that hit the same muscle, the first big lift kept at least 2 weeks, and week 4 a deload (about half the sets).
- `plan.js`: `db.plan` starts on the Monday of the week it's built. Each Monday `applyWeek()` swaps the AI routines to that week (your own routines stay). In the deload week targets are ~10% lighter (loadable), and deload sessions never feed progression.
- When the month ends, a card offers **Build Next Month**. Finished months go to `db.plans` (last 12), and the prompt gets the last 4 months' exercises per day plus each lift's 8-week trend (up/flat/down), so the AI can keep what progressed, rotate out stalls and bring back older exercises.
- Plans are in backups and validated on restore (`plan.test.js`).

## Android build notes
- Web files are copied into `www/` by `npm run sync` (copy-web.js + cap sync); never edit `www/` or `android/app/src/main/assets` by hand.
- Keystore: `~/hypertrophy-keystore` (release.p12, password.txt, release.p12.b64), also in repo secrets KEYSTORE_B64 / KEYSTORE_PASSWORD. **Back the folder up to the password manager**: every future APK must be signed with it or updates won't install.
- Android Studio bundles Java 25, which Gradle 8.14 can't run on. `android/gradle/gradle-daemon-jvm.properties` asks for Java 21, found on this PC through `org.gradle.java.installations.paths` in `~/.gradle/gradle.properties` (Microsoft JDK 21).
- Rest notification checked on an Android 16 emulator: posted on the high-importance `rest` channel with the screen locked, ~10 s after the timer ended (the alarm itself fired on time). The APK reaches OmniRoute's http LAN address (mixed content + cleartext allowed).

## Updates and backups
- **Android updates:** on open (at most every 6 h) the app reads `version.json` (written by copy-web.js from CI's VERSION_NAME) and GitHub's latest release; if newer, a banner offers Update (opens the APK in Chrome) or ✕ (skip that version). No Obtainium needed.
- **Backups:** Settings → Save Backup (share sheet on phones, download on desktop; the Android app uses the Filesystem + Share plugins). The file never holds AI keys; Restore keeps this phone's AI setup. Every rendered field from a backup file is checked first (`store.test.js`). Workout tab nags after 14 days without a backup.

## Open risks
- ~~Gemini CORS~~: checked, both Gemini and OmniRoute allow browser calls from the Pages origin.
- OmniRoute is plain http on the LAN, which an https page cannot call. It needs Tailscale Serve on `pve` (`tailscale serve --bg --https=20128 http://192.168.1.37:20128`), which needs HTTPS certificates turned on in the Tailscale admin console. Only phones on Tailscale can use it; Gemini works anywhere.
- The full-gym plan prompt is ~9k tokens (534 exercises). Fine for Gemini Flash; a small-context model may refuse it.
- An installed iPhone PWA keeps its storage, but deleting the home-screen icon wipes it, so the backup nag matters.
- jsDelivr outage → no photos for exercises that haven't been cached yet. Acceptable.
