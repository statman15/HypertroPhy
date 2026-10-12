// Starting-weight guess for an exercise with no history: bodyweight × a typical working-weight ratio
// for 8-12 reps, scaled by sex and experience. A rough first number to adjust, not a prescription.
// ponytail: a coarse table by equipment and muscle; per-exercise strength standards if the guesses feel off.

const LOWER = ['quadriceps', 'hamstrings', 'glutes', 'lower back', 'adductors', 'abductors', 'calves'];
const BACK = ['lats', 'middle back', 'traps'];
const ARMS = ['biceps', 'triceps', 'forearms'];

// Ratio of bodyweight for a beginner man, by equipment then muscle (dumbbells and kettlebells are per hand).
function ratio(ex) {
  const m = ex.primaryMuscles?.[0] || '', iso = ex.mechanic === 'isolation';
  switch (ex.equipment) {
    case 'barbell': return LOWER.includes(m) ? 0.75 : m === 'chest' ? 0.5 : BACK.includes(m) ? 0.5 : m === 'shoulders' ? 0.35 : ARMS.includes(m) ? 0.25 : null;
    case 'e-z curl bar': return 0.25;
    case 'dumbbell': return iso || ARMS.includes(m) ? 0.08 : LOWER.includes(m) ? 0.2 : 0.15;
    case 'kettlebells': return 0.15;
    case 'machine': case 'cable': return iso ? 0.2 : LOWER.includes(m) ? 0.8 : 0.4;
    default: return null; // bodyweight, bands, balls, other: no weight to guess
  }
}

const LEVEL = { beginner: 1, intermediate: 1.35, expert: 1.7 };

export function startGuess(ex, { bodyweight, sex, level = 'beginner', round, bar = 0 }) {
  const r = ratio(ex);
  if (!r || !(bodyweight > 0)) return null;
  const lower = LOWER.includes(ex.primaryMuscles?.[0]);
  const s = sex === 'female' ? (lower ? 0.75 : 0.6) : sex === 'male' ? 1 : 0.85;
  const raw = bodyweight * r * s * (LEVEL[level] || 1);
  if (ex.equipment !== 'barbell') return Math.max(Math.floor(raw / round) * round, round);
  return Math.max(bar + Math.floor((raw - bar) / round) * round, bar); // bar + whole plate pairs
}
