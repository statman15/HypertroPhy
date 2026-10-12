// The Workout tab: routines when idle, the live logger during a workout, and the routine editor.
import { $, esc, num, day, clock, icon, restOptions, sheet, closeSheet } from './ui.js';
import { db, save, uid, lastSets, sessions, records, e1rm, volume, bodyweight } from './store.js';
import { nextTarget, nextHold, stepFor, DEFAULT_RANGE, TIME_RANGE, GOALS, plates, warmups, PLATE_DEFAULTS } from './progression.js';
import { startGuess } from './guess.js';
import { isTimed } from './exercises.js';
import { applyWeek, weekIndex, monthDone, monday } from './plan.js';

let lib, pick, onFinish, info, buildPlan, buildRoutine, editing = null, lock = null, audio = null;
const root = () => $('#workout');
const name = id => lib[id]?.name || id;
const blankSets = n => Array.from({ length: n }, () => ({ w: '', r: '' }));
const parse = v => parseFloat(String(v).replace(',', '.'));
const WEIGHTED = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'e-z curl bar'];
const kit = () => db.settings.plates || PLATE_DEFAULTS[db.settings.units];
// Rounding step for suggested weights: barbells can only change by two of the smallest plate you own.
const roundFor = ex => ex.equipment === 'barbell' && kit().have.length ? Math.max(stepFor(ex, db.settings.units).round, 2 * Math.min(...kit().have)) : stepFor(ex, db.settings.units).round;
// Set j's position among the working sets (warm-ups don't take a number or shift "Previous").
const workIdx = (it, j) => it.sets.slice(0, j).filter(s => !s.wu).length;
// Held for time (seconds) instead of reps: set when the exercise is added, switchable in its ⋯ menu.
const timed = it => it.timed ?? isTimed(lib[it.exId]);
const secs = n => n >= 60 ? clock(n * 1000) : `${n}s`;

// Android app only: the rest timer is also a system notification, so it buzzes with the phone locked.
const notes = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins.LocalNotifications;
notes?.createChannel({ id: 'rest', name: 'Rest timer', importance: 5, vibration: true }).catch(() => {});
async function syncRestNote() {
  if (!notes) return;
  try {
    await notes.cancel({ notifications: [{ id: 1 }, { id: 2 }] });
    const due = [[1, db.active?.restEnd, 'Rest over', 'Time for your next set.'], [2, db.active?.hold?.end, 'Time\'s up', 'Hold complete.']]
      .filter(([, at]) => at > Date.now());
    if (!due.length) return;
    if ((await notes.checkPermissions()).display !== 'granted' && (await notes.requestPermissions()).display !== 'granted') return;
    await notes.schedule({ notifications: due.map(([id, at, title, body]) => ({ id, channelId: 'rest', title, body, schedule: { at: new Date(at), allowWhileIdle: true } })) });
  } catch {} // no notification is fine: the in-app timer still runs
}

export function init(byId, picker, finished, showInfo, planBuilder, routineBuilder) {
  [lib, pick, onFinish, info, buildPlan, buildRoutine] = [byId, picker, finished, showInfo, planBuilder, routineBuilder];
  root().addEventListener('click', onClick);
  root().addEventListener('input', onInput);
  $('#rest').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || !db.active) return;
    db.active.restEnd = b.dataset.adj ? db.active.restEnd + b.dataset.adj * 1000 : 0;
    save('active');
    syncRestNote();
    tick();
  });
  $('#hold').addEventListener('click', ev => {
    const h = db.active?.hold, b = ev.target.closest('button');
    if (!h || !b) return;
    if (b.dataset.holdDone != null) return completeHold(Math.max(1, Math.round((Date.now() - h.start) / 1000)));
    db.active.hold = null; save('active'); syncRestNote(); render();
  });
  document.addEventListener('visibilitychange', keepAwake);
  setInterval(tick, 250);
  keepAwake();
}

