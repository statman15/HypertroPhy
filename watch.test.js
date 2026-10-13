// Run: node watch.test.js
import assert from 'node:assert/strict';
import { watchState } from './watch.js';

const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const ctx = { name: id => id.toUpperCase(), timed: it => !!it.timed, setTarget: (it, j) => ({ w: +it.sets[j].w || 135, r: +it.sets[j].r || 8 }) };

assert.deepEqual(watchState(null, [{ id: 'r1', name: 'Upper A' }], 'lb', ctx), { v: 1, active: false, units: 'lb', routines: [{ id: 'r1', name: 'Upper A' }] });

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
console.log('watch: all checks pass');
