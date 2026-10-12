// Run: node ai.test.js
import assert from 'node:assert/strict';
import { parsePlan } from './ai.js';

const lib = { Pullups: { id: 'Pullups', name: 'Pullups' }, Barbell_Squat: { id: 'Barbell_Squat', name: 'Barbell Squat' } };

const p = parsePlan('Here you go:\n```json\n{"days":[{"name":"Day 1","exercises":[{"id":"Pullups","sets":"4","superset_with_next":true},{"id":"barbell squat","sets":9,"superset_with_next":true},{"id":"Made_Up_Lift"}]},{"name":"Empty","exercises":[{"id":"Nope"}]}],"notes":"ok"}\n```', lib);
assert.equal(p.days.length, 1, 'days with no real exercises are dropped');
assert.deepEqual(p.days[0].items, [
  { exId: 'Pullups', sets: 4, ss: true },
  { exId: 'Barbell_Squat', sets: 6, ss: false }, // matched by name, sets capped, last item can't superset
]);
assert.equal(p.dropped, 2, 'invented ids are counted');
assert.throws(() => parsePlan('no json here', lib), /readable plan/);
assert.throws(() => parsePlan('{"days":[{"exercises":[{"id":"Nope"}]}]}', lib), /didn't use any exercises/);

console.log('ai: all checks pass');
