// Run: node store.test.js
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { db, backup, restore } = await import('./store.js');

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

console.log('store: all checks pass');
