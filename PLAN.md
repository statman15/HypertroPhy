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
4. **AI.** Settings for URL/key/model with a "Test" button. **Check first** that Gemini's OpenAI-compatible endpoint allows browser (CORS) calls; if it doesn't, fall back to Gemini's own REST format in `ai.js`. Plan builder: goal form → filter the library to the user's equipment → send the trimmed exercise list → JSON plan → drop any ID not in the library → save as routines. Coach: chat with the profile, plan and 4-week summary in the system prompt.
5. **Android.** `npx cap init` + `cap add android`; LocalNotifications for the rest timer; generate a keystore (back it up in the password manager, since every future APK needs it); `android.yml` builds the signed APK and publishes a Release. Export goes through the Filesystem + Share plugins, because the WebView can't share files. Check that `sw.js` registers inside the Capacitor WebView. If it doesn't, photos fall back to the WebView's HTTP cache (jsDelivr sends a 1-year max-age).
6. **Backup + polish.** Export/Import, the 14-day banner, empty states, icons.

## Open risks
- Gemini CORS (checked first in phase 4).
- An installed iPhone PWA keeps its storage, but deleting the home-screen icon wipes it, so the backup nag matters.
- jsDelivr outage → no photos for exercises that haven't been cached yet. Acceptable.
