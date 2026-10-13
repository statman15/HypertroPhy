// One OpenAI-compatible connection (OmniRoute, Gemini, or anything else that speaks /chat/completions).
// Address, key and model live in settings.ai on this phone only.
import { db } from './store.js';
import { GOALS, TIME_RANGE } from './progression.js';
import { isTimed, gear } from './exercises.js';

// Rest the AI picks per exercise, snapped to the app's rest-timer choices.
const RESTS = [30, 45, 60, 90, 120, 180, 240, 300];
export const snapRest = v => +v > 0 ? RESTS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a) : null;

export const PRESETS = {
  omniroute: { label: 'OmniRoute', url: '', home: true, hint: 'Address: OmniRoute\'s Tailscale HTTPS address (works away from home with Tailscale on). Home address: its LAN address, tried first; works in the Android app, not the website.' },
  gemini: { label: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', hint: 'Free key from aistudio.google.com → Get API key.' },
  other: { label: 'Other', url: '', home: true, hint: 'Any OpenAI-compatible address, ending in /v1.' },
};

// settings.ai = { preset, omniroute: {url,home,key,model}, gemini: {...}, other: {...} }: switching services keeps each one's key.
export const conn = () => { const a = db.settings.ai; return a?.[a.preset] || {}; };

const host = url => { try { return new URL(url).host; } catch { return url; } };
// A bare address (https://host:port) means the usual /v1; Gemini's longer path is left alone.
const base = url => { const u = url.trim().replace(/\/+$/, ''); try { return new URL(u).pathname === '/' ? u + '/v1' : u; } catch { return u; } };

// With a home address, use it when it answers within 2.5 s (any reply, even 401, means it's reachable), else the main address.
// The answer is remembered for a minute so each message doesn't re-probe. On the website an http home address fails instantly.
let picked = { at: 0, key: '', url: '' };
async function address(c) {
  if (!c.home) return c.url;
  const key = c.home + c.url;
  if (picked.key === key && Date.now() - picked.at < 60000) return picked.url;
  let url = c.url;
  try { await fetch(base(c.home) + '/models', { headers: { Authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(2500) }); url = c.home; } catch {}
  picked = { at: Date.now(), key, url };
  return url;
}

// Which address answered the last request: '' (the main one), 'home', or 'Gemini' (fallback).
export let via = '';

async function call(path, body, c = conn()) {
  if (!(c.url || c.home) || !c.key) throw new Error('Set up the AI connection in Settings first.');
  const url = await address(c);
  let res;
  try {
    res = await fetch(base(url) + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${c.key}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('The AI took too long to answer. Try again.');
    picked.at = 0; // look for the home address again next time
    throw Object.assign(new Error(`Couldn't reach ${host(url)}. Check the address (it must start with https://), and for a Tailscale address that Tailscale is on.`), { unreachable: true });
  }
  if (res.status === 401 || res.status === 403) throw new Error('The AI service rejected the key. Check it in Settings.');
  if (!res.ok) throw new Error(`The AI service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  via = url === c.home && c.home ? 'home' : '';
  return res.json();
}

export const models = async () => (await call('/models')).data.map(m => m.id.replace(/^models\//, ''))
  .filter(id => !/embed|imagen|veo|tts|aqa|vision|image/.test(id)).sort();

// When the chosen service can't be reached at all and a Gemini key is saved, Gemini answers instead.
export async function chat(messages) {
  const c = conn(), gem = db.settings.ai?.gemini;
  let r;
  try { r = await call('/chat/completions', { model: c.model, messages }, c); }
  catch (e) {
    if (!e.unreachable || c === gem || !gem?.key) throw e;
    r = await call('/chat/completions', { model: gem.model || 'gemini-2.5-flash', messages }, gem);
    via = 'Gemini';
  }
  const text = r.choices?.[0]?.message?.content;
  if (!text) throw new Error('The AI sent back an empty answer. Try again, or pick another model in Settings.');
  return text;
}

// --- Plan builder

const LEVELS = ['beginner', 'intermediate', 'expert'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'bands', 'body only', 'pull-up bar', 'dip bars', 'e-z curl bar', 'medicine ball', 'exercise ball', 'other'];

// Only exercises the person can do: their equipment, their level or easier, real training (no stretches).
// Friendly muscle groups for a single focused routine, mapped to the library's primary muscles.
export const MUSCLE_GROUPS = {
  Chest: ['chest'], Back: ['lats', 'middle back', 'lower back', 'traps'], Shoulders: ['shoulders'],
  Biceps: ['biceps'], Triceps: ['triceps'], Forearms: ['forearms'],
  Quads: ['quadriceps'], Hamstrings: ['hamstrings'], Glutes: ['glutes', 'abductors', 'adductors'], Calves: ['calves'],
  Core: ['abdominals'],
};

// Only exercises the person can do: their equipment, their level or easier, real training (no stretches);
// with `groups`, only exercises whose primary muscle is in one of them.
export function candidates(all, p, groups = []) {
  const types = ['strength', 'powerlifting', ...(p.level === 'expert' ? ['olympic weightlifting'] : []), ...(['fatloss', 'tone'].includes(p.goal) ? ['plyometrics'] : [])];
  const muscles = groups.flatMap(g => MUSCLE_GROUPS[g] || []);
  return all.filter(e => p.equipment.includes(e.equipment) && (!gear(e) || p.equipment.includes(gear(e))) && types.includes(e.category)
    && LEVELS.indexOf(e.level) <= LEVELS.indexOf(p.level)
    && (!muscles.length || muscles.includes(e.primaryMuscles[0])));
}

// Programming rules from the 2026 ACSM resistance-training position stand and recent meta-analyses (see EVIDENCE.md).
// Shared by month plans and single routines. p.pace: 'best' (evidence-based rest) or 'quick' (shorter rest, more supersets).
function guide(p) {
  const quick = p.pace === 'quick', beginner = p.level === 'beginner';
  const goal = {
    strength: 'Goal strength: the lifts they care about early in each session, heavier loads, longer rest; 2-5 sets on those lifts.',
    muscle: 'Goal muscle: moderate reps, volume toward the upper end for the muscles they want most.',
    tone: 'Goal "toned" means some muscle gain plus fat loss: train like muscle gain at moderate volume.',
    fatloss: 'Goal fat loss: lifting here keeps muscle while they diet, so keep volume moderate rather than adding more; supersets of opposing muscles are welcome. Fat loss itself comes from diet and daily activity.',
  }[p.goal] || '';
  return `Programming rules (evidence-based; follow them):
- Volume: about ${beginner ? '6-10' : '10-16'} hard sets per muscle per week, counting a compound's secondary muscles as half a set. Spread it so each muscle is trained about twice a week where the schedule allows.
- Split: 2 days: full body. 3 days: full body or upper/lower. 4-6 days: upper/lower or push/pull/legs.${beginner ? ' Beginners: favour full body and stable, simple exercises (machines, dumbbells) while they learn technique.' : ''}
- Order: each day starts with the heaviest compound for its main muscle, then other compounds, then isolation. Across the week cover squat, hinge, horizontal and vertical push, horizontal and vertical pull, and core or a carry.
- Selection: favour full range of motion and exercises that load the muscle at long lengths (e.g. Romanian deadlift, incline curl, overhead triceps extension); add single-arm or single-leg work where useful.
- Sets: 2-4 per exercise.
- Rest (rest_seconds): ${quick
    ? 'time-efficient pace: heavy compounds 90-120, other compounds 60-90, isolation 45-60. Save time by pairing opposing muscles as supersets (e.g. press + row, curl + pushdown); never pair two exercises for the same muscle or grip.'
    : 'best-results pace: heavy compounds 120-180 (180+ for heavy strength sets), other compounds 90-120, isolation 60-90' + (p.goal === 'fatloss' ? ', supersets of opposing muscles 45-60' : '') + '. Longer rest on big lifts keeps reps and load up on later sets.'}
- Effort: most sets end 1-3 reps short of failure${beginner ? ' (beginners about 3 short while learning)' : ''}; never take heavy barbell lifts to failure.
- ${goal}
- why: give every exercise a "why" of at most 12 words saying why it is there and why that rest, e.g. "Main quad builder; long rest keeps reps up on heavy sets".`;
}

// One session focused on the chosen muscle groups. Same reply shape as a one-week plan, so parsePlan reads it.
export function routinePrompt(list, p, groups, minutes, about = '', history = '') {
  const g = GOALS[p.goal], count = Math.max(3, Math.min(9, Math.round(minutes / 9)));
  return [
    { role: 'system', content: 'You are an experienced strength coach. You build workouts using ONLY exercise ids from the list you are given, copied exactly. Reply with JSON only, no other text.' },
    { role: 'user', content: `Build ONE workout session focused on: ${groups.join(', ')}.
Goal: ${g.label} (${g.repMin}-${g.repMax} reps; the app sets reps, you choose exercises, set counts and rest).
About ${minutes} minutes: ${count} exercises. Experience: ${p.level}.${about ? `\nPerson: ${about}.` : ''}${p.avoid ? `\nAvoid or work around: ${p.avoid}.` : ''}
Session: split the work fairly between the chosen groups and hit each from different angles; give the session a short name (e.g. "Chest & Triceps"). Mark supersets with superset_with_next on the first exercise of each pair.
${guide(p)}
Exercises marked "timed" are holds measured in seconds: give them "seconds" per set instead of reps.${history ? `
What they did before (favour lifts that are progressing, and you may vary stalled ones):
${history}` : ''}
Reply exactly in this shape:
{"days":[{"name":"Chest & Triceps","exercises":[{"id":"<id from the list>","sets":3,"rest_seconds":150,"superset_with_next":false,"why":"Main chest builder; long rest keeps heavy reps up"}]}],"notes":"1-2 sentences on the session"}

Exercises (id | primary muscle | equipment | mechanic | timed?):
${list.map(e => `${e.id} | ${e.primaryMuscles[0] || ''} | ${e.equipment} | ${e.mechanic || ''}${isTimed(e) ? ' | timed' : ''}`).join('\n')}` },
  ];
}

// A month (4 weeks) in one request. Each day keeps its muscle slots all month; the exercise in a slot can change week to week.
export function planPrompt(list, p, about = '', history = '') {
  const g = GOALS[p.goal], perDay = Math.max(3, Math.min(9, Math.round(p.minutes / 9)));
  return [
    { role: 'system', content: 'You are an experienced strength coach. You build monthly training plans using ONLY exercise ids from the list you are given, copied exactly. Reply with JSON only, no other text.' },
    { role: 'user', content: `Build a 4-week training plan (one month).
Goal: ${g.label} (${g.repMin}-${g.repMax} reps; the app sets reps, you choose exercises, set counts and rest).
Training days per week: ${p.days}. Minutes per session: ${p.minutes} (about ${perDay} exercises a day).
Experience: ${p.level}.${about ? `\nPerson: ${about}.` : ''}${p.avoid ? `\nAvoid or work around: ${p.avoid}.` : ''}
Structure: every week has the same ${p.days} days with the same names, and each day has the same slots in the same order. A slot works the same primary muscle all month. Keep each day's main compound lifts the same all month so progress can be tracked; rotate the accessory slots every week or two to a different exercise for the same muscle (another angle, tool or grip), so the month works each muscle more completely. Week 4 is a deload: the same exercises as week 3 with about half the sets, sets ending 3 or more reps short of failure. Name each day briefly (e.g. "Upper A", "Legs"). Mark supersets with superset_with_next on the first exercise of each pair.
${guide(p)}
Exercises marked "timed" are holds measured in seconds, not reps: give them "seconds" per set (e.g. 30-60) instead.${history ? `
What they did before. Use it: keep or bring back exercises that progressed, rotate out ones that stalled, and you may reuse older exercises from earlier months:
${history}` : ''}
Reply exactly in this shape, with 4 entries in "weeks":
{"weeks":[{"days":[{"name":"Upper A","exercises":[{"id":"<id from the list>","sets":3,"rest_seconds":150,"superset_with_next":false,"why":"Main press; long rest keeps heavy reps up"},{"id":"<a timed id>","sets":3,"seconds":45,"rest_seconds":60,"superset_with_next":false,"why":"Core bracing for heavier lifts"}]}]}],"notes":"2-3 sentences on how the month is built and how to progress"}

Exercises (id | primary muscle | equipment | mechanic | timed?):
${list.map(e => `${e.id} | ${e.primaryMuscles[0] || ''} | ${e.equipment} | ${e.mechanic || ''}${isTimed(e) ? ' | timed' : ''}`).join('\n')}` },
  ];
}

// Turns the model's reply into 4 weeks of days, keeping only exercises that exist. Short replies are padded by
// repeating the last week; a plain {"days":[...]} reply is treated as one week.
export function parsePlan(text, lib) {
  let json;
  try { json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
  catch { throw new Error('The AI didn\'t send back a readable plan. Try again.'); }
  const lower = Object.fromEntries(Object.values(lib).flatMap(e => [[e.id.toLowerCase(), e.id], [e.name.toLowerCase(), e.id]]));
  let dropped = 0;
  const parseDays = days => (Array.isArray(days) ? days : []).map(d => {
    const items = (Array.isArray(d?.exercises) ? d.exercises : []).flatMap(x => {
      const id = lib[x?.id] ? x.id : lower[String(x?.id ?? '').toLowerCase()];
      if (!id) { dropped++; return []; }
      const item = { exId: id, sets: Math.max(1, Math.min(6, parseInt(x.sets) || 3)), ss: !!x.superset_with_next, rest: snapRest(x.rest_seconds) };
      if (x.why) item.why = String(x.why).slice(0, 100); // shown in the preview only
      if (isTimed(lib[id])) {
        const s = Math.max(10, Math.min(600, parseInt(x.seconds) || TIME_RANGE.repMin));
        Object.assign(item, { timed: true, repMin: s, repMax: s + 15 });
      }
      return [item];
    });
    if (items.length) items.at(-1).ss = false; // nothing after the last exercise to superset with
    return { name: String(d?.name || 'Day').slice(0, 40), items };
  }).filter(d => d.items.length);
  const weeks = (Array.isArray(json.weeks) ? json.weeks.slice(0, 4).map(w => parseDays(w?.days)) : [parseDays(json.days)]).filter(w => w.length);
  if (!weeks.length) throw new Error('The AI\'s plan didn\'t use any exercises from the library. Try again.');
  while (weeks.length < 4) weeks.push(structuredClone(weeks.at(-1)));
  return { weeks, notes: String(json.notes || ''), dropped };
}
