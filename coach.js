// The Coach tab (chat with your training as context) and the AI plan builder sheet.
import { $, esc, num, day, icon, sheet, closeSheet } from './ui.js';
import { db, save, uid } from './store.js';
import { GOALS } from './progression.js';
import * as ai from './ai.js';
const { chat, candidates, planPrompt, parsePlan, EQUIPMENT } = ai;
import { cap } from './exercises.js';

let all, lib, busy = false, error = '';
const name = id => lib[id]?.name || id;
const PROFILE = { goal: 'muscle', days: 3, minutes: 60, level: 'beginner', equipment: EQUIPMENT.filter(e => e !== 'other'), avoid: '' };
const SUGGESTIONS = ['What should I focus on this week?', 'Something hurts on an exercise. What can I swap in?', 'How should I warm up?'];

export function init(list, byId) {
  [all, lib] = [list, byId];
  const root = $('#coach');
  root.addEventListener('submit', ev => { ev.preventDefault(); send(ev.target.q.value); });
  root.addEventListener('keydown', ev => {
    if (ev.target.name === 'q' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(ev.target.value); }
  });
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act], [data-ask]');
    if (!b) return;
    if (b.dataset.ask) return send(b.dataset.ask);
    if (b.dataset.act === 'plan') return openPlanBuilder(render);
    if (b.dataset.act === 'clear' && confirm('Clear this conversation?')) { db.chat = []; save('chat'); error = ''; render(); }
  });
}

