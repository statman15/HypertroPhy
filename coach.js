// The Coach tab (chat with your training as context) and the AI plan builder sheet.
import { $, esc, num, day, icon, sheet, closeSheet } from './ui.js';
import { db, save, uid, aboutYou, sessions, e1rm } from './store.js';
import { startMonth, weekIndex, monthDone } from './plan.js';
import { GOALS } from './progression.js';
import { clock } from './ui.js';
import * as ai from './ai.js';
const { chat, candidates, planPrompt, routinePrompt, parsePlan, EQUIPMENT, MUSCLE_GROUPS } = ai;
import { cap, isTimed } from './exercises.js';

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
    if (b.dataset.act === 'routine') return openRoutineBuilder(render);
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
      <button class="pill wide" data-act="plan">${icon('sparkle')}Build a Month Plan with AI</button>
      <button class="pill wide quiet" data-act="routine">${icon('sparkle')}Build One Routine</button>`}
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
    aboutYou() ? `About them: ${aboutYou()}.` : 'Age, sex and size not given.',
    db.body.weights.length > 1 ? `Recent body weight (${db.settings.units}), oldest first: ${db.body.weights.slice(-8).map(x => `${day(x.t)} ${num(x.w)}`).join(', ')}.` : '',
    db.plan ? (monthDone() ? 'Their month plan has finished; they have not built the next one yet.' : `They are in week ${weekIndex() + 1} of a 4-week plan${db.plan.deload === weekIndex() ? ' (the deload week)' : ''}.`) : '',
    p ? `Profile: goal ${g.label} (${g.repMin}-${g.repMax} reps), ${p.days} days a week, ${p.minutes} min sessions, ${p.level}, equipment: ${p.equipment.join(', ')}${p.avoid ? `; avoid: ${p.avoid}` : ''}.` : 'No profile set yet.',
    'Routines:', ...(db.routines.length ? db.routines.map(r => `- ${r.name}: ${r.items.map(it => `${name(it.exId)} ${it.sets}x${it.repMin}-${it.repMax}`).join(', ')}`) : ['- none']),
    'Workouts in the last 4 weeks, newest first:',
    ...(recent.length ? recent.map(w => `- ${day(w.start)} ${w.name}: ${w.items.map(it => `${name(it.exId)} ${it.sets.map(s => it.timed ? `${+s.w ? num(s.w) + 'x' : ''}${s.r}s` : `${num(s.w)}x${s.r}`).join(' ')}`).join('; ')}`) : ['- none logged']),
  ].filter(Boolean).join('\n');
}

// --- Plan builder: a form, then a preview, then routines.
export function openPlanBuilder(done) {
  const p = { ...PROFILE, ...db.profile };
  const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  const body = sheet(`<h2 id="sheetTitle">${db.plan ? 'Build Next Month' : 'Build a Month Plan'}</h2>
  <p class="muted">The AI builds 4 weeks: the same days and muscle slots each week, with exercises swapped for others that work the same muscle, and a lighter deload in week 4.${db.plan ? ' It uses how your past months went.' : ''}</p>
  <form class="form">
    <label>Goal<select name="goal">${Object.entries(GOALS).map(([k, g]) => opt(k, `${g.label} · ${g.repMin}–${g.repMax} reps`, p.goal)).join('')}</select></label>
    <div class="form-2">
      <label>Days a week<select name="days">${[2, 3, 4, 5, 6].map(d => opt(d, d, p.days)).join('')}</select></label>
      <label>Minutes<select name="minutes">${[30, 45, 60, 75, 90].map(m => opt(m, m, p.minutes)).join('')}</select></label>
    </div>
    <label>Pace<select name="pace">${opt('best', 'Best results: longer rest on big lifts', p.pace || 'best')}${opt('quick', 'Time-efficient: shorter rest, more supersets', p.pace)}</select></label>
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
    db.profile = { goal: f.get('goal'), days: +f.get('days'), minutes: +f.get('minutes'), level: f.get('level'), pace: f.get('pace'), equipment: f.getAll('equipment'), avoid: f.get('avoid').trim() };
    save('profile');
    const list = candidates(all, db.profile);
    if (list.length < 15) return void ($('#planMsg').textContent = 'Tick more equipment: there aren\'t enough exercises to build a week from.');
    btn.disabled = true; btn.textContent = 'Building… this can take a minute';
    $('#planMsg').textContent = '';
    btn.textContent = 'Building your month… this can take a minute or two';
    try { const plan = parsePlan(await chat(planPrompt(list, db.profile, aboutYou(), pastMonths())), lib); plan.via = ai.via === 'Gemini' ? 'Gemini' : ''; preview(plan, done); }
    catch (e) { $('#planMsg').textContent = e.message; btn.disabled = false; btn.textContent = 'Build My Plan'; }
  };
}

