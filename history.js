// The History tab (body weight on top, then workouts), plus the per-exercise records shown in the library's detail sheet.
import { $, esc, num, day, icon, sheet, closeSheet } from './ui.js';
import { db, save, volume, records, sessions, e1rm, working, kcal, bodyweight } from './store.js';
import { routineFrom } from './workout.js';

let lib;
const name = id => lib[id]?.name || id;
const mins = w => `${Math.max(1, Math.round((w.end - w.start) / 60000))} min`;
const prs = w => w.items.reduce((n, it) => n + it.sets.filter(s => s.pr).length, 0);
const cal = w => kcal(w) ? ` · ~${kcal(w)} kcal` : '';

// Android app only: weigh-ins can come from Health Connect (scales and fitness apps write there). Read-only.
const Health = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins.Health;

export function init(byId) {
  lib = byId;
  const root = $('#history');
  root.addEventListener('click', ev => {
    if (ev.target.closest('[data-act=weight]')) return weightSheet();
    const b = ev.target.closest('[data-id]');
    if (b) detail(db.workouts.find(w => w.id === b.dataset.id));
  });
  // Pull new weigh-ins quietly on open once Health Connect has been allowed.
  if (Health && db.settings.healthConnect) importHealth(true).then(n => n && !root.hidden && render()).catch(() => {});
}

export function render() {
  const u = db.settings.units, n = db.workouts.length, last = db.body.weights.at(-1);
  const root = $('#history');
  root.innerHTML = `<div class="head"><h1>History</h1><p class="count">${n} workout${n === 1 ? '' : 's'}</p></div>
  <div class="pad">
    <div class="card group body-card">
      <div class="card-top"><b>Body weight</b><button class="text-btn" data-act="weight">${last ? 'Log' : 'Add'}</button></div>
      ${last ? `${db.body.weights.length > 1 ? '' : `<p class="a">${num(last.w)} ${u} · ${day(last.t)}</p>`}${lineChart(db.body.weights.slice(-60).map(x => ({ t: x.t, v: +x.w, tip: `${day(x.t)}: ${num(x.w)} ${u}` })), 'Weigh-ins')}`
        : `<p class="a">Log your weight to see a trend, get starting-weight guesses and calorie estimates.${Health ? ' Or import it from Health Connect.' : ''}</p>`}
    </div>
  </div>
  ${n ? `<ul class="list">${db.workouts.map(w => `<li><button class="hrow" data-id="${w.id}">
    <span class="t">${esc(w.name)}</span>
    <span class="a">${day(w.start)} · ${mins(w)} · ${num(volume(w.items))} ${u}${cal(w)}${prs(w) ? ` · <span class="pr">${icon('trophy')}${prs(w)}</span>` : ''}</span>
    <span class="a">${esc(w.items.map(it => `${working(it.sets).length || it.sets.length}× ${name(it.exId)}`).join(', '))}</span>
  </button></li>`).join('')}</ul>` : '<div class="empty"><h2>No Workouts Yet</h2><p>Finished workouts show up here.</p></div>'}`;
  bindChart(root);
}