const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function render() {
  const root = $('#coach');
  root.innerHTML = `<div class="head row-head"><h1>Coach</h1>
    ${db.chat.length ? '<button class="text-btn" data-act="clear">Clear</button>' : ''}</div>
  <div class="pad chat">
    ${db.chat.length ? '' : `<p class="muted">Ask about your training. The coach sees your goal, your routines and the last 4 weeks of workouts.</p>
      <div class="suggest">${SUGGESTIONS.map(s => `<button data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <button class="pill wide" data-act="plan">${icon('sparkle')}Build a Plan with AI</button>`}
    ${db.chat.map(m => `<div class="msg ${m.role}">${fmt(m.content)}</div>${m.via ? `<small class="via">Answered by ${m.via}: your main AI service couldn't be reached</small>` : ''}`).join('')}
    ${busy ? '<div class="msg assistant typing" aria-label="Coach is typing"><i></i><i></i><i></i></div>' : ''}
    ${error ? `<div class="msg error" role="alert">${esc(error)}</div>` : ''}
  </div>
  <form class="composer glass">
    <textarea name="q" rows="1" placeholder="Ask your coach" aria-label="Message" enterkeyhint="send"></textarea>
    <button class="send" aria-label="Send"${busy ? ' disabled' : ''}>${icon('send')}</button>
  </form>`;
  root.querySelector('.chat').lastElementChild?.scrollIntoView({ block: 'end' });
}

async function send(q) {
  q = q.trim();
  if (busy || !q) return;
  db.chat.push({ role: 'user', content: q });
  db.chat = db.chat.slice(-50);
  save('chat');
  busy = true; error = '';
  render();
  try {
    const content = await chat([{ role: 'system', content: context() }, ...db.chat.slice(-20).map(({ role, content }) => ({ role, content }))]);
    db.chat.push({ role: 'assistant', content, ...(ai.via === 'Gemini' && { via: 'Gemini' }) });
    save('chat');
  } catch (e) { error = e.message; }
  busy = false;
  if (!$('#coach').hidden) render();
}

// What the coach knows: profile, routines, the app's progression rule, and 4 weeks of sets.
function context() {
  const u = db.settings.units, p = db.profile, g = p && GOALS[p.goal];
  const recent = db.workouts.filter(w => w.start > Date.now() - 28 * 864e5);
  return [
    'You are a friendly, knowledgeable strength coach inside the HypertroPhy lifting app. Be concise (under 150 words unless asked for more), practical and safe. Plain text; short lists are fine. If something sounds like an injury, suggest seeing a professional.',
    `Weights are in ${u}. The app suggests weights by double progression: hit the top of the rep range on every set and it adds weight; miss the bottom twice at one weight and it deloads 10%.`,
    p ? `Profile: goal ${g.label} (${g.repMin}-${g.repMax} reps), ${p.days} days a week, ${p.minutes} min sessions, ${p.level}, equipment: ${p.equipment.join(', ')}${p.avoid ? `; avoid: ${p.avoid}` : ''}.` : 'No profile set yet.',
    'Routines:', ...(db.routines.length ? db.routines.map(r => `- ${r.name}: ${r.items.map(it => `${name(it.exId)} ${it.sets}x${it.repMin}-${it.repMax}`).join(', ')}`) : ['- none']),
    'Workouts in the last 4 weeks, newest first:',
    ...(recent.length ? recent.map(w => `- ${day(w.start)} ${w.name}: ${w.items.map(it => `${name(it.exId)} ${it.sets.map(s => `${num(s.w)}x${s.r}`).join(' ')}`).join('; ')}`) : ['- none logged']),
  ].join('\n');
}

// --- Plan builder: a form, then a preview, then routines.
export function openPlanBuilder(done) {
  const p = { ...PROFILE, ...db.profile };
  const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  const body = sheet(`<h2 id="sheetTitle">Build a Plan</h2>
  <form class="form">
    <label>Goal<select name="goal">${Object.entries(GOALS).map(([k, g]) => opt(k, `${g.label} · ${g.repMin}–${g.repMax} reps`, p.goal)).join('')}</select></label>
    <div class="form-2">
      <label>Days a week<select name="days">${[2, 3, 4, 5, 6].map(d => opt(d, d, p.days)).join('')}</select></label>
      <label>Minutes<select name="minutes">${[30, 45, 60, 75, 90].map(m => opt(m, m, p.minutes)).join('')}</select></label>
    </div>
    <label>Experience<select name="level">${['beginner', 'intermediate', 'expert'].map(l => opt(l, cap(l), p.level)).join('')}</select></label>
    <fieldset><legend>Equipment you have</legend><div class="checks">${EQUIPMENT.map(e =>
      `<label><input type="checkbox" name="equipment" value="${e}"${p.equipment.includes(e) ? ' checked' : ''}>${cap(e)}</label>`).join('')}</div></fieldset>
    <label>Injuries or moves to avoid<input name="avoid" value="${esc(p.avoid)}" placeholder="e.g. sore left shoulder" autocomplete="off"></label>
    <button class="pill wide" type="submit">Build My Plan</button>
    <p class="muted" id="planMsg" role="status"></p>
  </form>`);
  body.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), btn = ev.target.querySelector('[type=submit]');
    db.profile = { goal: f.get('goal'), days: +f.get('days'), minutes: +f.get('minutes'), level: f.get('level'), equipment: f.getAll('equipment'), avoid: f.get('avoid').trim() };
    save('profile');
    const list = candidates(all, db.profile);
    if (list.length < 15) return void ($('#planMsg').textContent = 'Tick more equipment: there aren\'t enough exercises to build a week from.');
    btn.disabled = true; btn.textContent = 'Building… this can take a minute';
    $('#planMsg').textContent = '';
    try { const plan = parsePlan(await chat(planPrompt(list, db.profile)), lib); plan.via = ai.via === 'Gemini' ? 'Gemini' : ''; preview(plan, done); }
    catch (e) { $('#planMsg').textContent = e.message; btn.disabled = false; btn.textContent = 'Build My Plan'; }
  };
}

function preview(plan, done) {
  const g = GOALS[db.profile.goal];
  const body = sheet(`<h2 id="sheetTitle">Your Plan</h2>
    <p class="muted">${esc(plan.notes)}</p>
    ${plan.via ? `<p class="muted">Built by ${plan.via}: your main AI service couldn't be reached.</p>` : ''}
    ${plan.dropped ? `<p class="muted">Left out ${plan.dropped} exercise${plan.dropped === 1 ? '' : 's'} the AI made up.</p>` : ''}
    ${plan.days.map(d => `<h3>${esc(d.name)}</h3><ol class="group setlist">${d.items.map((it, i) =>
      `<li><span>${esc(name(it.exId))}${it.ss || d.items[i - 1]?.ss ? ' <small class="pr">superset</small>' : ''}</span><span>${it.sets} × ${g.repMin}–${g.repMax}</span></li>`).join('')}</ol>`).join('')}
    <div class="group menu-list gap">
      <button data-m="save">Save as Routines</button>
      <button data-m="again">Change Answers</button>
    </div>
    <p class="muted">Saving replaces the routines from your last AI plan. Routines you made yourself stay.</p>`);
  body.onclick = ev => {
    const m = ev.target.closest('[data-m]')?.dataset.m;
    if (m === 'again') return openPlanBuilder(done);
    if (m !== 'save') return;
    db.routines = db.routines.filter(r => !r.ai).concat(plan.days.map(d => ({
      id: uid(), ai: true, name: d.name,
      items: d.items.map(it => ({ ...it, repMin: g.repMin, repMax: g.repMax, rest: g.rest })),
    })));
    save('routines');
    closeSheet();
    done();
  };
}
