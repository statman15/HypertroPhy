export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const num = n => String(Math.round(n * 10) / 10);
export const day = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const icon = id => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export const REST = [0, 30, 45, 60, 90, 120, 180, 240, 300];
export const restOptions = cur => REST.map(s => `<option value="${s}"${s === +cur ? ' selected' : ''}>${s ? 'Rest ' + clock(s * 1000) : 'No rest'}</option>`).join('');

// One bottom sheet, reused by every screen.
export function sheet(html) {
  const d = $('#sheet');
  $('#sheetBody').innerHTML = html;
  $('#sheetBody').onclick = null; // drop the last sheet's handler
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  return $('#sheetBody');
}
export const closeSheet = () => $('#sheet').close();
