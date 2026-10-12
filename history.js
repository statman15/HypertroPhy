// The History tab, plus the per-exercise records shown in the library's detail sheet.
import { $, esc, num, day, icon, sheet, closeSheet } from './ui.js';
import { db, save, volume, records, sessions } from './store.js';
import { routineFrom } from './workout.js';

let lib;
const name = id => lib[id]?.name || id;
const mins = w => `${Math.max(1, Math.round((w.end - w.start) / 60000))} min`;
const prs = w => w.items.reduce((n, it) => n + it.sets.filter(s => s.pr).length, 0);

export function init(byId) {
  lib = byId;
  $('#history').addEventListener('click', ev => {
    const b = ev.target.closest('[data-id]');
    if (b) detail(db.workouts.find(w => w.id === b.dataset.id));
  });
}

export function render() {
  const u = db.settings.units, n = db.workouts.length;
  $('#history').innerHTML = `<div class="head"><h1>History</h1><p class="count">${n} workout${n === 1 ? '' : 's'}</p></div>
  ${n ? `<ul class="list">${db.workouts.map(w => `<li><button class="hrow" data-id="${w.id}">
    <span class="t">${esc(w.name)}</span>
    <span class="a">${day(w.start)} · ${mins(w)} · ${num(volume(w.items))} ${u}${prs(w) ? ` · <span class="pr">${icon('trophy')}${prs(w)}</span>` : ''}</span>
    <span class="a">${esc(w.items.map(it => `${it.sets.length}× ${name(it.exId)}`).join(', '))}</span>
  </button></li>`).join('')}</ul>` : '<div class="empty"><h2>No Workouts Yet</h2><p>Finished workouts show up here.</p></div>'}`;
}

export function detail(w) {
  const u = db.settings.units;
  const body = sheet(`<h2 id="sheetTitle">${esc(w.name)}</h2>
    <p class="muted">${day(w.start)} · ${mins(w)} · ${num(volume(w.items))} ${u}</p>
    ${w.items.map(it => `<h3>${esc(name(it.exId))}</h3><ol class="group setlist">${it.sets.map(s =>
      `<li><span>${num(s.w)} ${u} × ${s.r}</span>${s.pr ? `<span class="pr">${icon('trophy')}PR</span>` : ''}</li>`).join('')}</ol>`).join('')}
    <div class="group menu-list gap">
      <button data-m="routine">Save as Routine</button>
      <button data-m="del" class="danger">Delete Workout</button>
    </div>`);
  body.onclick = ev => {
    const m = ev.target.closest('[data-m]')?.dataset.m;
    if (m === 'routine') { routineFrom(w); ev.target.textContent = 'Saved to Routines'; ev.target.disabled = true; }
    if (m === 'del' && confirm('Delete this workout? This can’t be undone.')) {
      db.workouts = db.workouts.filter(x => x !== w);
      save('workouts');
      closeSheet();
      render();
    }
  };
}

export function exerciseHistory(exId) {
  const rec = records(exId), u = db.settings.units;
  if (!rec) return '';
  return `<h3>Your Records</h3><dl class="facts group">
    <div><dt>Heaviest</dt><dd>${num(rec.heaviest)} ${u}</dd></div>
    <div><dt>Best est. 1-rep max</dt><dd>${num(rec.best)} ${u}</dd></div>
    <div><dt>Most reps</dt><dd>${rec.reps}</dd></div></dl>
    <h3>Recent Sessions</h3><dl class="facts group">${sessions(exId).slice(0, 5).map(s =>
      `<div><dt>${day(s.date)}</dt><dd>${s.sets.map(x => `${num(x.w)}×${x.r}`).join(', ')}</dd></div>`).join('')}</dl>`;
}
