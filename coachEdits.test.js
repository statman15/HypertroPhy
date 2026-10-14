// Run: node coachEdits.test.js
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { db } = await import('./store.js');
const { editContext, parseChanges, applyChange, undoChange } = await import('./coachEdits.js');
const { monday } = await import('./plan.js');

const ex = (id, name, muscle, equipment = 'barbell', extra = {}) => ({ id, name, primaryMuscles: [muscle], equipment, level: 'beginner', category: 'strength', ...extra });
const all = [
  ex('OHP', 'Overhead Press', 'shoulders'), ex('Landmine_Press', 'Landmine Press', 'shoulders'), ex('Lat_Raise', 'Lateral Raise', 'shoulders', 'dumbbell'),
  ex('Plank', 'Plank', 'abdominals', 'body only', { force: 'static' }), ex('Crunch', 'Crunch', 'abdominals', 'body only'),
  ex('Cable_Fly', 'Cable Fly', 'chest', 'cable'), ex('Stretch', 'Stretch', 'chest', 'barbell', { category: 'stretching' }),
];
const lib = Object.fromEntries(all.map(e => [e.id, e]));
const profile = { goal: 'strength', level: 'beginner', equipment: ['barbell', 'dumbbell', 'body only'] };

const item = (exId, extra = {}) => ({ exId, sets: 3, repMin: 8, repMax: 12, rest: 90, ss: false, ...extra });
const mkDay = () => ({ name: 'Upper A', items: [item('OHP'), item('Lat_Raise', { ss: true }), item('Crunch')] });
db.profile = profile;
db.plan = { start: monday(Date.now()) - 7 * 864e5, deload: 3, applied: 1, weeks: [0, 1, 2, 3].map(k => [{ name: 'Upper A', items: [item('OHP'), item(k === 2 ? 'Crunch' : 'Lat_Raise', { ss: k !== 2 }), ...(k === 2 ? [] : [item('Crunch')])] }]) };
db.routines = [{ id: 'r1', ai: true, week: 2, name: 'Upper A', items: mkDay().items }, { id: 'mine', name: 'Mine', items: [item('Plank', { timed: true, repMin: 30, repMax: 45 })] }];
const ctx = () => editContext(db.routines, lib, profile, all);

// context: routines + swap-in candidates filtered by equipment and category
const c = ctx();
assert.match(c.text, /routine r1 "Upper A"/);
assert.match(c.text, /- OHP \| Overhead Press \| 3 x 8-12 \| rest 90/);
assert.match(c.text, /Plank | Plank | 3 x 30-45 s\| Plank \| 30-45 s/);
assert.match(c.text, /Landmine_Press \| Landmine Press \| shoulders \| barbell/);
assert.ok(!c.allowed.has('Cable_Fly') && !c.allowed.has('Stretch'), 'equipment and category filtered');

