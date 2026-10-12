// Everything lives in localStorage as JSON, one key per collection. Weights are stored in the current unit;
// switching units converts the stored numbers once (setUnits), so nothing else ever converts.
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export const db = {
  settings: read('settings', { units: 'lb' }),
  routines: read('routines', []),
  workouts: read('workouts', []), // newest first
  active: read('active', null),   // the workout in progress, saved on every change so a closed app loses nothing
  profile: read('profile', null), // plan-builder answers: goal, days, minutes, level, equipment, avoid
  chat: read('chat', []),         // coach conversation, last 50 messages
};
export const save = (...keys) => { for (const k of keys) localStorage.setItem(k, JSON.stringify(db[k])); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Epley estimated one-rep max.
export const e1rm = (w, r) => (+w || 0) * (1 + (+r || 0) / 30);
export const volume = items => items.reduce((t, it) => t + it.sets.reduce((s, x) => s + (+x.w || 0) * (+x.r || 0), 0), 0);

// Sessions of one exercise, newest first: [{ date, sets }].
export const sessions = exId => db.workouts.flatMap(w => w.items.filter(it => it.exId === exId).map(it => ({ date: w.start, sets: it.sets })));
export const lastSets = exId => sessions(exId)[0]?.sets || [];

export function records(exId) {
  const all = sessions(exId).flatMap(s => s.sets);
  if (!all.length) return null;
  return {
    heaviest: Math.max(...all.map(s => +s.w || 0)),
    best: Math.max(...all.map(s => e1rm(s.w, s.r))),
    reps: Math.max(...all.map(s => +s.r || 0)),
  };
}

// lb rounds to 0.5 and kg to 0.1, so 135 lb → 61.2 kg → 135 lb survives a round trip.
export function setUnits(units) {
  const { units: from } = db.settings;
  if (units === from) return;
  const f = units === 'kg' ? 0.45359237 : 1 / 0.45359237, step = units === 'kg' ? 10 : 2;
  const conv = w => w === '' || w == null ? w : Math.round(+w * f * step) / step;
  for (const w of [...db.workouts, ...(db.active ? [db.active] : [])])
    for (const it of w.items) for (const s of it.sets) s.w = conv(s.w);
  db.settings.units = units;
  save('settings', 'workouts', 'active');
}
