// Run: node guess.test.js
import assert from 'node:assert/strict';
import { startGuess } from './guess.js';

const squat = { equipment: 'barbell', primaryMuscles: ['quadriceps'], mechanic: 'compound' };
const bench = { equipment: 'barbell', primaryMuscles: ['chest'], mechanic: 'compound' };
const curl = { equipment: 'dumbbell', primaryMuscles: ['biceps'], mechanic: 'isolation' };
const pullup = { equipment: 'body only', primaryMuscles: ['lats'] };
const lb = { round: 5, bar: 45 };

assert.equal(startGuess(squat, { bodyweight: 180, sex: 'male', ...lb }), 135, 'beginner man: squat 0.75 × bw');
assert.equal(startGuess(bench, { bodyweight: 180, sex: 'male', ...lb }), 90);
assert.equal(startGuess(bench, { bodyweight: 140, sex: 'female', ...lb }), 45, 'never under the empty bar');
assert.equal(startGuess(bench, { bodyweight: 180, sex: 'male', level: 'intermediate', ...lb }), 120);
assert.equal(startGuess(curl, { bodyweight: 180, sex: 'male', round: 5 }), 10, 'dumbbells per hand');
assert.equal(startGuess(pullup, { bodyweight: 180, sex: 'male', ...lb }), null, 'bodyweight moves get no guess');
assert.equal(startGuess(bench, { bodyweight: 0, ...lb }), null, 'no bodyweight, no guess');
assert.equal(startGuess(bench, { bodyweight: 200, sex: 'male', round: 10, bar: 45 }), 95, 'no 2.5s: bar + pairs of 5s (100 is not loadable)');
console.log('guess: all checks pass');
