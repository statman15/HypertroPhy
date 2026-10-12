// free-exercise-db, pinned to one commit so photo URLs never change under the cache.
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/';

export const photo = path => CDN + path;
export const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());

export async function load() {
  const list = await (await fetch('data/exercises.json')).json();
  for (const e of list) e.equipment ||= 'none';
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// Every search word must appear in the name. Muscles and equipment are any-of lists (empty = all);
// muscle matches the primary muscle only, like Hevy.
export function filter(list, { q = '', muscles = [], equip = [] }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(e =>
    (!muscles.length || e.primaryMuscles.some(m => muscles.includes(m))) &&
    (!equip.length || equip.includes(e.equipment)) &&
    words.every(w => e.name.toLowerCase().includes(w)));
}

export const values = (list, key) => [...new Set(list.flatMap(e => e[key]))].sort();

// Held for time rather than counted in reps: isometric holds and stretches (force "static"), cardio, carries.
export const isTimed = e => !!e && (e.force === 'static' || e.category === 'cardio' || /farmer|carry|yoke walk|wall sit/i.test(e.name));