// --- One routine for chosen muscle groups. It's saved as your own routine (tagged AI), so the Monday plan switch keeps it.
export function openRoutineBuilder(done) {
  const p = { ...PROFILE, ...db.profile };
  const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  const body = sheet(`<h2 id="sheetTitle">Build a Routine</h2>
  <form class="form">
    <fieldset><legend>Focus on</legend><div class="checks">${Object.keys(MUSCLE_GROUPS).map(g =>
      `<label><input type="checkbox" name="groups" value="${g}">${g}</label>`).join('')}</div></fieldset>
    <div class="form-2">
      <label>Goal<select name="goal">${Object.entries(GOALS).map(([k, g]) => opt(k, g.label, p.goal)).join('')}</select></label>
      <label>Minutes<select name="minutes">${[20, 30, 45, 60, 75, 90].map(m => opt(m, m, Math.min(p.minutes, 90))).join('')}</select></label>
    </div>
    <label>Pace<select name="pace">${opt('best', 'Best results: longer rest on big lifts', p.pace || 'best')}${opt('quick', 'Time-efficient: shorter rest, more supersets', p.pace)}</select></label>
    <p class="muted">Uses your equipment and experience from your plan answers (${esc(p.level)}, ${p.equipment.length} kinds of equipment).</p>
    <button class="pill wide" type="submit">Build Routine</button>
    <p class="muted" id="routineMsg" role="status"></p>
  </form>`);
  body.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), btn = ev.target.querySelector('[type=submit]'), groups = f.getAll('groups');
    if (!groups.length) return void ($('#routineMsg').textContent = 'Tick at least one muscle group.');
    const prof = { ...p, goal: f.get('goal'), pace: f.get('pace') }, list = candidates(all, prof, groups);
    if (list.length < 3) return void ($('#routineMsg').textContent = 'Not enough exercises for those muscles with your equipment. Tick more groups or more equipment in Build a Month Plan.');
    btn.disabled = true; btn.textContent = 'Building…';
    $('#routineMsg').textContent = '';
    try {
      const plan = parsePlan(await chat(routinePrompt(list, prof, groups, +f.get('minutes'), aboutYou(), pastMonths())), lib);
      previewRoutine(plan.weeks[0][0], plan, prof.goal, done);
    } catch (e) { $('#routineMsg').textContent = e.message; btn.disabled = false; btn.textContent = 'Build Routine'; }
  };
}

function previewRoutine(d, plan, goal, done) {
  const g = GOALS[goal];
  const body = sheet(`<h2 id="sheetTitle">${esc(d.name)}</h2>
    <p class="muted">${esc(plan.notes)}</p>
    ${ai.via === 'Gemini' ? '<p class="muted">Built by Gemini: your main AI service couldn\'t be reached.</p>' : ''}
    ${plan.dropped ? `<p class="muted">Left out ${plan.dropped} exercise${plan.dropped === 1 ? '' : 's'} the AI made up.</p>` : ''}
    <ol class="group setlist">${d.items.map((it, i) =>
      `<li><span>${esc(name(it.exId))}${it.ss || d.items[i - 1]?.ss ? ' <small class="pr">superset</small>' : ''}</span><span>${it.sets} × ${it.timed ? `${it.repMin}s` : `${g.repMin}–${g.repMax}`} · <small class="muted">rest ${clock((it.rest ?? g.rest) * 1000)}</small></span>${it.why ? `<small class="why">${esc(it.why)}</small>` : ''}</li>`).join('')}</ol>
    <div class="group menu-list gap">
      <button data-m="save">Save as Routine</button>
      <button data-m="again">Change Focus</button>
    </div>`);
  body.onclick = ev => {
    const m = ev.target.closest('[data-m]')?.dataset.m;
    if (m === 'again') return openRoutineBuilder(done);
    if (m !== 'save') return;
    db.routines.push({ id: uid(), name: d.name, aiOne: true,
      items: d.items.map(({ why, ...it }) => ({ ...it, repMin: it.timed ? it.repMin : g.repMin, repMax: it.timed ? it.repMax : g.repMax, rest: it.rest ?? g.rest })) });
    save('routines');
    closeSheet();
    done();
  };
}

