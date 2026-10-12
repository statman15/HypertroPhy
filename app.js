import { $, esc, sheet } from './ui.js';
import { db, setUnits } from './store.js';
import { load, filter, values, photo, cap } from './exercises.js';
import * as workout from './workout.js';
import * as history from './history.js';

const img = (path, alt = '') => path ? `<img src="${photo(path)}" crossorigin="anonymous" loading="lazy" alt="${alt}">` : '';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

const all = await load();
const byId = Object.fromEntries(all.map(e => [e.id, e]));

// --- Tabs. Picking an exercise for a workout borrows the Exercises tab; leaving it cancels the pick.
let pickCb = null;
const views = { workout: workout.render, history: history.render, exercises: renderLib, settings: renderSettings };

function go(tab) {
  if (tab !== 'exercises') pickCb = null;
  for (const s of document.querySelectorAll('main > [data-tab]')) s.hidden = s.dataset.tab !== tab;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', b.dataset.go === tab);
  views[tab]();
  scrollTo(0, 0);
}
$('#tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-go]'); if (b) go(b.dataset.go); });

function pick(cb, preset = {}) {
  $('#q').value = '';
  $('#muscle').value = preset.muscle || '';
  $('#equip').value = preset.equip || '';
  go('exercises');
  pickCb = cb;
  renderLib();
}
$('#pickCancel').addEventListener('click', () => go('workout'));

// --- Exercises tab
for (const [sel, key] of [[$('#muscle'), 'primaryMuscles'], [$('#equip'), 'equipment']])
  sel.insertAdjacentHTML('beforeend', values(all, key).map(v => `<option value="${esc(v)}">${esc(cap(v))}</option>`).join(''));

function renderLib() {
  const list = filter(all, { q: $('#q').value, muscle: $('#muscle').value, equip: $('#equip').value });
  $('#pickBar').hidden = !pickCb;
  $('#count').textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}`;
  $('#list').innerHTML = list.map(e => `<li><button class="row" data-id="${esc(e.id)}">
    <span class="thumb">${img(e.images[0])}</span>
    <span><span class="t">${esc(e.name)}</span><span class="a">${esc(cap(e.primaryMuscles[0] || ''))} · ${esc(cap(e.equipment))}</span></span>
  </button></li>`).join('');
  $('#empty').hidden = list.length > 0;
  for (const s of [$('#muscle'), $('#equip')]) s.parentElement.classList.toggle('on', !!s.value);
}

function show(e) {
  const facts = [
    ['Primary', e.primaryMuscles], ['Secondary', e.secondaryMuscles], ['Equipment', [e.equipment]],
    ['Level', [e.level]], ['Type', [e.category]], ['Mechanic', [e.mechanic]],
  ].filter(([, v]) => v.length && v[0]);
  sheet(`
    <div class="demo">${e.images.slice(0, 2).map((p, i) => img(p, i ? 'End position' : 'Start position')).join('')}</div>
    <h2 id="sheetTitle">${esc(e.name)}</h2>
    <dl class="facts group">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v.map(cap).join(', '))}</dd></div>`).join('')}</dl>
    ${history.exerciseHistory(e.id)}
    <h3>How to</h3>
    <ol class="steps">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`);
}

$('#list').addEventListener('click', ev => {
  const b = ev.target.closest('[data-id]');
  if (!b) return;
  const e = byId[b.dataset.id];
  if (!pickCb) return show(e);
  const cb = pickCb;
  go('workout');
  cb(e);
  workout.render();
});
$('#sheet').addEventListener('click', ev => {
  if (ev.target === ev.currentTarget || ev.target.closest('[data-done]')) $('#sheet').close();
});
for (const el of ['#q', '#muscle', '#equip']) $(el).addEventListener('input', renderLib);
$('#clear').addEventListener('click', () => { $('#q').value = $('#muscle').value = $('#equip').value = ''; renderLib(); });

// --- Settings tab
function renderSettings() {
  $('#settings').innerHTML = `<div class="head"><h1>Settings</h1></div>
  <div class="pad">
    <h3 class="label">Units</h3>
    <div class="seg" role="radiogroup" aria-label="Units">${['lb', 'kg'].map(u =>
      `<button role="radio" data-units="${u}" aria-checked="${db.settings.units === u}">${u}</button>`).join('')}</div>
    <p class="muted">Switching converts every weight you've logged.</p>
  </div>`;
}
$('#settings').addEventListener('click', ev => {
  const b = ev.target.closest('[data-units]');
  if (b) { setUnits(b.dataset.units); renderSettings(); }
});

workout.init(byId, pick, w => { go('history'); history.detail(w); }, id => show(byId[id]));
history.init(byId);
go('workout');
