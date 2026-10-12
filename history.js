// The History tab, plus the per-exercise records shown in the library's detail sheet.
import { $, esc, num, day, icon, sheet, closeSheet } from './ui.js';
import { db, save, volume, records, sessions, e1rm } from './store.js';
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
    ${chartHtml(exId)}
    <h3>Recent Sessions</h3><dl class="facts group">${sessions(exId).slice(0, 5).map(s =>
      `<div><dt>${day(s.date)}</dt><dd>${s.sets.map(x => `${num(x.w)}×${x.r}`).join(', ')}</dd></div>`).join('')}</dl>`;
}

// Best estimated 1RM per session, oldest → newest. Evenly spaced by session, not by date, so a gap week doesn't squash the line.
function chartHtml(exId) {
  const u = db.settings.units;
  const pts = sessions(exId).slice(0, 30).reverse().map(s => {
    const best = s.sets.reduce((b, x) => e1rm(x.w, x.r) > e1rm(b.w, b.r) ? x : b);
    return { date: s.date, v: e1rm(best.w, best.r), set: best };
  }).filter(p => p.v > 0);
  if (pts.length < 2) return '';
  const W = 343, H = 170, L = 40, R = 12, T = 12, B = 26;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.15 || hi * 0.05;
  const x = i => L + i * (W - L - R) / (pts.length - 1);
  const y = v => T + (hi + pad - v) / (hi - lo + 2 * pad) * (H - T - B);
  const tip = p => `${day(p.date)}: ${num(p.v)} ${u} (${num(p.set.w)}×${p.set.r})`;
  const ticks = [...new Set([lo, (lo + hi) / 2, hi].map(Math.round))];
  const half = (W - L - R) / (pts.length - 1) / 2;
  return `<figure class="chart group">
    <figcaption>Estimated 1-rep max <span id="chartTip">${esc(tip(pts.at(-1)))}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated 1-rep max over ${pts.length} sessions, from ${num(vs[0])} to ${num(vs.at(-1))} ${u}">
      ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t)}" dy=".32em" text-anchor="end">${t}</text>`).join('')}
      <polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
      ${pts.map((p, i) => `<circle class="dot${i === pts.length - 1 ? ' on' : ''}" cx="${x(i)}" cy="${y(p.v)}" r="4"/>`).join('')}
      <text class="tick" x="${L}" y="${H - 6}">${day(pts[0].date)}</text>
      <text class="tick" x="${W - R}" y="${H - 6}" text-anchor="end">${day(pts.at(-1).date)}</text>
      ${pts.map((p, i) => `<rect class="hit" x="${x(i) - half}" y="0" width="${half * 2}" height="${H - B}" data-k="${i}" data-tip="${esc(tip(p))}"/>`).join('')}
    </svg></figure>`;
}

// Hover or tap a column to read that session; the dot under it lights up.
export function bindChart(root) {
  const svg = root.querySelector('.chart svg');
  if (!svg) return;
  const pick = ev => {
    const k = ev.target.dataset?.k;
    if (k == null) return;
    svg.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === +k));
    root.querySelector('#chartTip').textContent = ev.target.dataset.tip;
  };
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
}
