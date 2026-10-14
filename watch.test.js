// Run: node watch.test.js
import assert from 'node:assert/strict';
import { watchState, action, nextSet, restAfter } from './watch.js';

const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const ctx = { name: id => id.toUpperCase(), timed: it => !!it.timed, setTarget: (it, j) => ({ w: +it.sets[j].w || 135, r: +it.sets[j].r || 8 }),
  setVals: (it, j) => ({ w: +it.sets[j].w || 135, r: +it.sets[j].r || (it.timed ? 30 : 8) }), wStep: it => (it.timed ? 5 : 10),
  range: it => (it.timed ? { repMin: 30, repMax: 30 } : { repMin: it.repMin, repMax: it.repMax }), first: it => ({ w: it.timed ? 0 : 135, r: it.timed ? 45 : it.repMax }) };

assert.deepEqual(watchState(null, [{ id: 'r1', name: 'Upper A' }], 'lb', ctx), { v: 1, active: false, units: 'lb', routines: [{ id: 'r1', name: 'Upper A', items: [] }] });

// idle routines carry items for the overview
const idle = watchState(null, [{ id: 'r1', name: 'Upper A', items: [
  { exId: 'bench', sets: 4, repMin: 6, repMax: 8, ss: true }, { exId: 'row', sets: 3, repMin: 10, repMax: 10 }, { exId: 'plank', sets: 3, timed: true, repMin: 30, repMax: 60 }] }], 'lb', ctx);
assert.deepEqual(idle.routines[0].items, [
  { name: 'BENCH', sets: 4, reps: '6–8', timed: false, w: 135, ss: true },
  { name: 'ROW', sets: 3, reps: '10', timed: false, w: 135, ss: false },
  { name: 'PLANK', sets: 3, reps: '45 s', timed: true, w: 0, ss: false }]);

const active = { name: 'Push', start: 5, restEnd: 0, items: [
  { exId: 'bench', sets: [{ wu: true, w: 45, r: 10, done: true }, { wu: true, w: 95, r: 5 }, { w: '', r: '' }, { w: '', r: '' }] },
  { exId: 'plank', timed: true, sets: [{ w: '', r: 45 }] },
  { exId: 'fly', sets: [{ w: '', r: '' }] },
] };
let s = watchState(active, [], 'lb', ctx);
assert.equal(s.exercise, 'BENCH'); assert.equal(s.set, 'Warm-up 2 of 2'); assert.equal(s.target, '95 lb × 5');
assert.equal(s.done, 1); assert.equal(s.total, 6); assert.equal(s.next, 'PLANK'); assert.equal(s.timed, false);
active.items[0].sets[1].done = true;
assert.equal(watchState(active, [], 'lb', ctx).set, 'Set 1 of 2', 'working sets are counted without warm-ups');
active.items[0].sets[2].done = active.items[0].sets[3].done = true;
s = watchState(active, [], 'kg', ctx);
assert.deepEqual([s.exercise, s.set, s.target, s.timed, s.next], ['PLANK', 'Set 1 of 1', '45 s hold', true, 'FLY']);
active.items[1].sets[0].done = true; active.items[2].sets[0].done = true; active.hold = { end: 99 };
s = watchState(active, [], 'lb', ctx);
assert.deepEqual([s.set, s.exercise, s.holdEnd, s.next], ['All sets done', '', 99, null]);

// items / cur for the watch's set lists
const act2 = { name: 'Push', start: 5, restEnd: 0, items: [
  { exId: 'bench', sets: [{ wu: true, w: 45, r: 10, done: true }, { w: '', r: '' }, { w: 140, r: 6 }] },
  { exId: 'plank', timed: true, sets: [{ w: '', r: 45 }] },
] };
s = watchState(act2, [], 'lb', ctx);
assert.deepEqual(s.cur, { i: 0, j: 1 });
assert.deepEqual(s.items[0], { name: 'BENCH', timed: false, wStep: 10, rStep: 1, rest: 0, ss: false, sets: [
  { label: 'W1', w: 45, r: 10, done: true }, { label: '1', w: 135, r: 8, done: false }, { label: '2', w: 140, r: 6, done: false }] });
assert.deepEqual([s.items[1].timed, s.items[1].rStep, s.items[1].sets[0].r], [true, 5, 45]);
act2.items.forEach(it => it.sets.forEach(x => (x.done = true)));
assert.equal(watchState(act2, [], 'lb', ctx).cur, null);

// superset order: A1 B1 (rest) A2 B2 ..., then the next exercise; unequal lengths and a lone trailing ss work
const d = n => Array.from({ length: n }, () => ({ done: false }));
const ch = [{ ss: true, sets: d(2) }, { sets: d(3) }, { sets: d(1) }, { ss: true, sets: d(1) }];
const order = [];
for (let c; (c = nextSet(ch)); ) { ch[c.i].sets[c.j].done = true; order.push(`${c.i}.${c.j}`); }
assert.deepEqual(order, ['0.0', '1.0', '0.1', '1.1', '1.2', '2.0', '3.0']);
assert.equal(nextSet([]), null);
act2.items.forEach(it => it.sets.forEach(x => (x.done = false)));
act2.items[0].ss = true; act2.items[0].sets[0].done = true;
assert.deepEqual(watchState(act2, [], 'lb', ctx).cur, { i: 1, j: 0 }, 'B1 follows A1');

// addRest: seconds may be negative; never before now, at or below now = over
assert.equal(restAfter(100_000, 15, 50_000), 115_000);
assert.equal(restAfter(0, 15, 50_000), 65_000);
assert.equal(restAfter(100_000, -15, 50_000), 85_000);
assert.equal(restAfter(60_000, -15, 50_000), 0);
assert.equal(restAfter(0, -15, 50_000), 0);
assert.equal(restAfter(900_000, 5000, 0), 1_500_000);
assert.equal(restAfter(900_000, -5000, 0), 300_000);

// setDone with values: clamped numbers go to workout.js; junk falls back to the current set
const calls = [], wk = { watchSetDone: (...a) => calls.push(a) };
const { db } = await import('./store.js');
db.active = active;
action(wk, { type: 'setDone', i: 0, j: 1, w: 9999, r: 0 });
action(wk, { type: 'setDone', i: 2, j: 0, w: '100', r: 12.4 });
action(wk, { type: 'setDone', i: 2, j: 0, w: NaN, r: 5 });
action(wk, { type: 'setDone', i: 9, j: 0, w: 1, r: 5 });
assert.deepEqual(calls.slice(0, 2), [[0, 1, 2000, 1, false], [2, 0, 100, 12, false]]);
assert.equal(calls.length, 4, 'non-finite or out-of-range targets fall back to the plain current-set path');
const rest = [], wk2 = { watchRest: s => rest.push(s) };
for (const seconds of [-15, 15, 9999, -9999]) action(wk2, { type: 'addRest', seconds });
assert.deepEqual(rest, [-15, 15, 600, -600]);
console.log('watch: all checks pass');
