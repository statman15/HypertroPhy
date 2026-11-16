// Run: node lifelog.test.js
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { db, save, backup, restore } = await import('./store.js');
const { payload, send, retry } = await import('./lifelog.js');

db.settings = { units: 'lb', lifelog: { home: 'http://home:8000/', url: 'https://away.ts.net', token: 'TOKEN' } };
db.workouts = [{ id: 'w1', name: 'Push', start: 1, end: 2, items: [{ exId: 'Pullups', sets: [{ w: 0, r: 8 }] }] }];
db.active = { id: 'live', items: [] };

const p = payload();
assert.deepEqual(p, { units: 'lb', all: true, workouts: db.workouts }, 'whole history, all flag, units');
assert.ok(!JSON.stringify(p).includes('live'), 'the workout in progress is never sent');

// home first; when it can't be reached, the away address
let calls = [];
globalThis.fetch = async (url, o) => {
  calls.push(url);
  assert.equal(o.headers.Authorization, 'Bearer TOKEN');
  if (url.startsWith('http://home')) throw new TypeError('unreachable');
  return { ok: true, status: 200 };
};
assert.deepEqual(await send(), { ok: true, n: 1 });
assert.deepEqual(calls, ['http://home:8000/ingest/hypertrophy', 'https://away.ts.net/ingest/hypertrophy']);
assert.equal(db.settings.lifelog.pending, false);
assert.equal(db.settings.lifelog.n, 1);

// both unreachable: no throw, pending for a retry on the next open
globalThis.fetch = async () => { throw new TypeError('unreachable'); };
const r = await send();
assert.equal(r.ok, false);
assert.equal(db.settings.lifelog.pending, true);
globalThis.fetch = async () => ({ ok: true, status: 200 });
assert.deepEqual(await retry(), { ok: true, n: 1 }, 'retry sends when a send is pending');
assert.equal(retry(), null, 'nothing pending, nothing sent');

// a bad token says so, and doesn't try the other address
calls = [];
globalThis.fetch = async url => { calls.push(url); return { ok: false, status: 401 }; };
assert.match((await send()).error, /token/);
assert.equal(calls.length, 1);

// saving workouts schedules a send; other saves don't
let sent = 0;
globalThis.fetch = async () => { sent++; return { ok: true, status: 200 }; };
save('settings');
save('workouts');
await new Promise(res => setTimeout(res, 2200));
assert.equal(sent, 1, 'one send ~2 s after workouts change');

// the token never goes in a backup, and restoring keeps this phone's LifeLog setup
const file = JSON.parse(JSON.stringify(backup()));
assert.ok(!JSON.stringify(file).includes('TOKEN'), 'LifeLog token never leaves the phone');
db.settings.lifelog.token = 'PHONE-TOKEN';
restore(file);
assert.equal(db.settings.lifelog.token, 'PHONE-TOKEN', 'restore keeps this phone\'s LifeLog setting');
console.log('lifelog ok');
process.exit(0); // the restore above schedules a send; don't wait for it
