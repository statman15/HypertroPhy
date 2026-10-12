// free-exercise-db, pinned to one commit so photo URLs never change under the cache.
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/';

export const photo = path => CDN + path;
export const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());

export async function load() {
  const list = await (await fetch('data/exercises.json')).json();
  for (const e of list) e.equipment ||= 'none';
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// Every search word must appear in the name; muscle matches the primary muscle only, like Hevy.
export function filter(list, { q = '', muscle = '', equip = '' }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(e =>
    (!muscle || e.primaryMuscles.includes(muscle)) &&
    (!equip || e.equipment === equip) &&
    words.every(w => e.name.toLowerCase().includes(w)));
}

export const values = (list, key) => [...new Set(list.flatMap(e => e[key]))].sort();