// parsing: display text, validation, clamping
const reply = t => 'Try this.\n```changes\n' + JSON.stringify(t) + '\n```';
const p = parseChanges(reply([
  { op: 'swap', routine: 'r1', from: 'OHP', to: 'landmine press' },
  { op: 'swap', routine: 'r1', from: 'Nope', to: 'Landmine_Press' },
  { op: 'swap', routine: 'r1', from: 'OHP', to: 'Cable_Fly' },
  { op: 'sets', routine: 'r1', ex: 'OHP', sets: 99 },
  { op: 'reps', routine: 'r1', ex: 'OHP', min: 15, max: 4 },
  { op: 'reps', routine: 'mine', ex: 'Plank', min: 5, max: 900 },
  { op: 'rest', routine: 'r1', ex: 'OHP', seconds: 100 },
  { op: 'explode', routine: 'r1' }, { op: 'remove', routine: 'ghost', ex: 'OHP' },
]), ctx());
assert.equal(p.text, 'Try this.');
assert.equal(p.changes.length, 5, 'at most 5');
assert.equal(p.changes[0].to, 'Landmine_Press', 'matched by name');
assert.equal(p.changes[0].desc, 'Upper A: Overhead Press 3 × 8–12 → Landmine Press 3 × 8–12');
assert.match(p.changes[1].reason, /isn't in Upper A/);
assert.match(p.changes[2].reason, /isn't an exercise you can use/);
assert.equal(p.changes[3].sets, 6);
assert.deepEqual([p.changes[4].min, p.changes[4].max], [15, 15]);
const q = parseChanges(reply([{ op: 'reps', routine: 'mine', ex: 'Plank', min: 5, max: 900 }, { op: 'rest', routine: 'r1', ex: 'OHP', seconds: 100 }, { op: 'rest', routine: 'r1', ex: 'OHP', seconds: 0 }, { op: 'add', routine: 'r1', ex: 'Plank', sets: 3, after: 'OHP' }, { op: 'add', routine: 'r1', ex: 'OHP' }]), ctx());
assert.deepEqual([q.changes[0].min, q.changes[0].max], [10, 600], 'seconds clamped for timed');
assert.equal(q.changes[1].seconds, 90, 'rest snapped');
assert.equal(q.changes[2].seconds, 0, 'no rest allowed');
assert.equal(q.changes[3].ex, 'Plank');
assert.match(q.changes[4].reason, /already in/);
assert.deepEqual(parseChanges('Just advice.', ctx()), { text: 'Just advice.', changes: [] });
assert.deepEqual(parseChanges('x\n```changes\nnot json\n```', ctx()), { text: 'x', changes: [] });

// apply: plan routine reaches this week and the rest of the month (week index 1 here), not week 0
const swap = p.changes[0], snap = applyChange(swap, db, lib);
assert.ok(snap);
assert.equal(db.routines[0].items[0].exId, 'Landmine_Press');
assert.deepEqual(db.plan.weeks.map(w => w[0].items[0].exId), ['OHP', 'Landmine_Press', 'Landmine_Press', 'Landmine_Press']);
undoChange(snap, db);
assert.equal(db.routines[0].items[0].exId, 'OHP');
assert.deepEqual(db.plan.weeks.map(w => w[0].items[0].exId), ['OHP', 'OHP', 'OHP', 'OHP']);

// a week without the "from" exercise is skipped silently
const s2 = applyChange({ op: 'swap', routine: 'r1', from: 'Lat_Raise', to: 'Landmine_Press' }, db, lib);
assert.deepEqual(db.plan.weeks.map(w => w[1]?.exId ?? w[0].items[1].exId), ['Lat_Raise', 'Landmine_Press', 'Crunch', 'Landmine_Press']);
undoChange(s2, db);

// remove fixes the superset flag; add goes after, timed gets seconds; own routines don't touch the plan
const s3 = applyChange({ op: 'remove', routine: 'r1', ex: 'Lat_Raise' }, db, lib);
assert.deepEqual(db.routines[0].items.map(i => i.exId), ['OHP', 'Crunch']);
undoChange(s3, db);
assert.equal(db.routines[0].items[1].exId, 'Lat_Raise');
const s4 = applyChange({ op: 'add', routine: 'mine', ex: 'Crunch', sets: 2, after: null }, db, lib);
assert.deepEqual(db.routines[1].items.at(-1), { exId: 'Crunch', sets: 2, repMin: 3, repMax: 6, rest: 180, ss: false });
const s5 = applyChange({ op: 'swap', routine: 'mine', from: 'Plank', to: 'OHP' }, db, lib);
assert.deepEqual([db.routines[1].items[0].timed, db.routines[1].items[0].repMin, db.routines[1].items[0].repMax], [undefined, 3, 6], 'timed to reps resets the range');
undoChange(s5, db); undoChange(s4, db);
assert.equal(db.routines[1].items.length, 1);
assert.equal(db.plan.weeks[1][0].items[0].exId, 'OHP', 'own routine left the plan alone');
assert.equal(applyChange({ op: 'sets', routine: 'gone', ex: 'OHP', sets: 4 }, db, lib), null);

// sets skip the deload week
const s6 = applyChange({ op: 'sets', routine: 'r1', ex: 'OHP', sets: 5 }, db, lib);
assert.deepEqual(db.plan.weeks.map(w => w[0].items[0].sets), [3, 5, 5, 3]);
undoChange(s6, db);

console.log('coachEdits tests passed');