export function render() {
  if (!db.active && !editing) applyWeek(); // a new Monday swaps in that week's AI routines
  root().innerHTML = editing ? editorHtml() : db.active ? activeHtml() : idleHtml();
  tick();
}

function idleHtml() {
  return `<div class="head"><h1>Workout</h1></div>
  <div class="pad">
${backupDue() ? `<div class="card group nag"><b>Back up your workouts</b><p class="a">Your data lives only on this phone. It's been over 2 weeks without a backup.</p><button class="pill wide quiet" data-backup>Save Backup</button></div>` : ''}
    ${planCard()}
    <button class="pill wide" data-act="empty">Start Empty Workout</button>
    ${db.plan && !monthDone() ? '' : `<button class="pill wide quiet" data-act="plan">${icon('sparkle')}${db.plan ? 'Build Next Month' : 'Build a Month Plan with AI'}</button>`}
    <div class="sec"><h2>Routines</h2><span><button class="text-btn" data-act="airoutine">${icon('sparkle')}AI</button><button class="text-btn" data-act="new">New Routine</button></span></div>
    ${db.routines.length ? db.routines.map(r => `<div class="card group">
      <div class="card-top"><b>${esc(r.name)}${r.ai ? ` <small class="pr">${r.week ? `Week ${r.week | 0}` : 'AI plan'}</small>` : r.aiOne ? ' <small class="pr">AI</small>' : ''}</b><button class="text-btn" data-act="edit" data-id="${r.id}">Edit</button></div>
      <p class="a">${esc(r.items.map(it => name(it.exId)).join(', ') || 'No exercises yet')}</p>
      <button class="pill wide" data-act="start" data-id="${r.id}">Start Routine</button>
    </div>`).join('') : '<p class="muted">No routines yet. Make one here, or finish a workout and save it as a routine from History.</p>'}
  </div>`;
}

// Nag once there's data and nothing has been backed up for 14 days (counting from the first workout).
const backupDue = () => db.workouts.length > 0 && Date.now() - (db.settings.lastBackup || db.workouts.at(-1).start) > 14 * 864e5;

// Where you are in the month plan; once it's over, the way to the next one.
function planCard() {
  const p = db.plan;
  if (!p) return '';
  if (monthDone()) return `<div class="card group nag"><b>Your month is done</b>
    <p class="a">Build next month: the AI looks at what you did and how each lift moved, and can bring back exercises from earlier months. Until then, last week's routines stay.</p></div>`;
  const k = weekIndex(), from = monday(Date.now()), to = from + 6 * 864e5;
  return `<div class="card group plan-card"><div class="card-top"><b>Week ${k + 1} of ${p.weeks.length}</b><small class="muted">${day(from)} – ${day(to)}</small></div>
    <p class="a">${p.deload === k ? 'Deload week: fewer sets, and targets are about 10% lighter. Recovery is part of the plan.' : esc(p.notes || 'Your AI routines below switch to next week\'s set on Monday.')}</p>
    <button class="text-btn" data-act="plan">Rebuild this month</button></div>`;
}

