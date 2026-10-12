import { $, esc, day, sheet } from './ui.js';
import { db, save, setUnits, backup, restore } from './store.js';
import { load, filter, values, photo, cap } from './exercises.js';
import * as workout from './workout.js';
import * as history from './history.js';
import * as coach from './coach.js';
import * as ai from './ai.js';
const { PRESETS, conn, models, chat } = ai;

const img = (path, alt = '') => path ? `<img src="${photo(path)}" crossorigin="anonymous" loading="lazy" alt="${alt}">` : '';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); // photo cache; optional

const all = await load();
const byId = Object.fromEntries(all.map(e => [e.id, e]));

// --- Tabs. Picking an exercise for a workout borrows the Exercises tab; leaving it cancels the pick.
let pickCb = null;
const views = { workout: workout.render, history: history.render, exercises: renderLib, coach: coach.render, settings: renderSettings };

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
  const body = sheet(`
    <div class="demo">${e.images.slice(0, 2).map((p, i) => img(p, i ? 'End position' : 'Start position')).join('')}</div>
    <h2 id="sheetTitle">${esc(e.name)}</h2>
    <dl class="facts group">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v.map(cap).join(', '))}</dd></div>`).join('')}</dl>
    ${history.exerciseHistory(e.id)}
    <h3>How to</h3>
    <ol class="steps">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`);
  history.bindChart(body);
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
  const ai = db.settings.ai ||= { preset: 'omniroute' };
  for (const k in PRESETS) ai[k] ||= { url: PRESETS[k].url, key: '', model: '' };
  const c = conn();
  $('#settings').innerHTML = `<div class="head"><h1>Settings</h1></div>
  <div class="pad">
    <h3 class="label">Units</h3>
    <div class="seg" role="radiogroup" aria-label="Units">${['lb', 'kg'].map(u =>
      `<button role="radio" data-units="${u}" aria-checked="${db.settings.units === u}">${u}</button>`).join('')}</div>
    <p class="muted">Switching converts every weight you've logged.</p>

    <h3 class="label">AI Coach</h3>
    <div class="seg" role="radiogroup" aria-label="AI service">${Object.entries(PRESETS).map(([k, p]) =>
      `<button role="radio" data-preset="${k}" aria-checked="${ai.preset === k}">${p.label}</button>`).join('')}</div>
    <p class="muted">${PRESETS[ai.preset].hint}</p>
    <div class="group form-rows">
      <label>Address<input data-ai="url" value="${esc(c.url)}" placeholder="https://…/v1" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