export function detail(w) {
  const u = db.settings.units;
  const body = sheet(`<h2 id="sheetTitle">${esc(w.name)}</h2>
    <p class="muted">${day(w.start)} · ${mins(w)} · ${num(volume(w.items))} ${u}${cal(w)}</p>
    ${w.items.map(it => `<h3>${esc(name(it.exId))}</h3><ol class="group setlist">${it.sets.map(s =>
      `<li${s.wu ? ' class="wu"' : ''}><span>${num(s.w)} ${u} × ${s.r}</span>${s.pr ? `<span class="pr">${icon('trophy')}PR</span>` : ''}</li>`).join('')}</ol>`).join('')}
    ${kcal(w) ? '<p class="muted">Calories are a rough estimate from your body weight and the workout\'s length.</p>' : ''}
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

// --- Body weight: log by hand, or import from Health Connect in the Android app.
function weightSheet() {
  const u = db.settings.units, today = new Date().toISOString().slice(0, 10);
  const body = sheet(`<h2 id="sheetTitle">Body weight</h2>
    <form class="form">
      <div class="form-2">
        <label>Weight (${u})<input name="w" inputmode="decimal" required placeholder="${bodyweight() ? num(bodyweight()) : ''}" autocomplete="off"></label>
        <label>Date<input name="d" type="date" value="${today}" max="${today}" required></label>
      </div>
      <button class="pill wide" type="submit">Save</button>
    </form>
    ${Health ? '<button class="pill wide quiet" data-hc>Import from Health Connect</button>' : ''}
    <p class="muted" id="weightMsg" role="status"></p>
    ${db.body.weights.length ? `<h3>Recent</h3><ol class="group setlist plain">${db.body.weights.slice(-10).reverse().map(x =>
      `<li><span>${day(x.t)}${x.src === 'hc' ? ' <small class="muted">Health Connect</small>' : ''}</span><b>${num(x.w)} ${u}</b><button class="iconbtn" data-del="${x.t}" aria-label="Delete ${num(x.w)} ${u} on ${day(x.t)}">${icon('x')}</button></li>`).join('')}</ol>` : ''}`);
  body.querySelector('form').onsubmit = ev => {
    ev.preventDefault();
    const w = parseFloat(ev.target.w.value.replace(',', '.'));
    if (!(w > 0 && w < 1500)) return void ($('#weightMsg').textContent = 'Enter your weight as a number.');
    const t = new Date(ev.target.d.value + 'T12:00').getTime();
    addWeights([{ t, w }]);
    closeSheet();
    render();
  };
  body.onclick = async ev => {
    const del = ev.target.closest('[data-del]');
    if (del) { db.body.weights = db.body.weights.filter(x => x.t !== +del.dataset.del); save('body'); render(); return weightSheet(); }
    if (!ev.target.closest('[data-hc]')) return;
    $('#weightMsg').textContent = 'Reading Health Connect…';
    try {
      const n = await importHealth(false);
      $('#weightMsg').textContent = n ? `Imported ${n} weigh-in${n === 1 ? '' : 's'}.` : 'No new weigh-ins in Health Connect.';
      render();
    } catch (e) { $('#weightMsg').textContent = e.message; }
  };
}

// Same-day entries replace each other (one weigh-in per day keeps the trend readable).
function addWeights(list) {
  const key = t => new Date(t).toDateString();
  let added = 0;
  for (const x of list) {
    const i = db.body.weights.findIndex(y => key(y.t) === key(x.t));
    if (i >= 0) { if (x.src === 'hc' && db.body.weights[i].src !== 'hc') continue; db.body.weights[i] = x; }
    else { db.body.weights.push(x); added++; }
  }
  db.body.weights.sort((a, b) => a.t - b.t);
  save('body');
  return added;
}

async function importHealth(quiet) {
  const { available } = await Health.isAvailable();
  if (!available) throw new Error('Health Connect isn\'t available on this phone. On Android 13 or older, install "Health Connect" from the Play Store.');
  if (!quiet || !db.settings.healthConnect) {
    const st = await Health.requestAuthorization({ read: ['weight'], requestHistoryAccess: true });
    if (!st.readAuthorized.includes('weight')) throw new Error('HypertroPhy needs permission to read weight. Allow it in Health Connect, then try again.');
    db.settings.healthConnect = true;
    save('settings');
  }
  const since = Math.max(...db.body.weights.filter(x => x.src === 'hc').map(x => x.t), Date.now() - 365 * 864e5);
  const { samples } = await Health.readSamples({ dataType: 'weight', startDate: new Date(since).toISOString(), endDate: new Date().toISOString(), limit: 1000, ascending: true });
  const toUnit = kg => db.settings.units === 'kg' ? Math.round(kg * 10) / 10 : Math.round(kg / 0.45359237 * 10) / 10;
  return addWeights(samples.filter(s => s.value > 0).map(s => ({ t: Date.parse(s.startDate), w: toUnit(s.value), src: 'hc' })));
}

// --- Exercise records for the library sheet.
export function exerciseHistory(exId) {
  const rec = records(exId), u = db.settings.units;
  if (!rec) return '';
  // Best estimated 1RM per session, oldest → newest.
  const pts = sessions(exId).slice(0, 30).reverse().map(s => {
    const best = s.sets.reduce((b, x) => e1rm(x.w, x.r) > e1rm(b.w, b.r) ? x : b);
    return { t: s.date, v: e1rm(best.w, best.r), tip: `${day(s.date)}: ${num(e1rm(best.w, best.r))} ${u} (${num(best.w)}×${best.r})` };
  }).filter(p => p.v > 0);
  return `<h3>Your Records</h3><dl class="facts group">
    <div><dt>Heaviest</dt><dd>${num(rec.heaviest)} ${u}</dd></div>
    <div><dt>Best est. 1-rep max</dt><dd>${num(rec.best)} ${u}</dd></div>
    <div><dt>Most reps</dt><dd>${rec.reps}</dd></div></dl>
    ${lineChart(pts, 'Estimated 1-rep max')}
    <h3>Recent Sessions</h3><dl class="facts group">${sessions(exId).slice(0, 5).map(s =>
      `<div><dt>${day(s.date)}</dt><dd>${s.sets.map(x => `${num(x.w)}×${x.r}`).join(', ')}</dd></div>`).join('')}</dl>`;
}

// One line chart for both uses: points { t, v, tip } oldest → newest, evenly spaced so a gap week doesn't squash the line.
function lineChart(pts, caption) {
  if (pts.length < 2) return '';
  const W = 343, H = 170, L = 40, R = 12, T = 12, B = 26;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.15 || hi * 0.05;
  const x = i => L + i * (W - L - R) / (pts.length - 1);
  const y = v => T + (hi + pad - v) / (hi - lo + 2 * pad) * (H - T - B);
  const ticks = [...new Set([lo, (lo + hi) / 2, hi].map(Math.round))];
  const half = (W - L - R) / (pts.length - 1) / 2;
  return `<figure class="chart group">
    <figcaption>${caption} <span class="chart-tip">${esc(pts.at(-1).tip)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${caption} over ${pts.length} entries, from ${num(vs[0])} to ${num(vs.at(-1))}">
      ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t)}" dy=".32em" text-anchor="end">${t}</text>`).join('')}
      <polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
      ${pts.map((p, i) => `<circle class="dot${i === pts.length - 1 ? ' on' : ''}" cx="${x(i)}" cy="${y(p.v)}" r="4"/>`).join('')}
      <text class="tick" x="${L}" y="${H - 6}">${day(pts[0].t)}</text>
      <text class="tick" x="${W - R}" y="${H - 6}" text-anchor="end">${day(pts.at(-1).t)}</text>
      ${pts.map((p, i) => `<rect class="hit" x="${x(i) - half}" y="0" width="${half * 2}" height="${H - B}" data-k="${i}" data-tip="${esc(p.tip)}"/>`).join('')}
    </svg></figure>`;
}

// Hover or tap a column to read that point; the dot under it lights up.
export function bindChart(root) {
  for (const svg of root.querySelectorAll('.chart svg')) {
    const pick = ev => {
      const k = ev.target.dataset?.k;
      if (k == null) return;
      svg.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === +k));
      svg.closest('figure').querySelector('.chart-tip').textContent = ev.target.dataset.tip;
    };
    svg.addEventListener('pointermove', pick);
    svg.addEventListener('pointerdown', pick);
  }
}
