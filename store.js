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

// --- Backup. AI keys never go in the file: they stay on each phone, and restoring keeps this phone's AI setup.
export function backup() {
  const settings = { ...db.settings };
  delete settings.ai;
  return { app: 'HypertroPhy', format: 1, exported: Date.now(), settings, routines: db.routines, workouts: db.workouts, profile: db.profile, chat: db.chat };
}

// A backup file is outside input, and its ids and numbers end up in HTML attributes, so check every field that gets rendered.
const id = v => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v);
const n = v => v === '' || Number.isFinite(+v);
const item = it => id(it?.exId) && Array.isArray(it.sets) && it.sets.every(s => n(s?.w) && n(s?.r));
const routineItem = it => id(it?.exId) && [it.sets, it.repMin, it.repMax, it.rest].every(v => v == null || Number.isFinite(+v));

export function restore(data) {
  const ok = data?.app === 'HypertroPhy' && ['lb', 'kg'].includes(data.settings?.units)
    && Array.isArray(data.workouts) && data.workouts.every(w => id(w?.id) && Number.isFinite(w.start) && Number.isFinite(w.end) && Array.isArray(w.items) && w.items.every(item))
    && Array.isArray(data.routines) && data.routines.every(r => id(r?.id) && Array.isArray(r.items) && r.items.every(routineItem));
  if (!ok) throw new Error('That file isn\'t a HypertroPhy backup, or it\'s damaged.');
  const num = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['w', 'r', 'sets', 'repMin', 'repMax', 'rest'].includes(k) && v !== '' && v != null ? +v : v]));
  db.workouts = data.workouts.map(w => ({ ...w, name: String(w.name ?? 'Workout'), items: w.items.map(it => ({ ...num(it), sets: it.sets.map(num) })) }));
  db.routines = data.routines.map(r => ({ ...r, name: String(r.name ?? 'Routine'), items: r.items.map(num) }));
  const p = data.profile;
  db.profile = p && ['strength', 'muscle', 'tone', 'fatloss'].includes(p.goal) && Array.isArray(p.equipment) ? p : null;
  db.chat = Array.isArray(data.chat) ? data.chat.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string') : [];
  db.settings = { units: data.settings.units, ai: db.settings.ai, lastBackup: data.exported };
  db.active = null;
  save('settings', 'routines', 'workouts', 'profile', 'chat', 'active');
  return db.workouts.length;
}