${PRESETS[ai.preset].home ? `<label>Home address<input data-ai="home" value="${esc(c.home || "")}" placeholder="optional, e.g. http://192.168.1.37:20128/v1" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"></label>` : ""}
      <label>API key<input data-ai="key" type="password" value="${esc(c.key)}" autocomplete="off"></label>
      <label>Model<input data-ai="model" list="modelList" value="${esc(c.model)}" placeholder="Tap Test to list models" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <datalist id="modelList"></datalist>
    </div>
    <button class="pill wide" data-test>Test Connection</button>
    <p class="muted" id="aiMsg" role="status">The key is stored only on this phone.</p>

    <h3 class="label">Backup</h3>
    <div class="group menu-list">
      <button data-backup>Save Backup</button>
      <label>Restore from Backup<input type="file" id="importFile" accept="application/json,.json"></label>
    </div>
    <p class="muted" id="backupMsg" role="status">Last backup: ${db.settings.lastBackup ? day(db.settings.lastBackup) : 'never'}. The file holds your workouts, routines and plan answers. AI keys stay on this phone.</p>
  </div>`;
}
$('#settings').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-units], [data-preset], [data-test]');
  if (!b) return;
  if (b.dataset.units) { setUnits(b.dataset.units); return renderSettings(); }
  if (b.dataset.preset) { db.settings.ai.preset = b.dataset.preset; save('settings'); return renderSettings(); }
  // Test: list the models (fills the picker, and picks one if none is set), then ask for a one-word reply.
  const msg = $('#aiMsg');
  b.disabled = true; msg.textContent = 'Connecting…';
  try {
    const list = await models();
    $('#modelList').innerHTML = list.map(m => `<option value="${esc(m)}">`).join('');
    const c = conn();
    if (!c.model) { c.model = list.find(m => /flash|auto/.test(m)) || list[0] || ''; save('settings'); $('[data-ai=model]').value = c.model; }
    await chat([{ role: 'user', content: 'Reply with the single word OK.' }]);
    msg.textContent = `Connected${ai.via ? ` via ${ai.via === 'home' ? 'home address' : ai.via}` : ''} · ${c.model} · ${list.length} models available`;
  } catch (e) { msg.textContent = e.message; }
  b.disabled = false;
});
$('#settings').addEventListener('change', async ev => {
  if (ev.target.id !== 'importFile') return;
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm(`Replace everything on this phone with the backup from ${data.exported ? day(data.exported) : 'an unknown date'}? This can't be undone.`)) return;
    const n = restore(data);
    renderSettings();
    $('#backupMsg').textContent = `Restored ${n} workout${n === 1 ? '' : 's'}.`;
  } catch (e) { $('#backupMsg').textContent = e instanceof SyntaxError ? 'That file isn\'t a HypertroPhy backup.' : e.message; }
});
$('#settings').addEventListener('input', ev => {
  const f = ev.target.dataset.ai;
  if (f) { conn()[f] = ev.target.value.trim(); save('settings'); }
});

workout.init(byId, pick, w => { go('history'); history.detail(w); }, id => show(byId[id]), coach.openPlanBuilder);
history.init(byId);
coach.init(all, byId);
go('workout');

// --- Backup: the share sheet (Drive, Files, email…) where the phone has one, else a download.
// The Android app's WebView can't share files, so it writes the file and shares it natively.
async function saveBackup() {
  const json = JSON.stringify(backup()), name = `hypertrophy-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'HypertroPhy backup', files: [uri] });
    } else {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'HypertroPhy backup' });
      else { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name }); a.click(); URL.revokeObjectURL(a.href); }
    }
  } catch (e) { if (e.name === 'AbortError' || /cancel/i.test(e.message)) return; alert(`Couldn't save the backup: ${e.message}`); return; }
  db.settings.lastBackup = Date.now();
  save('settings');
  if (!$('#settings').hidden) renderSettings();
  if (!$('#workout').hidden) workout.render();
}
document.addEventListener('click', ev => { if (ev.target.closest('[data-backup]')) saveBackup(); });

// --- Android app: a banner when GitHub has a newer release. Checked on open and on return, at most every 6 hours.
// Update navigates to the APK, which Capacitor hands to the system browser; Android then offers to install it over this one (same signing key, data kept).
const native = window.Capacitor?.isNativePlatform?.();
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let checkedAt = 0;
async function checkUpdate() {
  if (!native || Date.now() - checkedAt < 6 * 3600e3) return;
  checkedAt = Date.now();
  try {
    const { version } = await (await fetch('version.json')).json();
    const rel = await (await fetch('https://api.github.com/repos/statman15/HypertroPhy/releases/latest')).json();
    const latest = String(rel.tag_name || '').replace(/^v/, ''), apk = rel.assets?.find(a => a.name.endsWith('.apk'))?.browser_download_url;
    if (version === 'dev' || !apk || !newer(latest, version) || localStorage.getItem('skipUpdate') === latest) return;
    $('#updateText').textContent = `Update available: ${latest}`;
    $('#updateGo').href = apk;
    $('#updateSkip').onclick = () => { localStorage.setItem('skipUpdate', latest); $('#update').hidden = true; };
    $('#update').hidden = false;
  } catch {} // offline or rate-limited: try again next time
}
checkUpdate();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkUpdate());
