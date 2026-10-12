// Run: node progression.test.js
import assert from 'node:assert/strict';
import { nextTarget, stepFor, plates, warmups } from './progression.js';

const range = { repMin: 8, repMax: 12, step: 5, round: 5 };
const s = (w, ...reps) => reps.map(r => ({ w, r }));

assert.equal(nextTarget([], range), null, 'no history, no target');
assert.deepEqual(nextTarget([s(100, 12, 12, 12)], range), { w: 105, r: 8, kind: 'up' }, 'all sets at the top of the range → add weight');
assert.deepEqual(nextTarget([s(100, 12, 10, 9)], range), { w: 100, r: 10, kind: 'hold' }, 'in range → same weight, +1 rep on the weakest set');
assert.deepEqual(nextTarget([s(100, 12, 12, 11)], range), { w: 100, r: 12, kind: 'hold' }, 'hold target never passes the top of the range');
assert.deepEqual(nextTarget([s(100, 9, 7)], range), { w: 100, r: 8, kind: 'hold' }, 'one miss → keep the weight');
assert.deepEqual(nextTarget([s(100, 9, 7), s(100, 8, 6)], range), { w: 90, r: 8, kind: 'deload' }, 'two misses at the same weight → deload 10%');
assert.deepEqual(nextTarget([s(100, 7), s(95, 6)], range), { w: 100, r: 8, kind: 'hold' }, 'misses at different weights are not a stall');
assert.deepEqual(nextTarget([s(135, 9, 7), s(135, 7)], range), { w: 120, r: 8, kind: 'deload' }, 'deload rounds to the plate step');
assert.deepEqual(nextTarget([[...s(45, 15), ...s(100, 12, 12)]], range), { w: 105, r: 8, kind: 'up' }, 'warm-up sets are ignored');
assert.deepEqual(nextTarget([s(0, 10, 8)], range), { w: 0, r: 9, kind: 'reps' }, 'bodyweight → more reps');
assert.deepEqual(nextTarget([[], s(100, 12, 12)], range), { w: 105, r: 8, kind: 'up' }, 'empty sessions are skipped');

const squat = { equipment: 'barbell', primaryMuscles: ['quadriceps'] }, curl = { equipment: 'dumbbell', primaryMuscles: ['biceps'] };
assert.deepEqual(stepFor(squat, 'lb'), { step: 10, round: 5 });
assert.deepEqual(stepFor(curl, 'lb'), { step: 5, round: 5 });
assert.deepEqual(stepFor(squat, 'kg'), { step: 5, round: 2.5 });

console.log('progression: all checks pass');

assert.deepEqual(plates(225, 45, [45, 35, 25, 10, 5, 2.5]), { side: [45, 45], left: 0 }, '225 = two 45s a side');
assert.deepEqual(plates(140, 45, [45, 35, 25, 10, 5, 2.5]), { side: [45, 2.5], left: 0 });
assert.deepEqual(plates(137, 45, [45, 25, 10]), { side: [45], left: 1 }, 'reports what the plates on hand cannot make');
assert.equal(plates(30, 45, [45]).under, true, 'under the bar weight');
assert.deepEqual(plates(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]), { side: [25, 15], left: 0 }, 'kg plates');

assert.deepEqual(warmups(225, { bar: 45, round: 5 }), [{ w: 45, r: 10 }, { w: 110, r: 8 }, { w: 155, r: 5 }, { w: 190, r: 3 }]);
assert.deepEqual(warmups(60, { bar: 45, round: 5 }), [{ w: 45, r: 8 }, { w: 50, r: 3 }], 'light barbell: no empty-bar set, no duplicates');
assert.deepEqual(warmups(30, { round: 5 }), [{ w: 15, r: 8 }, { w: 20, r: 5 }, { w: 25, r: 3 }], 'dumbbells: no bar');
assert.deepEqual(warmups(225, { bar: 45, round: 10 }), [{ w: 45, r: 10 }, { w: 105, r: 8 }, { w: 155, r: 5 }, { w: 185, r: 3 }], 'without 2.5s every warm-up is bar + 5s pairs');
console.log('plates + warm-ups: all checks pass');
