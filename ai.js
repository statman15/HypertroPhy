// One OpenAI-compatible connection (OmniRoute, Gemini, or anything else that speaks /chat/completions).
// Address, key and model live in settings.ai on this phone only.
import { db } from './store.js';
import { GOALS } from './progression.js';

export const PRESETS = {
  omniroute: { label: 'OmniRoute', url: '', hint: 'OmniRoute\'s HTTPS address from Tailscale Serve, ending in /v1. This phone must be on Tailscale.' },
  gemini: { label: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', hint: 'Free key from aistudio.google.com → Get API key.' },
  other: { label: 'Other', url: '', hint: 'Any OpenAI-compatible address, ending in /v1.' },
};

// settings.ai = { preset, omniroute: {url,key,model}, gemini: {...}, other: {...} }: switching services keeps each one's key.
export const conn = () => { const a = db.settings.ai; return a?.[a.preset] || {}; };

const host = url => { try { return new URL(url).host; } catch { return url; } };

async function call(path, body) {
  const { url, key } = conn();
  if (!url || !key) throw new Error('Set up the AI connection in Settings first.');
  let res;
  try {
    res = await fetch(url.replace(/\/+$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'The AI took too long to answer. Try again.'
      : `Couldn't reach ${host(url)}. Check the address (it must start with https://), and for OmniRoute that this phone is on Tailscale.`);
  }
  if (res.status === 401 || res.status === 403) throw new Error('The AI service rejected the key. Check it in Settings.');
  if (!res.ok) throw new Error(`The AI service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const models = async () => (await call('/models')).data.map(m => m.id.replace(/^models\//, ''))
  .filter(id => !/embed|imagen|veo|tts|aqa|vision|image/.test(id)).sort();

export async function chat(messages) {
  const r = await call('/chat/completions', { model: conn().model, messages });
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

export function planPrompt(list, p) {
  const g = GOALS[p.goal], perDay = Math.max(3, Math.min(9, Math.round(p.minutes / 9)));
  return [
    { role: 'system', content: 'You are an experienced strength coach. You build weekly training plans using ONLY exercise ids from the list you are given, copied exactly. Reply with JSON only, no other text.' },
    { role: 'user', content: `Build a weekly plan.
Goal: ${g.label} (${g.repMin}-${g.repMax} reps, ${g.rest}s rest; the app sets reps and rest, you choose exercises and set counts).
Training days per week: ${p.days}. Minutes per session: ${p.minutes} (about ${perDay} exercises a day).
Experience: ${p.level}.${p.avoid ? `\nAvoid or work around: ${p.avoid}.` : ''}
Rules: cover every major muscle group across the week; big compound lifts first in a day; 2-5 sets each;${p.goal === 'fatloss' ? ' pair exercises into supersets (set superset_with_next on the first of each pair);' : ''} name each day briefly (e.g. "Upper A", "Legs").
Reply exactly in this shape:
{"days":[{"name":"Upper A","exercises":[{"id":"<id from the list>","sets":3,"superset_with_next":false}]}],"notes":"2-3 sentences on how the week is split and how to progress"}

Exercises (id | primary muscle | equipment | mechanic):
${list.map(e => `${e.id} | ${e.primaryMuscles[0] || ''} | ${e.equipment} | ${e.mechanic || ''}`).join('\n')}` },
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
      return [{ exId: id, sets: Math.max(1, Math.min(6, parseInt(x.sets) || 3)), ss: !!x.superset_with_next }];
    });
    if (items.length) items.at(-1).ss = false; // nothing after the last exercise to superset with
    return { name: String(d.name || 'Day').slice(0, 40), items };
  }).filter(d => d.items.length);
  if (!days.length) throw new Error('The AI\'s plan didn\'t use any exercises from the library. Try again.');
  return { days, notes: String(json.notes || ''), dropped };
}
