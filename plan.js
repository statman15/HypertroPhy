// The month plan: 4 weeks of AI routines. Each Monday the app swaps the AI routines to that week's set
// (your own routines stay). Finished months are kept in db.plans and feed the next month's prompt.
import { db, save, uid } from './store.js';

const WEEK = 7 * 864e5;

// Midnight on the Monday of t's week (local time).
export function monday(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d.getTime();
}

// 0-based week of the plan for `now`; Math.round absorbs the hour a daylight-saving change adds or removes.
export const weekIndex = (p = db.plan, now = Date.now()) => p ? Math.round((monday(now) - p.start) / WEEK) : -1;
export const monthDone = (p = db.plan, now = Date.now()) => !!p && weekIndex(p, now) >= p.weeks.length;

// Make the AI routines match the current week. Returns true when it changed something.
export function applyWeek(now = Date.now()) {
  const p = db.plan;
  if (!p) return false;
  const k = Math.min(Math.max(weekIndex(p, now), 0), p.weeks.length - 1);
  if (p.applied === k) return false;
  const deload = p.deload === k;
  db.routines = db.routines.filter(r => !r.ai).concat(p.weeks[k].map(d => ({
    id: uid(), ai: true, week: k + 1, name: d.name,
    items: d.items.map(it => ({ ...it, ...(deload && { deload: true }) })),
  })));
  p.applied = k;
  save('routines', 'plan');
  return true;
}

// A new month starts this week. The month it replaces is kept (last 12) for the next prompt's history.
export function startMonth(weeks, notes) {
  if (db.plan) db.plans = [db.plan, ...db.plans].slice(0, 12);
  db.plan = { start: monday(Date.now()), weeks, notes, deload: weeks.length === 4 ? 3 : null, applied: -1 };
  save('plan', 'plans');
  applyWeek();
}
