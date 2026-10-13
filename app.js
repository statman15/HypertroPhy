import { $, esc, day, sheet } from './ui.js';
import { db, save, setUnits, backup, restore } from './store.js';
import { PLATE_DEFAULTS } from './progression.js';
import { load, filter, values, photo, cap } from './exercises.js';
import * as workout from './workout.js';
import * as history from './history.js';
import * as coach from './coach.js';
import * as ai from './ai.js';
import * as watch from './watch.js';
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
  filters.muscles = preset.muscle ? [preset.muscle] : [];
  filters.equip = [];
  go('exercises');
  pickCb = cb;
  renderLib();
}
$('#pickCancel').addEventListener('click', () => go('workout'));

// --- Exercises tab
// Muscle and equipment filters: each chip opens a checklist sheet; pick any number, the list updates behind it.
const filters = { muscles: [], equip: [] };
const choices = { muscles: values(all, 'primaryMuscles'), equip: values(all, 'equipment') };
const label = (picked, all, noun) => !picked.length ? `All ${all}` : picked.length === 1 ? cap(picked[0]) : `${picked.length} ${noun}`;

function openFilter(kind) {
  const body = sheet(`<h2 id="sheetTitle">${kind === 'muscles' ? 'Muscles' : 'Equipment'}</h2>
    <div class="checks">${choices[kind].map(v => `<label><input type="checkbox" value="${esc(v)}"${filters[kind].includes(v) ? ' checked' : ''}>${esc(cap(v))}</label>`).join('')}</div>
    <div class="sheet-actions"><button class="pill quiet" data-clear>Clear</button><button class="pill" data-done></button></div>`);
  const count = () => { body.querySelector('[data-done]').textContent = `Show ${$('#count').textContent.split(' ')[0]}`; };
  body.onchange = () => { filters[kind] = [...body.querySelectorAll(':checked')].map(c => c.value); renderLib(); count(); };
  body.onclick = ev => { if (ev.target.closest('[data-clear]')) { body.querySelectorAll(':checked').forEach(c => { c.checked = false; }); body.onchange(); } };
  count();
}
document.querySelector('.filters').addEventListener('click', ev => { const b = ev.target.closest('[data-filter]'); if (b) openFilter(b.dataset.filter); });

