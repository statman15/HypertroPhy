// Coach edits: the coach's reply can end with a ```changes block of small edits to your routines.
// The model's output is untrusted: parseChanges keeps only known ops on real routines and library exercises,
// with clamped numbers. applyChange/undoChange edit db.routines (and the rest of the month plan) in place.
import { candidates, snapRest } from './ai.js';
import { GOALS, TIME_RANGE, DEFAULT_RANGE } from './progression.js';
import { isTimed } from './exercises.js';
import { weekIndex } from './plan.js';
import { save } from './store.js';

const ID = /^[\w.-]{1,64}$/;
const LEVEL_TYPES = ['strength', 'powerlifting'];

// What the coach may suggest, and the shape to answer in. Appended to the coach's system prompt.
export const EDIT_RULES = `Changing their routines: only when they ask for a concrete change (or clearly need one, e.g. an injury), end your reply with a fenced block \`\`\`changes holding a JSON array of at most 5 edits, using the exact ids listed below, and explain the changes in your normal text above it. Allowed edits:
{"op":"swap","routine":"<routine id>","from":"<exercise id>","to":"<exercise id>"}
{"op":"sets","routine":"<id>","ex":"<exercise id>","sets":4}
{"op":"reps","routine":"<id>","ex":"<exercise id>","min":6,"max":10} (for timed exercises these are seconds)
{"op":"rest","routine":"<id>","ex":"<exercise id>","seconds":120}
{"op":"add","routine":"<id>","ex":"<exercise id>","sets":3,"after":"<exercise id or null>"}
{"op":"remove","routine":"<id>","ex":"<exercise id>"}
Never invent ids: "from" and "ex" must be in that routine, "to" and added exercises come from the swap-in list. No whole-day rebuilds. For advice only, leave the block out.`;

// The library an edit may bring in: the same filter as the plan builder; without a profile, just real lifting exercises.
const allowedList = (all, profile) => profile ? candidates(all, profile) : all.filter(e => LEVEL_TYPES.includes(e.category));

const fmtRange = (it, lib) => it.timed ?? isTimed(lib[it.exId]) ? `${it.repMin}–${it.repMax} s` : `${it.repMin}–${it.repMax}`;
const line = (it, lib) => `${lib[it.exId]?.name || it.exId} ${it.sets} × ${fmtRange(it, lib)}`;
const isT = (it, lib) => it.timed ?? isTimed(lib[it.exId]);
const rangeOf = (T, goal) => T ? TIME_RANGE : GOALS[goal] || DEFAULT_RANGE;

// ctx: { text, routines, lib, allowed, goal }. text is the system-prompt block (routines + swap-in candidates).
export function editContext(routines, lib, profile, all) {
  const allowed = allowedList(all, profile), goal = profile?.goal;
  const muscles = [...new Set(routines.flatMap(r => r.items.map(it => lib[it.exId]?.primaryMuscles?.[0])).filter(Boolean))];
  const pool = muscles.flatMap(m => allowed.filter(e => e.primaryMuscles[0] === m).slice(0, 8));
  const text = [
    'Their routines (id | name | sets x reps, or seconds for timed | rest in seconds):',
    ...routines.flatMap(r => [`routine ${r.id} "${r.name}"`, ...r.items.map(it =>
      `- ${it.exId} | ${lib[it.exId]?.name || it.exId} | ${it.sets} x ${it.repMin ?? '?'}-${it.repMax ?? '?'}${isT(it, lib) ? ' s' : ''} | rest ${it.rest ?? 'default'}`)]),
    'Exercises you may swap in or add (id | name | muscle | equipment):',
    ...pool.map(e => `${e.id} | ${e.name} | ${e.primaryMuscles[0]} | ${e.equipment}`),
  ].join('\n');
  return { text, routines, lib, allowed: new Set(allowed.map(e => e.id)), goal };
}