function activeHtml() {
  const a = db.active, u = db.settings.units;
  const doneVol = volume(a.items.map(it => ({ timed: timed(it), sets: it.sets.filter(s => s.done) })));
  return `<div class="head row-head">
    <div><h1>${esc(a.name)}</h1><p class="count"><span id="elapsed"></span> · ${num(doneVol)} ${u}</p></div>
    <button class="pill" data-act="finish">Finish</button></div>
  <div class="pad">
    ${a.items.map((it, i) => `<section class="ex${it.ss || a.items[i - 1]?.ss ? ' ss' : ''}">
      <div class="ex-head"><button class="ex-name" data-act="info" data-i="${i}">${esc(name(it.exId))}</button>
        <button class="iconbtn" data-act="menu" data-i="${i}" aria-label="Exercise options">${icon('dots')}</button></div>
      <div class="ex-sub">${targetHtml(it)}
        ${lib[it.exId]?.equipment === 'barbell' ? `<button class="mini-btn" data-act="plates" data-i="${i}">Plates</button>` : ''}
        <label class="mini"><span class="visually-hidden">Rest timer</span><select data-rest="${i}">${restOptions(it.rest)}</select></label></div>
      <table class="sets"><thead><tr><th>Set</th><th>Previous</th><th>${u}</th><th>${timed(it) ? 'Secs' : 'Reps'}</th><th><span class="visually-hidden">Done</span></th></tr></thead><tbody>
      ${it.sets.map((s, j) => { const k = workIdx(it, j), p = s.wu ? null : prevSet(it, k), T = timed(it); return `<tr class="${s.done ? 'done' : ''}${s.wu ? ' wu' : ''}">
        <td>${s.wu ? '<abbr title="Warm-up">W</abbr>' : k + 1}</td><td class="prev">${!p ? '–' : T ? `${+p.w ? num(p.w) + '×' : ''}${secs(+p.r)}` : `${num(p.w)}×${p.r}`}</td>
        <td><input inputmode="decimal" data-i="${i}" data-j="${j}" data-f="w" value="${esc(s.w)}" placeholder="${s.wu ? '' : hint(it, workIdx(it, j)) ? num(hint(it, workIdx(it, j)).w) : ''}" aria-label="Set ${j + 1} weight"></td>
        <td${T ? ' class="timecell"' : ''}><input inputmode="numeric" data-i="${i}" data-j="${j}" data-f="r" value="${esc(s.r)}" placeholder="${s.wu ? '' : hint(it, workIdx(it, j))?.r ?? firstR(it)}" aria-label="Set ${j + 1} ${T ? 'seconds' : 'reps'}">${T && !s.done ? `<button class="hold-btn" data-act="hold" data-i="${i}" data-j="${j}" aria-label="Start the hold timer for set ${j + 1}">▶</button>` : ''}</td>
        <td><button class="check" data-act="check" data-i="${i}" data-j="${j}" aria-pressed="${!!s.done}" aria-label="Set ${j + 1} done">${icon('check')}</button></td>
      </tr>`; }).join('')}
      </tbody></table>
      <button class="text-btn" data-act="addset" data-i="${i}">+ Add Set</button>
    </section>${i < a.items.length - 1 ? linkBtn(it, i) : ''}`).join('')}
    <button class="pill wide" data-act="add">Add Exercise</button>
    <button class="remove" data-act="discard">Discard Workout</button>
  </div>`;
}

function editorHtml() {
  const r = editing;
  return `<div class="head row-head"><button class="text-btn" data-act="cancel">Cancel</button><button class="pill" data-act="save">Save</button></div>
  <div class="pad">
    <input class="title-input" data-name value="${esc(r.name)}" placeholder="Routine name" aria-label="Routine name">
    ${r.items.map((it, i) => `<section class="ex${it.ss || r.items[i - 1]?.ss ? ' ss' : ''}">
      <div class="ex-head"><b class="ex-name">${esc(name(it.exId))}</b>
        <button class="iconbtn" data-act="menu" data-i="${i}" aria-label="Exercise options">${icon('dots')}</button></div>
      <div class="fields">
        <label>Sets<input inputmode="numeric" data-rf="sets" data-i="${i}" value="${esc(it.sets)}"></label>
        <label>${timed(it) ? 'Secs' : 'Reps'}<span class="range"><input inputmode="numeric" data-rf="repMin" data-i="${i}" value="${esc(it.repMin)}" aria-label="Fewest reps">–<input inputmode="numeric" data-rf="repMax" data-i="${i}" value="${esc(it.repMax)}" aria-label="Most reps"></span></label>
        <label>Rest<select data-rf="rest" data-i="${i}">${restOptions(it.rest)}</select></label>
      </div>
    </section>${i < r.items.length - 1 ? linkBtn(it, i) : ''}`).join('')}
    <button class="pill wide" data-act="add">Add Exercise</button>
    ${r.id ? '<button class="remove" data-act="delroutine">Delete Routine</button>' : ''}
  </div>`;
}

