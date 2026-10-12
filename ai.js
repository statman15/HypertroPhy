// One OpenAI-compatible connection (OmniRoute, Gemini, or anything else that speaks /chat/completions).
// Address, key and model live in settings.ai on this phone only.
import { db } from './store.js';
import { GOALS, TIME_RANGE } from './progression.js';
import { isTimed } from './exercises.js';

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
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'bands', 'body only', 'e-z curl bar', 'medicine ball', 'exercise ball', 'other'];

// Only exercises the person can do: their equipment, their level or easier, real training (no stretches).
export function candidates(all, p) {
  const types = ['strength', 'powerlifting', ...(p.level === 'expert' ? ['olympic weightlifting'] : []), ...(['fatloss', 'tone'].includes(p.goal) ? ['plyometrics'] : [])];
  return all.filter(e => p.equipment.includes(e.equipment) && types.includes(e.category)
    && LEVELS.indexOf(e.level) <= LEVELS.indexOf(p.level));
}

export function planPrompt(list, p, about = '') {
  const g = GOALS[p.goal], perDay = Math.max(3, Math.min(9, Math.round(p.minutes / 9)));
  return [
    { role: 'system', content: 'You are an experienced strength coach. You build weekly training plans using ONLY exercise ids from the list you are given, copied exactly. Reply with JSON only, no other text.' },
    { role: 'user', content: `Build a weekly plan.
Goal: ${g.label} (${g.repMin}-${g.repMax} reps; the app sets reps, you choose exercises, set counts and rest).
Training days per week: ${p.days}. Minutes per session: ${p.minutes} (about ${perDay} exercises a day).
Experience: ${p.level}.${about ? `
Person: ${about}.` : ''}${p.avoid ? `\nAvoid or work around: ${p.avoid}.` : ''}
Rules: cover every major muscle group across the week; big compound lifts first in a day; 2-5 sets each;${p.goal === 'fatloss' ? ' pair exercises into supersets (set superset_with_next on the first of each pair);' : ''} name each day briefly (e.g. "Upper A", "Legs").
Rest: give every exercise rest_seconds (30-300) suited to it and to this goal (typical for the goal: about ${g.rest}s). Heavy compound lifts need more (around 120-180 for strength work), isolation work and supersets less (around 45-75).
Exercises marked "timed" are holds measured in seconds, not reps: give them "seconds" per set (e.g. 30-60) instead.
Reply exactly in this shape:
{"days":[{"name":"Upper A","exercises":[{"id":"<id from the list>","sets":3,"rest_seconds":90,"superset_with_next":false},{"id":"<a timed id>","sets":3,"seconds":45,"rest_seconds":60,"superset_with_next":false}]}],"notes":"2-3 sentences on how the week is split and how to progress"}

Exercises (id | primary muscle | equipment | mechanic | timed?):
${list.map(e => `${e.id} | ${e.primaryMuscles[0] || ''} | ${e.equipment} | ${e.mechanic || ''}${isTimed(e) ? ' | timed' : ''}`).join('\n')}` },
  ];
}

// Turns the model's reply into routines' worth of days, keeping only exercises that exist.
export function parsePlan(text, lib) {
  let json;
  try { json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
  catch { throw new Error('The AI didn\'t send back a readable plan. Try again.'); }
  const lower = Object.fromEntries(Object.values(lib).flatMap(e => [[e.id.toLowerCase(), e.id], [e.name.toLowerCase(), e.id]]));
  let dropped = 0;
  const days = (Array.isArray(json.days) ? json.days : []).map(d => {
    const items = (Array.isArray(d.exercises) ? d.exercises : []).flatMap(x => {
      const id = lib[x?.id] ? x.id : lower[String(x?.id ?? '').toLowerCase()];
      if (!id) { dropped++; return []; }
      const item = { exId: id, sets: Math.max(1, Math.min(6, parseInt(x.sets) || 3)), ss: !!x.superset_with_next, rest: snapRest(x.rest_seconds) };
      if (isTimed(lib[id])) {
        const s = Math.max(10, Math.min(600, parseInt(x.seconds) || TIME_RANGE.repMin));
        Object.assign(item, { timed: true, repMin: s, repMax: s + 15 });
      }
      return [item];
    });
    if (items.length) items.at(-1).ss = false; // nothing after the last exercise to superset with
    return { name: String(d.name || 'Day').slice(0, 40), items };
  }).filter(d => d.items.length);
  if (!days.length) throw new Error('The AI\'s plan didn\'t use any exercises from the library. Try again.');
  return { days, notes: String(json.notes || ''), dropped };
}