// Splits the reply into display text and checked changes.
export function parseChanges(reply, ctx) {
  const m = reply.match(/```changes\s*([\s\S]*?)```/i) || reply.match(/```changes\s*([\s\S]*)$/i);
  const text = reply.replace(/```changes[\s\S]*?(```|$)/i, '').trim();
  if (!m) return { text, changes: [] };
  let raw;
  try { raw = JSON.parse(m[1].trim()); } catch { return { text, changes: [] }; }
  if (!Array.isArray(raw)) return { text, changes: [] };
  return { text, changes: raw.slice(0, 5).map(c => check(c, ctx)) };
}

function check(c, { routines, lib, allowed, goal }) {
  const bad = reason => ({ invalid: true, reason });
  if (!c || typeof c !== 'object') return bad('not an edit');
  const op = c.op;
  if (!['swap', 'sets', 'reps', 'rest', 'add', 'remove'].includes(op)) return bad('unknown kind of change');
  const r = routines.find(r => r.id === c.routine) || routines.find(r => typeof c.routine === 'string' && r.name.toLowerCase() === c.routine.toLowerCase());
  if (!r) return bad('that routine doesn\'t exist');
  const lower = {};
  for (const e of Object.values(lib)) { lower[e.id.toLowerCase()] = e.id; lower[e.name.toLowerCase()] = e.id; }
  const resolve = v => { // exact id first, then id or name ignoring case
    if (typeof v !== 'string' || v.length > 100) return null;
    const id = lib[v] ? v : lower[v.toLowerCase()];
    return id && ID.test(id) ? id : null;
  };
  const inR = v => { const id = resolve(v); return id && r.items.some(it => it.exId === id) ? id : null; };
  const name = id => lib[id].name;
  const out = { op, routine: r.id };
  const tag = `${r.name}: `;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v)));
  if (op === 'add') {
    const ex = resolve(c.ex);
    if (!ex || !allowed.has(ex)) return bad(`${c.ex} isn't an exercise you can use`);
    if (r.items.some(it => it.exId === ex)) return bad(`${name(ex)} is already in ${r.name}`);
    const T = isTimed(lib[ex]), sets = num(c.sets || 3, 1, 6), after = c.after == null ? null : inR(c.after);
    return { ...out, ex, sets, after, desc: `${tag}add ${name(ex)} ${sets} × ${rangeOf(T, goal).repMin}–${rangeOf(T, goal).repMax}${T ? ' s' : ''}` };
  }
  const key = op === 'swap' ? 'from' : 'ex', ex = inR(c[key]);
  if (!ex) return bad(`${typeof c[key] === 'string' ? c[key].slice(0, 40) : 'that exercise'} isn't in ${r.name}`);
  const it = r.items.find(i => i.exId === ex), T = isT(it, lib), before = line(it, lib);
  if (op === 'remove') return { ...out, ex, desc: `${tag}remove ${before}` };
  if (op === 'swap') {
    const to = resolve(c.to);
    if (!to || !allowed.has(to)) return bad(`${c.to} isn't an exercise you can use`);
    if (r.items.some(i => i.exId === to)) return bad(`${name(to)} is already in ${r.name}`);
    const T2 = isTimed(lib[to]), rg = T2 === T ? it : rangeOf(T2, goal);
    return { ...out, from: ex, to, desc: `${tag}${before} → ${name(to)} ${it.sets} × ${rg.repMin}–${rg.repMax}${T2 ? ' s' : ''}` };
  }
  if (op === 'sets') { const sets = num(c.sets, 1, 6); return { ...out, ex, sets, desc: `${tag}${before} → ${name(ex)} ${sets} × ${fmtRange(it, lib)}` }; }
  if (op === 'rest') {
    const seconds = +c.seconds > 0 ? snapRest(c.seconds) : 0;
    return { ...out, ex, seconds, desc: `${tag}${name(ex)} rest ${it.rest ? it.rest + ' s' : 'default'} → ${seconds ? seconds + ' s' : 'none'}` };
  }
  const [lo, hi] = T ? [10, 600] : [1, 30];
  if (![c.min, c.max].every(v => Number.isFinite(+v))) return bad('the rep range wasn\'t a number');
  const min = num(c.min, lo, hi), max = Math.max(min, num(c.max, lo, hi));
  return { ...out, ex, min, max, desc: `${tag}${before} → ${name(ex)} ${it.sets} × ${min}–${max}${T ? ' s' : ''}` };
}

// Edit one item list in place. False when it doesn't fit this list (so weeks without the exercise are skipped).
function mutate(items, c, lib, goal) {
  const i = items.findIndex(it => it.exId === (c.op === 'add' ? c.after : c.op === 'swap' ? c.from : c.ex));
  if (c.op === 'add') {
    if (items.some(it => it.exId === c.ex)) return false;
    const T = isTimed(lib[c.ex]), g = rangeOf(T, goal);
    const at = i < 0 ? items.length : i + 1 + (items[i].ss ? 1 : 0); // never split a superset pair
    items.splice(Math.min(at, items.length), 0, { exId: c.ex, sets: c.sets, repMin: g.repMin, repMax: g.repMax, rest: GOALS[goal]?.rest ?? 90, ss: false, ...(T && { timed: true }) });
    return true;
  }
  if (i < 0) return false;
  const it = items[i];
  if (c.op === 'swap') {
    if (items.some(x => x.exId === c.to)) return false;
    const was = isT(it, lib), now = isTimed(lib[c.to]);
    it.exId = c.to;
    if (now !== was) { const g = rangeOf(now, goal); it.repMin = g.repMin; it.repMax = g.repMax; }
    if (now) it.timed = true; else delete it.timed;
  } else if (c.op === 'sets') it.sets = c.sets;
  else if (c.op === 'reps') { it.repMin = c.min; it.repMax = c.max; }
  else if (c.op === 'rest') it.rest = c.seconds;
  else { // remove
    if (i > 0 && items[i - 1].ss) items[i - 1].ss = false;
    items.splice(i, 1);
  }
  return true;
}

// Does this change reach the rest of the month? (Plan routines only.)
export const reachesPlan = (r, db) => !!(r?.ai && db.plan);

// Applies the change; returns an undo snapshot, or null when nothing fit. Plan routines also change the same-named
// day in every remaining week, so Monday's applyWeek doesn't bring the old exercise back.
export function applyChange(c, db, lib) {
  const r = db.routines.find(r => r.id === c.routine);
  if (!r) return null;
  const goal = db.profile?.goal, snap = { routine: structuredClone(r), weeks: db.plan ? structuredClone(db.plan.weeks) : null };
  if (!mutate(r.items, c, lib, goal)) return null;
  if (reachesPlan(r, db)) {
    const last = db.plan.weeks.length - 1;
    for (let k = Math.min(Math.max(weekIndex(), 0), last); k <= last; k++) {
      if (c.op === 'sets' && db.plan.deload === k) continue; // the deload week keeps its lighter volume
      const day = db.plan.weeks[k].find(d => d.name === r.name);
      if (day) mutate(day.items, c, lib, goal);
    }
  }
  save('routines', 'plan');
  return snap;
}

export function undoChange(snap, db) {
  const i = db.routines.findIndex(r => r.id === snap.routine.id);
  if (i >= 0) db.routines[i] = snap.routine;
  if (snap.weeks && db.plan) db.plan.weeks = snap.weeks;
  save('routines', 'plan');
}
