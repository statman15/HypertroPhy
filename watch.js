// Galaxy Watch link (protocol v1, PLAN.md Phase 9): pushes the workout to the watch and handles what it sends back.
// The Android app has the WearBridge plugin; everywhere else this does nothing.
import { db, save } from './store.js';
import { num } from './ui.js';

// The state JSON the watch shows. Pure: ctx = { name(exId), timed(item), setTarget(item, j) -> {w, r}, setVals(item, j) -> {w, r} for the set list, wStep(item) } comes from workout.js.
export function watchState(active, routines, units, ctx) {
  if (!active) return { v: 1, active: false, units, routines: routines.map(r => ({ id: r.id, name: String(r.name), items: (r.items || []).map(it => routineItem(it, ctx)) })) };
  const all = active.items.flatMap((it, i) => it.sets.map((s, j) => ({ it, i, j, s })));
  const c = nextSet(active.items), cur = c && { it: active.items[c.i], i: c.i, j: c.j, s: active.items[c.i].sets[c.j] };
  const items = active.items.map(it => {
    const T = !!ctx.timed(it);
    return { name: ctx.name(it.exId), timed: T, wStep: ctx.wStep(it), rStep: T ? 5 : 1, rest: it.rest || 0, ss: !!it.ss,
      sets: it.sets.map((s, j) => ({ label: s.wu ? `W${it.sets.slice(0, j + 1).filter(x => x.wu).length}` : String(it.sets.slice(0, j + 1).filter(x => !x.wu).length), ...ctx.setVals(it, j), done: !!s.done })) };
  });
  const base = { v: 1, active: true, units, name: String(active.name), started: active.start, restEnd: active.restEnd || 0, holdEnd: active.hold?.end || 0,
    done: all.filter(x => x.s.done).length, total: all.length, items, cur: cur ? { i: cur.i, j: cur.j } : null };
  if (!cur) return { ...base, exercise: '', set: 'All sets done', target: '', timed: false, next: null };
  const { it, i, j, s } = cur, T = !!ctx.timed(it), wu = !!s.wu, of = it.sets.filter(x => !!x.wu === wu);
  const { w, r } = ctx.setTarget(it, j), k = it.sets.slice(0, j).filter(x => !!x.wu === wu).length + 1;
  const next = active.items.slice(i + 1).find(x => x.sets.some(y => !y.done));
  return { ...base, exercise: ctx.name(it.exId), timed: T, set: `${wu ? 'Warm-up' : 'Set'} ${k} of ${of.length}`,
    target: T ? `${r} s hold` : w > 0 ? `${num(w)} ${units} × ${r}` : `${r} reps`, next: next ? ctx.name(next.exId) : null };
}

// One routine item for the idle overview: sets x reps ("6–8", or "45 s" for a hold) and the suggested first working weight (0 = none).
function routineItem(it, ctx) {
  const T = !!ctx.timed(it), { repMin, repMax } = ctx.range(it), f = ctx.first(it);
  return { name: ctx.name(it.exId), sets: Math.max(1, +it.sets || 1), reps: T ? `${f.r} s` : repMin === repMax ? String(repMin) : `${repMin}–${repMax}`, timed: T, w: T ? 0 : f.w, ss: !!it.ss };
}

// The next set to do. Items linked with ss (item k paired with k+1) form a chain done as set 1 of each, set 2 of each, ...;
// otherwise exercises go in order. Returns {i, j} (item and set index) or null when everything is checked off.
export function nextSet(items) {
  for (let i = 0; i < items.length; i++) {
    if (items[i - 1]?.ss) continue; // part of the chain that started earlier
    let e = i;
    while (items[e].ss && e + 1 < items.length) e++;
    const n = Math.max(...items.slice(i, e + 1).map(it => it.sets.length));
    for (let j = 0; j < n; j++) for (let k = i; k <= e; k++) if (items[k].sets[j] && !items[k].sets[j].done) return { i: k, j };
  }
  return null;
}

// Rest end after the watch adds seconds (negative = shorten): never before now; at or below now it is over (0).
export function restAfter(restEnd, seconds, now) {
  const s = Math.max(-600, Math.min(600, Math.round(seconds)));
  if (!s) return 0;
  if (s > 0) return Math.max(restEnd || 0, now) + s * 1000;
  const end = (restEnd || 0) + s * 1000;
  return end > now ? end : 0;
}

// Keep-alive notification (title, text) from the same state; active=false stops the phone's foreground service.
export function keepAlive(st) {
  if (!st.active) return { active: false };
  return { active: true, title: st.name, text: st.exercise ? `${st.exercise} · ${st.set} · ${st.target}` : st.set };
}

// Wiring: wk is the workout.js module (passed in so this file stays importable from Node tests).
export function init(wk) {
  const plugin = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins.WearBridge;
  if (!plugin) return;
  let timer, lastHr = 0;
  const push = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const st = watchState(db.active, db.routines, db.settings.units, wk.watchCtx);
        plugin.pushState({ json: JSON.stringify(st) }).catch(() => {});
        plugin.setWorkout(keepAlive(st)).catch(() => {});
      } catch {}
    }, 300);
  };
  wk.hooks.change = push;
  plugin.addListener('hello', push);
  plugin.addListener('action', a => action(wk, a));
  plugin.addListener('hr', h => {
    const a = db.active, bpm = Math.round(+h?.bpm);
    if (!a || !(bpm > 30 && bpm < 250)) return;
    a.hr ||= { sum: 0, n: 0, max: 0 };
    a.hr.sum += bpm; a.hr.n++; a.hr.max = Math.max(a.hr.max, bpm);
    if (Date.now() - lastHr > 30000) { lastHr = Date.now(); save('active'); }
  });
  push();
}

// Exported so it can be driven without a watch (the same code the plugin's action event runs).
export function action(wk, a) {
  const act = db.active;
  if (a?.type === 'start') wk.watchStart(String(a.routineId));
  else if (!act) return;
  else if (a.type === 'setDone') {
    // With i, j, w, r: write those values into that set (clamped) and check it off; without, the current set.
    // hold:true on a timed set starts its hold with those seconds instead of logging it.
    const [i, j, w, r] = [a.i, a.j, a.w, a.r].map(Number);
    if ([a.i, a.j, a.w, a.r].every(v => v != null && v !== '') && [i, j, w, r].every(Number.isFinite) && act.items[i]?.sets[j])
      return wk.watchSetDone(i, j, Math.max(0, Math.min(2000, w)), Math.max(1, Math.min(3600, Math.round(r))), a.hold === true);
    const cur = nextSet(act.items);
    if (cur || act.hold) wk.watchSetDone(cur?.i, cur?.j);
  } else if (a.type === 'skipRest') wk.watchRest(0);
  else if (a.type === 'addRest') wk.watchRest(Math.max(-600, Math.min(600, Math.round(+a.seconds || 15))));
  else if (a.type === 'finish') wk.watchFinish();
}
