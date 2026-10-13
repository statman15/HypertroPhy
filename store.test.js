// Run: node store.test.js
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { db, backup, restore, volume, sessions, setUnits, kcal } = await import('./store.js');

db.settings = { units: 'lb', ai: { preset: 'gemini', gemini: { url: 'x', key: 'SECRET', model: 'm' } } };
db.workouts = [{ id: 'w1', name: 'Push', start: 1, end: 2, items: [{ exId: 'Pullups', sets: [{ w: 0, r: 8 }] }] }];
db.routines = [{ id: 'r1', name: 'Push', items: [{ exId: 'Pullups', sets: 3, repMin: 8, repMax: 12, rest: 90 }] }];

const file = JSON.parse(JSON.stringify(backup()));
assert.ok(!JSON.stringify(file).includes('SECRET'), 'AI keys never leave the phone');

db.workouts = []; db.settings.ai.gemini.key = 'PHONE-KEY';
assert.equal(restore(file), 1);
assert.equal(db.workouts[0].items[0].sets[0].r, 8);
assert.equal(db.settings.ai.gemini.key, 'PHONE-KEY', 'restore keeps this phone\'s AI setup');

const evil = structuredClone(file);
evil.workouts[0].id = '"><img src=x onerror=alert(1)>';
assert.throws(() => restore(evil), /isn't a HypertroPhy backup/, 'ids that could break out of an attribute are refused');
const evil2 = structuredClone(file);
evil2.workouts[0].items[0].sets[0].r = '<b>8</b>';
assert.throws(() => restore(evil2), /isn't a HypertroPhy backup/, 'non-numeric reps are refused');
assert.throws(() => restore({ hello: 1 }), /isn't a HypertroPhy backup/);

const strings = structuredClone(file);
strings.workouts[0].items[0].sets[0] = { w: '135', r: '10' };
restore(strings);
assert.deepEqual(db.workouts[0].items[0].sets[0], { w: 135, r: 10 }, 'numeric strings are turned into numbers');

// Warm-ups count for nothing
const items = [{ exId: 'Barbell_Squat', sets: [{ w: 45, r: 10, wu: true }, { w: 135, r: 5 }] }];
assert.equal(volume(items), 675, 'warm-up sets are left out of volume');
db.workouts = [{ id: 'w2', name: 'Legs', start: 0, end: 3.6e6, items }];
assert.deepEqual(sessions('Barbell_Squat')[0].sets, [{ w: 135, r: 5 }], 'and out of history used by progression and records');

// Body data: kept in backups, checked on restore, converted with units, used for calories
db.settings = { units: 'lb', ai: {} };
db.body = { sex: 'male', birthYear: 1990, heightCm: 180, weights: [{ t: 1, w: 198.4 }] };
assert.equal(kcal(db.workouts[0]), 450, 'MET 5 × 90 kg × 1 h');
const withBody = JSON.parse(JSON.stringify(backup()));
withBody.body.sex = '<script>'; withBody.body.weights.push({ t: 'x', w: 5 }, { t: 2, w: -1 });
restore(withBody);
assert.deepEqual(db.body, { sex: '', birthYear: 1990, heightCm: 180, weights: [{ t: 1, w: 198.4 }] }, 'bad body fields are dropped');
// Heart rate: Keytel formula when avg HR, sex, age and weight are known; the HR field is whitelisted on restore
const yr = new Date().getFullYear();
db.body.birthYear = yr - 30; db.body.sex = 'male';
db.workouts[0].hr = { avg: 130, max: 160 };
assert.equal(kcal(db.workouts[0]), Math.round((-55.0969 + 0.6309 * 130 + 0.1988 * 90 + 0.2017 * 30) / 4.184 * 60), 'male Keytel, 1 h');
db.body.sex = 'female';
assert.equal(kcal(db.workouts[0]), Math.round((-20.4022 + 0.4472 * 130 - 0.1263 * 90 + 0.074 * 30) / 4.184 * 60), 'female Keytel, 1 h');
db.body.sex = '';
assert.equal(kcal(db.workouts[0]), 450, 'no sex: back to MET 5');
db.body.sex = 'male'; db.workouts[0].hr = { avg: 20, max: 30 };
assert.equal(kcal(db.workouts[0]), 0, 'never negative');
db.workouts[0].hr = { avg: 130, max: 160 };
const hrFile = JSON.parse(JSON.stringify(backup()));
restore(hrFile);
assert.deepEqual(db.workouts[0].hr, { avg: 130, max: 160 });
hrFile.workouts[0].hr = { avg: '<b>', max: 160 };
restore(hrFile);
assert.equal(db.workouts[0].hr, undefined, 'non-numeric hr is dropped');
restore(JSON.parse(JSON.stringify(withBody)));
setUnits('kg');
assert.equal(db.body.weights[0].w, 90, 'weigh-ins convert with the units');

console.log('store: all checks pass');
