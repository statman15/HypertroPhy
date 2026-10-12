import { load, filter, values, photo, cap } from './exercises.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const img = (path, alt = '') => path ? `<img src="${photo(path)}" crossorigin="anonymous" loading="lazy" alt="${alt}">` : '';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

const all = await load();
const byId = Object.fromEntries(all.map(e => [e.id, e]));

for (const [sel, key] of [[$('#muscle'), 'primaryMuscles'], [$('#equip'), 'equipment']])
  sel.insertAdjacentHTML('beforeend', values(all, key).map(v => `<option value="${esc(v)}">${esc(cap(v))}</option>`).join(''));

function render() {
  const list = filter(all, { q: $('#q').value, muscle: $('#muscle').value, equip: $('#equip').value });
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
  $('#sheetBody').innerHTML = `
    <div class="demo">${e.images.slice(0, 2).map((p, i) => img(p, i ? 'End position' : 'Start position')).join('')}</div>
    <h2 id="sheetTitle">${esc(e.name)}</h2>
    <dl class="facts group">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v.map(cap).join(', '))}</dd></div>`).join('')}</dl>
    <h3>How to</h3>
    <ol class="steps">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('#sheet').showModal();
  $('#sheet').scrollTop = 0;
}

$('#list').addEventListener('click', ev => {
  const b = ev.target.closest('[data-id]');
  if (b) show(byId[b.dataset.id]);
});
$('#sheet').addEventListener('click', ev => {
  if (ev.target === ev.currentTarget || ev.target.closest('[data-done]')) $('#sheet').close();
});
for (const el of ['#q', '#muscle', '#equip']) $(el).addEventListener('input', render);
$('#clear').addEventListener('click', () => { $('#q').value = $('#muscle').value = $('#equip').value = ''; render(); });

render();
