// Run: node progression.test.js
import assert from 'node:assert/strict';
import { nextTarget, stepFor } from './progression.js';

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
