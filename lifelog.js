// LifeLog (Chris's homelab health log): the Android app sends the whole workout history after every change.
// settings.lifelog = { home, url, token, pending, sentAt, n }, on this phone only (never in a backup).
// The whole history each time keeps edits, deletes, unit switches and restores in step with one code path; LifeLog
// drops workouts missing from an `all` batch (an empty batch drops nothing). Android only: the website's https page
// can't reach a plain-http LAN address, and Laura has no LifeLog.
import { db, save, onSave } from './store.js';

export const payload = () => ({ units: db.settings.units, all: true, workouts: db.workouts });

const cfg = () => db.settings.lifelog || {};
const endpoint = u => u.trim().replace(/\/+$/, '') + '/ingest/hypertrophy';

// Home address first, then the away (Tailscale) one. Never throws: a failure is recorded and retried on the next open.
export async function send() {
  const c = cfg(), addrs = [c.home, c.url].filter(a => a?.trim());
  if (!c.token || !addrs.length) return { ok: false, error: 'Add the LifeLog address and token first.' };
  const body = JSON.stringify(payload());
  let error = "Couldn't reach LifeLog. Will retry next time the app opens.";
  for (const a of addrs) {
    try {
      const res = await fetch(endpoint(a), {
        method: 'POST', body, signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 401 || res.status === 403) { error = 'LifeLog rejected the token. Check it in Settings.'; break; }
      if (!res.ok) { error = `LifeLog answered ${res.status}. Will retry next time the app opens.`; continue; }
      Object.assign(c, { pending: false, sentAt: Date.now(), n: db.workouts.length, error: '' });
      save('settings');
      return { ok: true, n: c.n };
    } catch { /* unreachable: try the next address */ }
  }
  Object.assign(c, { pending: true, error });
  save('settings');
  return { ok: false, error };
}

// Any save that touches workouts (finish, delete, unit switch, restore) sends a couple of seconds later.
let timer;
onSave.push(keys => {
  if (!keys.includes('workouts') || !cfg().token) return;
  // pending first, so a change is retried on the next open even if the app is closed before the send
  // (written directly: save('settings') would come back through this hook)
  cfg().pending = true;
  localStorage.setItem('settings', JSON.stringify(db.settings));
  clearTimeout(timer);
  timer = setTimeout(send, 2000);
});

// A send that failed last time (away from home, Tailscale off) goes again when the app opens.
export const retry = () => cfg().pending && cfg().token ? send() : null;
