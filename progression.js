// Double progression. Pure: history in, target out, no app state.
// history: sessions of one exercise, newest first, each an array of { w, r } sets.
// Returns { w, r, kind } with kind 'up' | 'hold' | 'deload' | 'reps', or null with no history.

export const DEFAULT_RANGE = { repMin: 8, repMax: 12 };
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
