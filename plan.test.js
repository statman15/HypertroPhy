// Run: node plan.test.js
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { db, backup, restore } = await import('./store.js');
const { monday, weekIndex, monthDone, applyWeek, startMonth } = await import('./plan.js');

const at = s => new Date(s).getTime();
assert.equal(monday(at('2026-10-14T18:00')), at('2026-10-12T00:00'), 'Wednesday → that Monday');
assert.equal(monday(at('2026-10-18T23:00')), at('2026-10-12T00:00'), 'Sunday still belongs to the week that started Monday');

const week = n => [{ name: 'Upper', items: [{ exId: 'Ex' + n, sets: 3, repMin: 8, repMax: 12, rest: 90 }] }];
db.routines = [{ id: 'mine', name: 'My routine', items: [] }];
startMonth([week(1), week(2), week(3), week(4)], 'notes');
const p = db.plan;
assert.equal(p.start, monday(Date.now()));
assert.deepEqual(db.routines.map(r => r.name), ['My routine', 'Upper'], 'your own routines stay');
assert.equal(db.routines[1].items[0].exId, 'Ex1');

const later = n => p.start + n * 7 * 864e5 + 3 * 864e5; // the Thursday of week n
assert.equal(weekIndex(p, later(1)), 1);
assert.equal(applyWeek(later(1)), true, 'a new week swaps the routines');
assert.equal(db.routines[1].items[0].exId, 'Ex2');
assert.equal(applyWeek(later(1)), false, 'and only once');
applyWeek(later(3));
assert.equal(db.routines[1].items[0].deload, true, 'week 4 is the deload');
assert.equal(db.routines[1].week, 4);
assert.equal(monthDone(p, later(4)), true, 'month done after week 4');
applyWeek(later(5));
assert.equal(db.routines[1].items[0].exId, 'Ex4', 'after the month the last week stays until a new one is built');

startMonth([week(5), week(6), week(7), week(8)], 'next');
assert.equal(db.plans.length, 1, 'the old month is kept');
assert.equal(db.plans[0].weeks[0][0].items[0].exId, 'Ex1');

const file = JSON.parse(JSON.stringify(backup()));
db.plan = null; db.plans = [];
file.settings = { units: 'lb' };
restore(file);
assert.equal(db.plan.weeks[1][0].items[0].exId, 'Ex6', 'plans survive a backup');
assert.equal(db.plans.length, 1);
const bad = structuredClone(file); bad.plan.weeks[0][0].items[0].exId = '"><img src=x>';
assert.throws(() => restore(bad), /isn't a HypertroPhy backup/, 'plan items are checked on restore');
console.log('plan: all checks pass');