const linkBtn = (it, i) => `<button class="link${it.ss ? ' on' : ''}" data-act="ss" data-i="${i}" aria-pressed="${!!it.ss}">${icon('link')}${it.ss ? 'Superset' : 'Superset with next'}</button>`;

// Last session's set at the same position, or its last set when today has more sets.
function prevSet(it, j) { const p = lastSets(it.exId); return p[j] || p.at(-1); }

// Rep range, or seconds for timed items (a timed item's own range only counts once it's marked timed).
const range = it => timed(it) ? (it.timed && it.repMin ? it : TIME_RANGE) : it.repMin ? it : GOALS[db.profile?.goal] || DEFAULT_RANGE;
// Reps (or seconds) to suggest with no history: the top of a rep range, the bottom of a hold range.
const firstR = it => timed(it) ? range(it).repMin : range(it).repMax;
const target = it => timed(it) ? nextHold(sessions(it.exId).filter(s => !s.deload).map(s => s.sets), range(it)) : targetLift(it);
const targetLift = it => {
  const t = liftTarget(it), ex = lib[it.exId];
  if (!it.deload || !t || !(t.w > 0) || !ex) return t;
  const round = roundFor(ex), bar = ex.equipment === 'barbell' ? kit().bar : 0;
  const w = bar ? Math.max(bar, bar + Math.floor((t.w * 0.9 - bar) / round) * round) : Math.max(round, Math.floor(t.w * 0.9 / round) * round);
  return { ...t, w, kind: 'deload' };
};
const liftTarget = it => { const ex = lib[it.exId], st = stepFor(ex, db.settings.units); return nextTarget(sessions(it.exId).filter(s => !s.deload).map(s => s.sets), { ...range(it), ...st, step: Math.max(st.step, ex ? roundFor(ex) : 0) }); };
// A first-time exercise gets a starting guess from bodyweight, sex and experience (needs About You filled in).
const guess = it => {
  const ex = lib[it.exId];
  if (!ex || timed(it) || lastSets(it.exId).length) return null;
  const w = startGuess(ex, { bodyweight: bodyweight(), sex: db.body.sex, level: db.profile?.level, round: roundFor(ex), bar: kit().bar });
  return w ? { w, r: firstR(it), kind: 'guess' } : null;
};
// What an empty box means: today's target, else last time's set, else the starting guess.
const hint = (it, j) => target(it) || prevSet(it, j) || guess(it);

function targetHtml(it) {
  const t = target(it) || guess(it), u = db.settings.units, { repMin, repMax } = range(it);
  const text = timed(it) ? (t ? `Target: ${+t.w ? `${num(t.w)} ${u} × ` : ''}${secs(t.r)}` : `${repMin}–${repMax} s hold`)
    : !t ? `${repMin}–${repMax} reps`
    : t.kind === 'up' ? `Go up: ${num(t.w)} ${u} × ${t.r}`
    : t.kind === 'deload' ? `Deload: ${num(t.w)} ${u} × ${t.r}`
    : t.kind === 'reps' ? `Target: ${t.r} reps`
    : t.kind === 'guess' ? `Starting guess: ${num(t.w)} ${u}`
    : `Target: ${num(t.w)} ${u} × ${t.r}`;
  return `<span class="target ${t?.kind || ''}">${text}</span>${t ? `<span>${repMin}–${repMax}${timed(it) ? ' s' : ''}</span>` : ''}`;
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const i = +b.dataset.i, a = db.active, t = editing || a;
  switch (b.dataset.act) {
    case 'empty': start({ name: 'Workout', items: [] }); break;
    case 'start': start(db.routines.find(r => r.id === b.dataset.id)); break;
    case 'new': editing = { id: '', name: '', items: [] }; break;
    case 'edit': editing = structuredClone(db.routines.find(r => r.id === b.dataset.id)); break;
    case 'cancel': editing = null; break;
    case 'save': saveRoutine(); break;
    case 'delroutine':
      if (!confirm(`Delete the routine "${editing.name}"? Past workouts stay in History.`)) return;
      db.routines = db.routines.filter(r => r.id !== editing.id); save('routines'); editing = null; break;
    case 'add': return pick(ex => addExercise(ex.id));
    case 'plan': return buildPlan(render);
    case 'airoutine': return buildRoutine(render);
    case 'info': return info(a.items[i].exId);
    case 'menu': return menu(i);
    case 'plates': return showPlates(a.items[i]);
    case 'ss': t.items[i].ss = !t.items[i].ss; break;
    case 'addset': a.items[i].sets.push({ w: '', r: '' }); break;
    case 'check': if (!check(i, +b.dataset.j)) return; break;
    case 'hold': startHold(i, +b.dataset.j); break;
    case 'finish': return finish();
    case 'discard':
      if (!confirm('Discard this workout? None of its sets will be saved.')) return;
      db.active = null; keepAwake(); break;
  }
  save('active');
  syncRestNote();
  render();
}

