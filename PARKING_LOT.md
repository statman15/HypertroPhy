# Parking Lot

## Inbox
- **Cloud sync.** Supabase or a homelab endpoint, so data survives a lost phone and works across devices. Skipped in v1: the Export/Import backup covers the same risk for two users.
- **Body weight log.** Track body weight over time, most useful for the fat-loss goal. Cut from v1 scope.
- **Social feed.** Share workouts the way Hevy does. Out of scope for a family app.
- **Animated GIF/video demos.** ExerciseDB API (paid, ~1,300 GIFs) or self-filmed clips, if the two-photo flip feels too cheap.
- **OmniRoute as the AI backend.** Already possible through Settings, but it needs an HTTPS address (Tailscale Serve) plus CORS, and Tailscale on both phones.
- **iPhone lock-screen rest timer.** Needs a native iOS wrapper (Capacitor iOS + TestFlight, $99/yr). v1 uses Wake Lock plus a beep instead.
- **AI coach that edits the plan.** "Apply" cards for coach suggestions, checked against the library. v1's coach only gives text advice.
