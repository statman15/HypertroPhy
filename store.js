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
  // About you: sex '' | 'male' | 'female', birthYear, heightCm, and weigh-ins [{ t, w, src? }] oldest first (w in the current unit).
  body: read('body', { sex: '', birthYear: '', heightCm: '', weights: [] }),
  plan: read('plan', null),  // the current month: { start, weeks: [[{ name, items }]], notes, deload, applied } (plan.js)
  plans: read('plans', []),  // earlier months, newest first, kept for the next month's prompt
};
export const save = (...keys) => { for (const k of keys) localStorage.setItem(k, JSON.stringify(db[k])); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Epley estimated one-rep max.
export const e1rm = (w, r) => (+w || 0) * (1 + (+r || 0) / 30);
// Warm-up sets (wu: true) never count toward volume, records, PRs or progression.
export const working = sets => sets.filter(s => !s.wu);
// Timed items (seconds, not reps) are left out: weight × seconds isn't lifting volume.
export const volume = items => items.reduce((t, it) => it.timed ? t : t + working(it.sets).reduce((s, x) => s + (+x.w || 0) * (+x.r || 0), 0), 0);

// Sessions of one exercise, newest first: [{ date, sets }], working sets only.
export const sessions = exId => db.workouts.flatMap(w => w.items.filter(it => it.exId === exId)
  .map(it => ({ date: w.start, sets: working(it.sets), ...(it.deload && { deload: true }) })).filter(s => s.sets.length));
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
  for (const x of db.body.weights) x.w = conv(x.w);
  delete db.settings.plates; // bar and plates differ per unit; the new unit starts from its defaults
  db.settings.units = units;
  save('settings', 'workouts', 'active', 'body');
}

// --- About you.
export const bodyweight = () => db.body.weights.at(-1)?.w || 0;
export const age = () => db.body.birthYear ? new Date().getFullYear() - db.body.birthYear : null;
export const toKg = w => db.settings.units === 'kg' ? w : w * 0.45359237;

// Estimated calories for a workout: MET 5 (moderate-to-vigorous weight training) × kg × hours, capped at 3 hours.
// With the watch's average heart rate (and sex, age, weight known) it's the Keytel 2005 equations instead.
// ponytail: one MET for every workout without heart rate; per-exercise METs if the estimate ever matters.
export const kcal = w => {
  if (!bodyweight()) return 0;
  const hours = Math.min(3, (w.end - w.start) / 3.6e6), kg = toKg(bodyweight()), hr = w.hr?.avg, a = age();
  if (hr > 0 && a && ['male', 'female'].includes(db.body.sex)) {
    const perMin = (db.body.sex === 'male' ? -55.0969 + 0.6309 * hr + 0.1988 * kg + 0.2017 * a : -20.4022 + 0.4472 * hr - 0.1263 * kg + 0.074 * a) / 4.184;
    return Math.max(0, Math.round(perMin * hours * 60));
  }
  return Math.round(5 * kg * hours);
};

// A line for the AI: "male, 34, 180 cm, 82 kg" (whatever is known).
export function aboutYou() {
  const b = db.body, parts = [b.sex, age() && `${age()} years old`, b.heightCm && `${b.heightCm} cm`, bodyweight() && `${Math.round(toKg(bodyweight()))} kg`].filter(Boolean);
  return parts.join(', ');
}

// --- Backup. AI keys never go in the file: they stay on each phone, and restoring keeps this phone's AI setup.
export function backup() {
  const settings = { ...db.settings };
  delete settings.ai;
  return { app: 'HypertroPhy', format: 1, exported: Date.now(), settings, routines: db.routines, workouts: db.workouts, profile: db.profile, chat: db.chat, body: db.body, plan: db.plan, plans: db.plans };
}

// A backup file is outside input, and its ids and numbers end up in HTML attributes, so check every field that gets rendered.
const id = v => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v);
const n = v => v === '' || Number.isFinite(+v);
const item = it => id(it?.exId) && Array.isArray(it.sets) && it.sets.every(s => n(s?.w) && n(s?.r));
// (body weigh-ins are checked field by field in restore)
const planOk = p => Number.isFinite(p?.start) && Array.isArray(p.weeks) && p.weeks.length <= 8
  && p.weeks.every(w => Array.isArray(w) && w.every(d => Array.isArray(d?.items) && d.items.every(routineItem)));
const routineItem = it => id(it?.exId) && [it.sets, it.repMin, it.repMax, it.rest].every(v => v == null || Number.isFinite(+v));

export function restore(data) {
  const ok = data?.app === 'HypertroPhy' && ['lb', 'kg'].includes(data.settings?.units)
    && Array.isArray(data.workouts) && data.workouts.every(w => id(w?.id) && Number.isFinite(w.start) && Number.isFinite(w.end) && Array.isArray(w.items) && w.items.every(item))
    && Array.isArray(data.routines) && data.routines.every(r => id(r?.id) && Array.isArray(r.items) && r.items.every(routineItem))
    && (data.plan == null || planOk(data.plan)) && (data.plans == null || Array.isArray(data.plans) && data.plans.every(planOk));
  if (!ok) throw new Error('That file isn\'t a HypertroPhy backup, or it\'s damaged.');
  const num = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['w', 'r', 'sets', 'repMin', 'repMax', 'rest'].includes(k) && v !== '' && v != null ? +v : v]));
  db.workouts = data.workouts.map(({ hr, ...w }) => ({ ...w, ...(Number.isFinite(hr?.avg) && Number.isFinite(hr?.max) && { hr: { avg: hr.avg, max: hr.max } }), name: String(w.name ?? 'Workout'), items: w.items.map(it => ({ ...num(it), sets: it.sets.map(num) })) }));
  db.routines = data.routines.map(r => ({ id: r.id, name: String(r.name ?? 'Routine'), ...(r.ai && { ai: true }), ...(r.aiOne && { aiOne: true }), ...(Number.isInteger(r.week) && { week: r.week }), items: r.items.map(num) }));
  const cleanPlan = p => ({ start: p.start, notes: String(p.notes ?? ''), deload: Number.isInteger(p.deload) ? p.deload : null, applied: -1,
    weeks: p.weeks.map(w => w.map(d => ({ name: String(d.name ?? 'Day'), items: d.items.map(num) }))) });
  db.plan = data.plan ? cleanPlan(data.plan) : null;
  db.plans = (data.plans || []).map(cleanPlan);
  const p = data.profile;
  db.profile = p && ['strength', 'muscle', 'tone', 'fatloss'].includes(p.goal) && Array.isArray(p.equipment) ? p : null;
  const b = data.body || {};
  db.body = {
    sex: ['male', 'female'].includes(b.sex) ? b.sex : '',
    birthYear: Number.isInteger(+b.birthYear) && +b.birthYear > 1900 ? +b.birthYear : '',
    heightCm: +b.heightCm > 0 && +b.heightCm < 300 ? +b.heightCm : '',
    weights: Array.isArray(b.weights) ? b.weights.filter(x => Number.isFinite(x?.t) && +x.w > 0).map(x => ({ t: x.t, w: +x.w, ...(x.src === 'hc' && { src: 'hc' }) })) : [],
  };
  db.chat = Array.isArray(data.chat) ? data.chat.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content })) : []; // no change cards: their undo data is outside input
  db.settings = { units: data.settings.units, ai: db.settings.ai, lastBackup: data.exported };
  db.active = null;
  save('settings', 'routines', 'workouts', 'profile', 'chat', 'active', 'body', 'plan', 'plans');
  return db.workouts.length;
}