function onInput(ev) {
  const el = ev.target, d = el.dataset, i = +d.i;
  if (d.f) db.active.items[i].sets[+d.j][d.f] = el.value;
  else if (d.rest) db.active.items[+d.rest].rest = +el.value;
  else if (d.rf) editing.items[i][d.rf] = d.rf === 'rest' ? +el.value : el.value;
  else if ('name' in d) editing.name = el.value;
  if (db.active && !editing) save('active');
}

function start(r) {
  db.active = {
    id: uid(), name: r.name, routineId: r.id, start: Date.now(),
    items: r.items.map(it => ({ exId: it.exId, rest: it.rest, ss: it.ss, timed: it.timed, deload: it.deload, repMin: it.repMin, repMax: it.repMax, sets: blankSets(it.sets) })),
  };
  keepAwake();
}

function addExercise(exId) {
  const T = isTimed(lib[exId]), r = T ? TIME_RANGE : GOALS[db.profile?.goal] || DEFAULT_RANGE;
  if (editing) editing.items.push({ exId, sets: 3, repMin: r.repMin, repMax: r.repMax, rest: 90, timed: T });
  else { db.active.items.push({ exId, rest: 90, timed: T, sets: blankSets(Math.max(1, lastSets(exId).length)) }); save('active'); }
}

function saveRoutine() {
  const int = (v, d, max = 100) => Math.max(1, Math.min(max, parseInt(v) || d));
  for (const it of editing.items) {
    const d = range(it), max = timed(it) ? 3600 : 100;
    it.sets = int(it.sets, 3); it.repMin = int(it.repMin, d.repMin, max); it.repMax = int(it.repMax, d.repMax, max);
    if (it.repMax < it.repMin) [it.repMin, it.repMax] = [it.repMax, it.repMin];
  }
  editing.name = editing.name.trim() || 'Routine';
  if (editing.id) db.routines = db.routines.map(r => r.id === editing.id ? editing : r);
  else db.routines.push({ ...editing, id: uid() });
  save('routines');
  editing = null;
}

export function routineFrom(w) {
  db.routines.push({
    id: uid(), name: w.name === 'Workout' ? `Workout ${day(w.start)}` : w.name,
    items: w.items.map(it => ({ exId: it.exId, sets: it.sets.filter(s => !s.wu).length, repMin: it.repMin || 8, repMax: it.repMax || 12, rest: it.rest ?? 90, ss: it.ss, timed: it.timed })),
  });
  save('routines');
}

