# Parking Lot

## Inbox
- **Cloud sync.** Supabase or a homelab endpoint, so data survives a lost phone and works across devices. Skipped in v1: the Export/Import backup covers the same risk for two users.
- **Social feed.** Share workouts the way Hevy does. Out of scope for a family app.
- **Animated GIF/video demos.** ExerciseDB API (paid, ~1,300 GIFs) or self-filmed clips, if the two-photo flip feels too cheap.
- **iPhone lock-screen rest timer.** Needs a native iOS wrapper (Capacitor iOS + TestFlight, $99/yr). v1 uses Wake Lock plus a beep instead.
- **AI coach that edits the plan.** "Apply" cards for coach suggestions, checked against the library. v1's coach only gives text advice.
- **Apple Watch app (wife).** Watch apps must come bundled in a native iPhone app, and her HypertroPhy is the website, which can't talk to a watch. Path: add Capacitor iOS to the project, build on a Mac or cloud Mac (e.g. a GitHub macOS runner), $99/yr Apple Developer account, TestFlight. Then a watchOS SwiftUI app using WatchConnectivity, with the phone as the brain and the same state/action/heart-rate messages as PLAN.md Phase 9. Suggested for its own chat.
- **Garmin watch app (brother, Android phone).** A Connect IQ app in Monkey C (Garmin SDK) plus Garmin's Connect IQ Mobile SDK added to the Android app as a second bridge next to WearBridge, reusing the Phase 9 state/action/heart-rate JSON. The brother installs the HypertroPhy APK; the watch app is sideloaded or published to the Connect IQ store. Suggested for its own chat.