function renderLib() {
  const list = filter(all, { q: $('#q').value, ...filters });
  $('#pickBar').hidden = !pickCb;
  $('#count').textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}`;
  $('#list').innerHTML = list.map(e => `<li><button class="row" data-id="${esc(e.id)}">
    <span class="thumb">${img(e.images[0])}</span>
    <span><span class="t">${esc(e.name)}</span><span class="a">${esc(cap(e.primaryMuscles[0] || ''))} · ${esc(cap(e.equipment))}</span></span>
  </button></li>`).join('');
  $('#empty').hidden = list.length > 0;
  $('#muscleBtn').textContent = label(filters.muscles, 'Muscles', 'muscles');
  $('#equipBtn').textContent = label(filters.equip, 'Equipment', 'kinds');
  $('#muscleBtn').classList.toggle('on', filters.muscles.length > 0);
  $('#equipBtn').classList.toggle('on', filters.equip.length > 0);
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
$('#q').addEventListener('input', renderLib);
$('#clear').addEventListener('click', () => { $('#q').value = ''; filters.muscles = []; filters.equip = []; renderLib(); });

// --- Settings tab
function renderSettings() {
  const ai = db.settings.ai ||= { preset: 'omniroute' };
  for (const k in PRESETS) ai[k] ||= { url: PRESETS[k].url, key: '', model: '' };
  const c = conn();
  const kit = db.settings.plates || PLATE_DEFAULTS[db.settings.units];
  $('#settings').innerHTML = `<div class="head"><h1>Settings</h1></div>
  <div class="pad">
    <h3 class="label">Units</h3>
    <div class="seg" role="radiogroup" aria-label="Units">${['lb', 'kg'].map(u =>
      `<button role="radio" data-units="${u}" aria-checked="${db.settings.units === u}">${u}</button>`).join('')}</div>
    <p class="muted">Switching converts every weight you've logged.</p>

    <h3 class="label">About You</h3>
    <div class="seg" role="radiogroup" aria-label="Sex">${[['male', 'Male'], ['female', 'Female'], ['', 'Not set']].map(([v, l]) =>
      `<button role="radio" data-sex="${v}" aria-checked="${db.body.sex === v}">${l}</button>`).join('')}</div>
    <div class="group form-rows">
      <label>Born<input data-body="birthYear" inputmode="numeric" value="${esc(db.body.birthYear)}" placeholder="Year, e.g. 1990" autocomplete="off"></label>
      ${db.settings.units === 'kg'
        ? `<label>Height<input data-body="cm" inputmode="numeric" value="${db.body.heightCm ? Math.round(db.body.heightCm) : ''}" placeholder="cm"></label>`
        : `<label>Height<span class="ftin"><input data-body="ft" inputmode="numeric" value="${db.body.heightCm ? Math.floor(db.body.heightCm / 30.48) : ''}" placeholder="ft" aria-label="Feet"><input data-body="in" inputmode="numeric" value="${db.body.heightCm ? Math.round(db.body.heightCm / 2.54 % 12) : ''}" placeholder="in" aria-label="Inches"></span></label>`}
    </div>
    <p class="muted">Used for AI plans and the coach, starting-weight guesses for new exercises, and calorie estimates. Log body weight on the History tab.</p>

    <h3 class="label">Bar &amp; Plates</h3>
    <div class="group form-rows"><label>Bar (${db.settings.units})<input data-bar inputmode="decimal" value="${kit.bar}"></label></div>
    <div class="checks plates-have" aria-label="Plates you have">${PLATE_DEFAULTS[db.settings.units].have.map(p =>
      `<label><input type="checkbox" data-plate value="${p}"${kit.have.includes(p) ? ' checked' : ''}>${p}</label>`).join('')}</div>

    <h3 class="label">AI Coach</h3>
    <div class="seg" role="radiogroup" aria-label="AI service">${Object.entries(PRESETS).map(([k, p]) =>
      `<button role="radio" data-preset="${k}" aria-checked="${ai.preset === k}">${p.label}</button>`).join('')}</div>
    <p class="muted">${PRESETS[ai.preset].hint}</p>
    <div class="group form-rows">
      <label>Address<input data-ai="url" value="${esc(c.url)}" placeholder="https://…/v1" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