function menu(i) {
  const t = editing || db.active, it = t.items[i];
  const body = sheet(`<h2>${esc(name(it.exId))}</h2><div class="group menu-list">
    ${i > 0 ? '<button data-m="up">Move Up</button>' : ''}
    ${!editing && WEIGHTED.includes(lib[it.exId]?.equipment) && !timed(it) ? '<button data-m="warm">Add Warm-up Sets</button>' : ''}
    <button data-m="timed">${timed(it) ? 'Track by Reps' : 'Track by Time'}</button>
    ${!editing && it.sets.length > 1 ? '<button data-m="pop">Remove Last Set</button>' : ''}
    <button data-m="swap">Replace Exercise</button>
    <button data-m="del" class="danger">Remove Exercise</button></div>`);
  body.onclick = ev => {
    const m = ev.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    closeSheet();
    if (m === 'swap') return pick(ex => { it.exId = ex.id; if (!editing) save('active'); }, { muscle: lib[it.exId]?.primaryMuscles[0] });
    if (m === 'up') t.items.splice(i - 1, 0, ...t.items.splice(i, 1));
    if (m === 'pop') it.sets.pop();
    if (m === 'warm') addWarmups(it);
    if (m === 'timed') {
      it.timed = !timed(it);
      const r = it.timed ? TIME_RANGE : GOALS[db.profile?.goal] || DEFAULT_RANGE;
      if (editing) Object.assign(it, { repMin: r.repMin, repMax: r.repMax });
      else { delete it.repMin; delete it.repMax; }
    }
    if (m === 'del') t.items.splice(i, 1);
    if (!editing) save('active');
    render();
  };
}

// Ramp-up sets for today's working weight (typed, else the target/last time/guess), replacing any already added.
function addWarmups(it) {
  const ex = lib[it.exId], first = it.sets.find(s => !s.wu);
  const work = first && first.w !== '' ? parse(first.w) : +(hint(it, 0)?.w || 0);
  if (!(work > 0)) return alert('Enter the working weight for this exercise first, then add warm-ups.');
  const sets = warmups(work, { bar: ex.equipment === 'barbell' ? kit().bar : 0, round: roundFor(ex) });
  if (!sets.length) return alert('This weight is light enough to skip warm-ups.');
  it.sets = [...sets.map(s => ({ ...s, wu: true })), ...it.sets.filter(s => !s.wu)];
}

// Plates per side for each set of a barbell exercise: typed weight, else the placeholder.
function showPlates(it) {
  const { bar, have } = kit(), u = db.settings.units;
  const rows = it.sets.map((s, j) => {
    const w = s.w !== '' ? parse(s.w) : s.wu ? 0 : +(hint(it, workIdx(it, j))?.w || 0);
    if (!(w > 0)) return '';
    const p = plates(w, bar, have);
    const how = p.under ? `under the ${num(bar)} ${u} bar` : p.side.length ? p.side.map(num).join(' + ') : 'empty bar';
    return `<li><span>${s.wu ? 'W' : workIdx(it, j) + 1}</span><b>${num(w)} ${u}</b><span>${how}${p.left ? ` <small class="pr">(+${num(p.left * 2)} ${u} short)</small>` : ''}</span></li>`;
  }).join('');
  sheet(`<h2 id="sheetTitle">Plates per side</h2><p class="muted">${num(bar)} ${u} bar. Change the bar and plates you have in Settings.</p>
    <ol class="group plate-list">${rows || '<li>Enter a weight first.</li>'}</ol>`);
}

// Hold timer: counts down the set's seconds (typed, else the target), then logs the set and starts the rest.
// Done stops early and logs the time actually held.
function startHold(i, j) {
  const it = db.active.items[i], s = it.sets[j];
  const n = s.r !== '' ? parseInt(s.r) : +(hint(it, workIdx(it, j))?.r ?? firstR(it));
  if (!(n > 0)) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume();
  db.active.restEnd = 0;
  db.active.hold = { i, j, start: Date.now(), end: Date.now() + n * 1000 };
}

function completeHold(n) {
  const a = db.active, { i, j } = a.hold, it = a.items[i], s = it?.sets[j];
  a.hold = null;
  if (s) {
    const p = hint(it, workIdx(it, j));
    Object.assign(s, { w: s.w !== '' ? parse(s.w) || 0 : +(p?.w || 0), r: n, done: true });
    if (!it.ss && it.rest) a.restEnd = Date.now() + it.rest * 1000;
  }
  save('active');
  syncRestNote();
  render();
}

