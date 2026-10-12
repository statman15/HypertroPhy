// The Workout tab: routines when idle, the live logger during a workout, and the routine editor.
import { $, esc, num, day, clock, icon, restOptions, sheet, closeSheet } from './ui.js';
import { db, save, uid, lastSets, sessions, records, e1rm, volume } from './store.js';
import { nextTarget, stepFor, DEFAULT_RANGE, GOALS } from './progression.js';

let lib, pick, onFinish, info, buildPlan, editing = null, lock = null, audio = null;
const root = () => $('#workout');
const name = id => lib[id]?.name || id;
const blankSets = n => Array.from({ length: n }, () => ({ w: '', r: '' }));
const parse = v => parseFloat(String(v).replace(',', '.'));

export function init(byId, picker, finished, showInfo, planBuilder) {
  [lib, pick, onFinish, info, buildPlan] = [byId, picker, finished, showInfo, planBuilder];
  root().addEventListener('click', onClick);
  root().addEventListener('input', onInput);
  $('#rest').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || !db.active) return;
    db.active.restEnd = b.dataset.adj ? db.active.restEnd + b.dataset.adj * 1000 : 0;
    save('active');
    tick();
  });
  document.addEventListener('visibilitychange', keepAwake);
  setInterval(tick, 250);
  keepAwake();
}

export function render() {
  root().innerHTML = editing ? editorHtml() : db.active ? activeHtml() : idleHtml();
  tick();
}

function idleHtml() {
  return `<div class="head"><h1>Workout</h1></div>
  <div class="pad">
    <button class="pill wide" data-act="empty">Start Empty Workout</button>
    <button class="pill wide quiet" data-act="plan">${icon('sparkle')}Build a Plan with AI</button>
    <div class="sec"><h2>Routines</h2><button class="text-btn" data-act="new">New Routine</button></div>
    ${db.routines.length ? db.routines.map(r => `<div class="card group">
      <div class="card-top"><b>${esc(r.name)}${r.ai ? ' <small class="pr">AI plan</small>' : ''}</b><button class="text-btn" data-act="edit" data-id="${r.id}">Edit</button></div>
      <p class="a">${esc(r.items.map(it => name(it.exId)).join(', ') || 'No exercises yet')}</p>
      <button class="pill wide" data-act="start" data-id="${r.id}">Start Routine</button>
    </div>`).join('') : '<p class="muted">No routines yet. Make one here, or finish a workout and save it as a routine from History.</p>'}
  </div>`;
}