${PRESETS[ai.preset].home ? `<label>Home address<input data-ai="home" value="${esc(c.home || "")}" placeholder="optional, e.g. http://192.168.1.37:20128/v1" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"></label>` : ""}
      <label>API key<input data-ai="key" type="password" value="${esc(c.key)}" autocomplete="off"></label>
      ${c.models?.length
        ? `<label>Model<select data-ai="model">${[...new Set([c.model, ...c.models].filter(Boolean))].map(m =>
            `<option${m === c.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>`
        : `<label>Model<input data-ai="model" value="${esc(c.model)}" placeholder="Tap Test to list models" autocapitalize="off" autocomplete="off" spellcheck="false"></label>`}
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
  const b = ev.target.closest('[data-units], [data-preset], [data-test], [data-sex]');
  if (!b) return;
  if (b.dataset.units) { setUnits(b.dataset.units); return renderSettings(); }
  if (b.dataset.sex != null) { db.body.sex = b.dataset.sex; save('body'); return renderSettings(); }
  if (b.dataset.preset) { db.settings.ai.preset = b.dataset.preset; save('settings'); return renderSettings(); }
  // Test: fetch the model list (kept, so Model becomes a dropdown), pick one if none is set, then ask for a one-word reply.
  const say = t => { $('#aiMsg').textContent = t; };
  b.disabled = true; say('Connecting…');
  try {
    const list = await models(), c = conn();
    c.models = list;
    if (!c.model) c.model = list.find(m => /flash|auto/.test(m)) || list[0] || '';
    save('settings');
    renderSettings();
    say('Connecting…');
    await chat([{ role: 'user', content: 'Reply with the single word OK.' }]);
    say(`Connected${ai.via ? ` via ${ai.via === 'home' ? 'home address' : ai.via}` : ''} · ${c.model} · ${list.length} models available`);
  } catch (e) { say(e.message); }
  const btn = $('#settings [data-test]');
  if (btn) btn.disabled = false;
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
  const d = ev.target.dataset, v = ev.target.value.trim();
  if (d.body === 'birthYear') { const y = parseInt(v); db.body.birthYear = y > 1900 && y <= new Date().getFullYear() ? y : ''; save('body'); return; }
  if (d.body === 'cm') { db.body.heightCm = +v > 0 && +v < 300 ? +v : ''; save('body'); return; }
  if (d.body === 'ft' || d.body === 'in') {
    const ft = +$('[data-body=ft]').value || 0, inch = +$('[data-body=in]').value || 0, cm = Math.round((ft * 12 + inch) * 2.54);
    db.body.heightCm = cm > 0 && cm < 300 ? cm : ''; save('body'); return;
  }
  if ('bar' in d || 'plate' in d) {
    const bar = parseFloat($('[data-bar]').value.replace(',', '.'));
    db.settings.plates = { bar: bar >= 0 ? bar : PLATE_DEFAULTS[db.settings.units].bar, have: [...document.querySelectorAll('[data-plate]:checked')].map(c => +c.value) };
    save('settings'); return;
  }
  const f = d.ai;
  if (f) { conn()[f] = ev.target.value.trim(); save('settings'); }
});

workout.init(byId, pick, w => { go('history'); history.detail(w); }, id => show(byId[id]), coach.openPlanBuilder, coach.openRoutineBuilder);
history.init(byId);
watch.init(workout);
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
// Update downloads the APK in-app and opens Android's installer over this one (same signing key, data kept). A Chrome background download got stuck at the end on Chris's phone, so it's not used; on any failure we fall back to the release page.
const native = window.Capacitor?.isNativePlatform?.();
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let checkedAt = 0;
async function checkUpdate() {
  if (!native || Date.now() - checkedAt < 6 * 3600e3) return;
  checkedAt = Date.now();
  try {
    const { version } = await (await fetch('version.json')).json();
    const rel = await (await fetch('https://api.github.com/repos/statman15/HypertroPhy/releases/latest')).json();
    const latest = String(rel.tag_name || '').replace(/^v/, ''), apk = rel.assets?.find(a => /^HypertroPhy-(?!.*watch).*\.apk$/.test(a.name))?.browser_download_url;
    if (version === 'dev' || !apk || !newer(latest, version) || localStorage.getItem('skipUpdate') === latest) return;
    $('#updateText').textContent = `Update available: ${latest}`;
    $('#updateGo').onclick = async ev => {
      ev.preventDefault();
      const go = $('#updateGo'), text = $('#updateText'), { Filesystem, FileOpener } = window.Capacitor.Plugins;
      go.style.pointerEvents = 'none'; // it's a link, so `disabled` does nothing
      const prog = await Filesystem.addListener('progress', p => { if (p.contentLength) text.textContent = `Downloading ${latest}… ${Math.round(100 * p.bytes / p.contentLength)}%`; });
      text.textContent = `Downloading ${latest}…`;
      try {
        const r = await Filesystem.downloadFile({ url: apk, path: `HypertroPhy-${latest}.apk`, directory: 'CACHE', progress: true, recursive: true });
        await FileOpener.open({ filePath: r.path, contentType: 'application/vnd.android.package-archive', openWithDefault: true });
        text.textContent = 'Follow the installer to update';
      } catch {
        text.textContent = "Couldn't download the update. Opening the release page…";
        location.href = rel.html_url;
      }
      prog.remove();
      go.style.pointerEvents = '';
    };
    $('#updateSkip').onclick = () => { localStorage.setItem('skipUpdate', latest); $('#update').hidden = true; };
    $('#update').hidden = false;
  } catch {} // offline or rate-limited: try again next time
}
checkUpdate();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkUpdate());