// Fills blanks from the placeholders (today's target or last time's numbers), so hitting the target is one tap.
function check(i, j) {
  const it = db.active.items[i], s = it.sets[j];
  if (s.done) return !(s.done = false);
  const p = s.wu ? null : hint(it, workIdx(it, j));
  const noWeight = timed(it) || ['body only', 'none'].includes(lib[it.exId]?.equipment);
  const w = s.w !== '' ? parse(s.w) : p ? +p.w : noWeight ? 0 : NaN;
  const r = s.r === '' ? +(p?.r ?? firstR(it)) : parseInt(s.r);
  if (!(r > 0) || isNaN(w)) {
    root().querySelector(`[data-i="${i}"][data-j="${j}"][data-f="${isNaN(w) ? 'w' : 'r'}"]`)?.focus();
    return false;
  }
  Object.assign(s, { w, r, done: true });
  audio ||= new (window.AudioContext || window.webkitAudioContext)(); // must be created on a tap for iOS to allow sound
  audio.resume();
  if (!it.ss && it.rest && !s.wu) db.active.restEnd = Date.now() + it.rest * 1000;
  return true;
}

function finish() {
  const a = db.active;
  const items = a.items
    .map(it => ({ exId: it.exId, rest: it.rest, ss: it.ss, ...(timed(it) && { timed: true }), ...(it.deload && { deload: true }), repMin: it.repMin, repMax: it.repMax, sets: it.sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r, ...(s.wu && { wu: true }) })) }))
    .filter(it => it.sets.length);
  if (!items.length) {
    if (!confirm('No sets are checked off. Discard this workout?')) return;
    db.active = null; save('active'); keepAwake(); return render();
  }
  // A PR is a set whose estimated 1RM beats everything logged before it (needs earlier history to count);
  // for timed items, the longest hold.
  for (const it of items) {
    const score = it.timed ? s => +s.r : s => e1rm(s.w, s.r), rec = records(it.exId);
    let best = it.timed ? rec?.reps : rec?.best;
    if (best) for (const s of it.sets) if (!s.wu && score(s) > best) { s.pr = true; best = score(s); }
  }
  const w = { id: a.id, name: a.name, routineId: a.routineId, start: a.start, end: Date.now(), items };
  db.workouts.unshift(w);
  db.active = null;
  save('workouts', 'active');
  syncRestNote();
  keepAwake();
  render();
  onFinish(w);
}

function tick() {
  const a = db.active, el = $('#elapsed');
  if (el && a) el.textContent = clock(Date.now() - a.start);
  $('#hold').hidden = !a?.hold;
  if (a?.hold) {
    const left = a.hold.end - Date.now();
    if (left > 0) $('#holdLeft').textContent = clock(left);
    else { if (left > -5000) alarm(); return completeHold(Math.round((a.hold.end - a.hold.start) / 1000)); }
  }
  const left = a?.restEnd ? a.restEnd - Date.now() : 0;
  $('#rest').hidden = !(left > 0);
  if (left > 0) $('#restLeft').textContent = clock(left);
  else if (a?.restEnd) {
    if (left > -5000) alarm(); // not when reopening the app long after the timer ran out
    a.restEnd = 0;
    save('active');
  }
}

// ponytail: iPhone mutes Web Audio on silent mode and has no vibration; Android gets a native notification in phase 5.
function alarm() {
  navigator.vibrate?.([200, 100, 200]);
  if (!audio) return;
  for (const t of [0, 0.3]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.3;
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.18);
  }
}

// Screen stays on during a workout; the lock drops when the app is hidden, so take it again on return.
async function keepAwake() {
  if (db.active && !lock && document.visibilityState === 'visible' && navigator.wakeLock) {
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch {}
  } else if (!db.active && lock) { lock.release(); lock = null; }
}