function activeHtml() {
  const a = db.active, u = db.settings.units;
  const doneVol = volume(a.items.map(it => ({ sets: it.sets.filter(s => s.done) })));
  return `<div class="head row-head">
    <div><h1>${esc(a.name)}</h1><p class="count"><span id="elapsed"></span> · ${num(doneVol)} ${u}</p></div>
    <button class="pill" data-act="finish">Finish</button></div>
  <div class="pad">
    ${a.items.map((it, i) => `<section class="ex${it.ss || a.items[i - 1]?.ss ? ' ss' : ''}">
      <div class="ex-head"><button class="ex-name" data-act="info" data-i="${i}">${esc(name(it.exId))}</button>
        <button class="iconbtn" data-act="menu" data-i="${i}" aria-label="Exercise options">${icon('dots')}</button></div>
      <div class="ex-sub">${targetHtml(it)}
        <label class="mini"><span class="visually-hidden">Rest timer</span><select data-rest="${i}">${restOptions(it.rest)}</select></label></div>
      <table class="sets"><thead><tr><th>Set</th><th>Previous</th><th>${u}</th><th>Reps</th><th><span class="visually-hidden">Done</span></th></tr></thead><tbody>
      ${it.sets.map((s, j) => { const p = prevSet(it, j); return `<tr${s.done ? ' class="done"' : ''}>
        <td>${j + 1}</td><td class="prev">${p ? `${num(p.w)}×${p.r}` : '–'}</td>
        <td><input inputmode="decimal" data-i="${i}" data-j="${j}" data-f="w" value="${esc(s.w)}" placeholder="${hint(it, j) ? num(hint(it, j).w) : ''}" aria-label="Set ${j + 1} weight"></td>
        <td><input inputmode="numeric" data-i="${i}" data-j="${j}" data-f="r" value="${esc(s.r)}" placeholder="${hint(it, j)?.r ?? range(it).repMax}" aria-label="Set ${j + 1} reps"></td>
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
        <label>Reps<span class="range"><input inputmode="numeric" data-rf="repMin" data-i="${i}" value="${esc(it.repMin)}" aria-label="Fewest reps">–<input inputmode="numeric" data-rf="repMax" data-i="${i}" value="${esc(it.repMax)}" aria-label="Most reps"></span></label>
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

const range = it => it.repMin ? it : GOALS[db.profile?.goal] || DEFAULT_RANGE;
const target = it => nextTarget(sessions(it.exId).map(s => s.sets), { ...range(it), ...stepFor(lib[it.exId], db.settings.units) });
// What an empty box means: today's target, else last time's set.
const hint = (it, j) => target(it) || prevSet(it, j);

function targetHtml(it) {
  const t = target(it), u = db.settings.units, { repMin, repMax } = range(it);
  const text = !t ? `${repMin}–${repMax} reps`
    : t.kind === 'up' ? `Go up: ${num(t.w)} ${u} × ${t.r}`
    : t.kind === 'deload' ? `Deload: ${num(t.w)} ${u} × ${t.r}`
    : t.kind === 'reps' ? `Target: ${t.r} reps`
    : `Target: ${num(t.w)} ${u} × ${t.r}`;
  return `<span class="target ${t?.kind || ''}">${text}</span>${t ? `<span>${repMin}–${repMax}</span>` : ''}`;
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
    case 'info': return info(a.items[i].exId);
    case 'menu': return menu(i);
    case 'ss': t.items[i].ss = !t.items[i].ss; break;
    case 'addset': a.items[i].sets.push({ w: '', r: '' }); break;
    case 'check': if (!check(i, +b.dataset.j)) return; break;
    case 'finish': return finish();
    case 'discard':
      if (!confirm('Discard this workout? None of its sets will be saved.')) return;
      db.active = null; keepAwake(); break;
  }
  save('active');
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
    items: r.items.map(it => ({ exId: it.exId, rest: it.rest, ss: it.ss, repMin: it.repMin, repMax: it.repMax, sets: blankSets(it.sets) })),
  };
  keepAwake();
}

function addExercise(exId) {
  if (editing) editing.items.push({ exId, sets: 3, repMin: 8, repMax: 12, rest: 90 });
  else { db.active.items.push({ exId, rest: 90, sets: blankSets(Math.max(1, lastSets(exId).length)) }); save('active'); }
}

function saveRoutine() {
  const int = (v, d) => Math.max(1, Math.min(100, parseInt(v) || d));
  for (const it of editing.items) {
    it.sets = int(it.sets, 3); it.repMin = int(it.repMin, 8); it.repMax = int(it.repMax, 12);
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
    items: w.items.map(it => ({ exId: it.exId, sets: it.sets.length, repMin: it.repMin || 8, repMax: it.repMax || 12, rest: it.rest ?? 90, ss: it.ss })),
  });
  save('routines');
}

function menu(i) {
  const t = editing || db.active, it = t.items[i];
  const body = sheet(`<h2>${esc(name(it.exId))}</h2><div class="group menu-list">
    ${i > 0 ? '<button data-m="up">Move Up</button>' : ''}
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
    if (m === 'del') t.items.splice(i, 1);
    if (!editing) save('active');
    render();
  };
}

// Fills blanks from the placeholders (today's target or last time's numbers), so hitting the target is one tap.
function check(i, j) {
  const it = db.active.items[i], s = it.sets[j];
  if (s.done) return !(s.done = false);
  const p = hint(it, j);
  const bodyweight = ['body only', 'none'].includes(lib[it.exId]?.equipment);
  const w = s.w !== '' ? parse(s.w) : p ? +p.w : bodyweight ? 0 : NaN;
  const r = s.r === '' ? +(p?.r ?? range(it).repMax) : parseInt(s.r);
  if (!(r > 0) || isNaN(w)) {
    root().querySelector(`[data-i="${i}"][data-j="${j}"][data-f="${isNaN(w) ? 'w' : 'r'}"]`)?.focus();
    return false;
  }
  Object.assign(s, { w, r, done: true });
  audio ||= new (window.AudioContext || window.webkitAudioContext)(); // must be created on a tap for iOS to allow sound
  audio.resume();
  if (!it.ss && it.rest) db.active.restEnd = Date.now() + it.rest * 1000;
  return true;
}

function finish() {
  const a = db.active;
  const items = a.items
    .map(it => ({ exId: it.exId, rest: it.rest, ss: it.ss, repMin: it.repMin, repMax: it.repMax, sets: it.sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r })) }))
    .filter(it => it.sets.length);
  if (!items.length) {
    if (!confirm('No sets are checked off. Discard this workout?')) return;
    db.active = null; save('active'); keepAwake(); return render();
  }
  // A PR is a set whose estimated 1RM beats everything logged before it (needs earlier history to count).
  for (const it of items) {
    let best = records(it.exId)?.best;
    if (best) for (const s of it.sets) if (e1rm(s.w, s.r) > best) { s.pr = true; best = e1rm(s.w, s.r); }
  }
  const w = { id: a.id, name: a.name, routineId: a.routineId, start: a.start, end: Date.now(), items };
  db.workouts.unshift(w);
  db.active = null;
  save('workouts', 'active');
  keepAwake();
  render();
  onFinish(w);
}

function tick() {
  const a = db.active, el = $('#elapsed');
  if (el && a) el.textContent = clock(Date.now() - a.start);
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