// What the AI should know about earlier months: exercises used per day, and how each lift moved lately.
function pastMonths() {
  const u = db.settings.units, lines = [];
  for (const p of [db.plan, ...db.plans].filter(Boolean).slice(0, 4)) {
    const byDay = {};
    for (const w of p.weeks) for (const d of w) for (const it of d.items) (byDay[d.name] ||= new Set()).add(name(it.exId));
    lines.push(`Month from ${day(p.start)}: ${Object.entries(byDay).map(([n, s]) => `${n}: ${[...s].join(', ')}`).join('; ')}`);
  }
  const since = Date.now() - 56 * 864e5;
  const ids = new Set(db.workouts.filter(w => w.start > since).flatMap(w => w.items.map(it => it.exId)));
  const moves = [...ids].map(id => {
    const ss = sessions(id).filter(s => s.date > since && !s.deload).reverse();
    if (ss.length < 2) return null;
    const T = isTimed(lib[id]), score = s => Math.max(...s.sets.map(x => T ? +x.r : e1rm(x.w, x.r)));
    const a = score(ss[0]), b = score(ss.at(-1)), trend = b > a * 1.02 ? 'up' : b < a * 0.98 ? 'down' : 'flat';
    return `${name(id)}: ${Math.round(a)} → ${Math.round(b)} ${T ? 's hold' : `${u} est. 1RM`} (${trend}, ${ss.length} sessions)`;
  }).filter(Boolean).slice(0, 30);
  if (moves.length) lines.push('Progress over the last 8 weeks:', ...moves);
  return lines.join('\n');
}

function preview(plan, done, wk = 0) {
  const g = GOALS[db.profile.goal], days = plan.weeks[wk];
  const body = sheet(`<h2 id="sheetTitle">Your Month</h2>
    <div class="seg" role="radiogroup" aria-label="Week">${plan.weeks.map((_, k) => `<button role="radio" data-wk="${k}" aria-checked="${k === wk}">Week ${k + 1}</button>`).join('')}</div>
    ${wk === 3 ? '<p class="muted">Deload week: fewer sets, and suggested weights about 10% lighter.</p>' : ''}
    <p class="muted">${esc(plan.notes)}</p>
    ${plan.via ? `<p class="muted">Built by ${plan.via}: your main AI service couldn't be reached.</p>` : ''}
    ${plan.dropped ? `<p class="muted">Left out ${plan.dropped} exercise${plan.dropped === 1 ? '' : 's'} the AI made up.</p>` : ''}
    ${days.map(d => `<h3>${esc(d.name)}</h3><ol class="group setlist">${d.items.map((it, i) =>
      `<li><span>${esc(name(it.exId))}${it.ss || d.items[i - 1]?.ss ? ' <small class="pr">superset</small>' : ''}</span><span>${it.sets} × ${it.timed ? `${it.repMin}s` : `${g.repMin}–${g.repMax}`} · <small class="muted">rest ${clock((it.rest ?? g.rest) * 1000)}</small></span>${it.why ? `<small class="why">${esc(it.why)}</small>` : ''}</li>`).join('')}</ol>`).join('')}
    <div class="group menu-list gap">
      <button data-m="save">Start This Month</button>
      <button data-m="again">Change Answers</button>
    </div>
    <p class="muted">Your AI routines switch to each week's set every Monday. Routines you made yourself stay. ${db.plan ? 'Your current month is kept in your history.' : ''}</p>`);
  body.onclick = ev => {
    const wk = ev.target.closest('[data-wk]');
    if (wk) return preview(plan, done, +wk.dataset.wk);
    const m = ev.target.closest('[data-m]')?.dataset.m;
    if (m === 'again') return openPlanBuilder(done);
    if (m !== 'save') return;
    startMonth(plan.weeks.map(w => w.map(d => ({
      name: d.name,
      items: d.items.map(({ why, ...it }) => ({ ...it, repMin: it.timed ? it.repMin : g.repMin, repMax: it.timed ? it.repMax : g.repMax, rest: it.rest ?? g.rest })),
    }))), plan.notes);
    closeSheet();
    done();
  };
}
