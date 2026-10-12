// Run: node ai.test.js
import assert from 'node:assert/strict';
import { parsePlan, snapRest } from './ai.js';

const lib = {
  Pullups: { id: 'Pullups', name: 'Pullups' },
  Barbell_Squat: { id: 'Barbell_Squat', name: 'Barbell Squat' },
  Plank: { id: 'Plank', name: 'Plank', force: 'static', category: 'strength' },
};

const p = parsePlan('Here you go:\n```json\n{"days":[{"name":"Day 1","exercises":[{"id":"Pullups","sets":"4","rest_seconds":100,"superset_with_next":true},{"id":"barbell squat","sets":9,"rest_seconds":"170","superset_with_next":true},{"id":"Made_Up_Lift"}]},{"name":"Empty","exercises":[{"id":"Nope"}]}],"notes":"ok"}\n```', lib);
assert.equal(p.weeks.length, 4, 'a one-week reply is padded to a month');
assert.equal(p.weeks[0].length, 1, 'days with no real exercises are dropped');
assert.deepEqual(p.weeks[0][0].items, [
  { exId: 'Pullups', sets: 4, ss: true, rest: 90 },          // rest snapped to the nearest timer choice
  { exId: 'Barbell_Squat', sets: 6, ss: false, rest: 180 },  // matched by name, sets capped, last item can't superset
]);
assert.equal(p.dropped, 2, 'invented ids are counted');
assert.notEqual(p.weeks[3], p.weeks[0], 'padded weeks are copies, not the same object');
assert.throws(() => parsePlan('no json here', lib), /readable plan/);
assert.throws(() => parsePlan('{"days":[{"exercises":[{"id":"Nope"}]}]}', lib), /didn't use any exercises/);

const t = parsePlan('{"days":[{"name":"Core","exercises":[{"id":"Plank","sets":3,"seconds":45},{"id":"Pullups","sets":3}]}]}', lib);
assert.deepEqual(t.weeks[0][0].items[0], { exId: 'Plank', sets: 3, ss: false, rest: null, timed: true, repMin: 45, repMax: 60 }, 'holds get seconds, not reps');
assert.equal(t.weeks[0][0].items[1].rest, null, 'no rest given: the goal default fills in later');

const m = parsePlan(JSON.stringify({ weeks: [1, 2, 3, 4, 5].map(n => ({ days: [{ name: "Full", exercises: [{ id: n % 2 ? "Pullups" : "Barbell_Squat", sets: 3 }] }] })) }), lib);
assert.equal(m.weeks.length, 4, "never more than 4 weeks");
assert.deepEqual(m.weeks.map(w => w[0].items[0].exId), ["Pullups", "Barbell_Squat", "Pullups", "Barbell_Squat"], "each week keeps its own exercises");

assert.equal(snapRest(0), null);
assert.equal(snapRest(20), 30);
assert.equal(snapRest(1000), 300);
console.log('ai: all checks pass');
