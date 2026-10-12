// Double progression. Pure: history in, target out, no app state.
// history: sessions of one exercise, newest first, each an array of { w, r } sets.
// Returns { w, r, kind } with kind 'up' | 'hold' | 'deload' | 'reps', or null with no history.

export const DEFAULT_RANGE = { repMin: 8, repMax: 12 };

// The goal sets rep range and rest for AI plans, and the default range for exercises outside a routine.
export const GOALS = {
  strength: { label: 'Build strength', repMin: 3, repMax: 6, rest: 180 },
  muscle: { label: 'Gain muscle', repMin: 8, repMax: 12, rest: 90 },
  tone: { label: 'Get toned', repMin: 10, repMax: 15, rest: 60 },
  fatloss: { label: 'Lose fat', repMin: 12, repMax: 15, rest: 45 },
};
const LOWER = ['quadriceps', 'hamstrings', 'glutes'];

// Barbell lower-body lifts jump +10 lb / +5 kg; everything else +5 lb / +2.5 kg. round is the plate step for deloads.
export function stepFor(ex, units) {
  const big = ex?.equipment === 'barbell' && LOWER.includes(ex.primaryMuscles?.[0]);
  return units === 'kg' ? { step: big ? 5 : 2.5, round: 2.5 } : { step: big ? 10 : 5, round: 5 };
}

// Judge a session by its working sets: the ones at its heaviest weight, so warm-ups don't count.
function work(sets) {
  const top = Math.max(...sets.map(s => +s.w || 0));
  return { top, reps: sets.filter(s => (+s.w || 0) === top).map(s => +s.r || 0) };
}

export function nextTarget(history, { repMin, repMax, step, round }) {
  const sessions = history.filter(s => s.length);
  if (!sessions.length) return null;
  const last = work(sessions[0]);
  const fewest = Math.min(...last.reps);

  if (last.top === 0) return { w: 0, r: fewest + 1, kind: 'reps' }; // bodyweight: add reps, never weight
  if (fewest >= repMax) return { w: last.top + step, r: repMin, kind: 'up' };
  if (fewest >= repMin) return { w: last.top, r: Math.min(fewest + 1, repMax), kind: 'hold' };

  const before = sessions[1] && work(sessions[1]);
  if (before && before.top === last.top && Math.min(...before.reps) < repMin)
    return { w: Math.max(round, Math.round(last.top * 0.9 / round) * round), r: repMin, kind: 'deload' };
  return { w: last.top, r: repMin, kind: 'hold' };
}

// --- Plates and warm-ups (pure).
export const PLATE_DEFAULTS = { lb: { bar: 45, have: [45, 35, 25, 10, 5, 2.5] }, kg: { bar: 20, have: [25, 20, 15, 10, 5, 2.5, 1.25] } };

// Plates for one side of the bar, biggest first. `left` is what couldn't be made with the plates on hand.
export function plates(total, bar, have) {
  let side = Math.round((total - bar) / 2 * 1000) / 1000;
  if (side < 0) return { side: [], left: 0, under: true };
  const out = [];
  for (const p of [...have].sort((a, b) => b - a)) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 1000) / 1000; }
  return { side: out, left: side };
}

// Ramp-up sets before the working weight: empty bar (barbells), then 50% × 8, 70% × 5, 85% × 3, rounded down to the plate step.
// Skips any that would be at or under the previous one, so light working weights get fewer warm-ups.
export function warmups(work, { bar = 0, round }) {
  const down = w => bar + Math.floor((w - bar) / round) * round; // bar + whole plate pairs
  const sets = bar && work > bar * 1.5 ? [{ w: bar, r: 10 }] : [];
  for (const [pct, r] of [[0.5, 8], [0.7, 5], [0.85, 3]]) {
    const w = Math.max(down(work * pct), bar);
    if (w < work && w > (sets.at(-1)?.w ?? 0)) sets.push({ w, r });
  }
  return sets;
}
