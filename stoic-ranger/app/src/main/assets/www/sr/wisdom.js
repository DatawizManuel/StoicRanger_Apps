/* Stoic Ranger home page — today's thought from the Daily Thoughts part (same quote, same day change). */
'use strict';
(() => {
const D = window.DT;
if (!D || !Array.isArray(D.QUOTES) || !Array.isArray(D.DAY_ORDER) || !D.DAY_ORDER.length) return;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dayNo = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);
const today = () => {
  const n = D.DAY_ORDER.length, id = D.DAY_ORDER[((dayNo() % n) + n) % n];
  return D.QUOTES.find(q => q.id === id) || null;
};
window.SRWisdom = {
  day: dayNo,
  card() {
    const q = today();
    if (!q) return '';
    const a = (D.AUTHORS || []).find(x => x.slug === q.a) || { name: '' };
    return `<a class="srwis" href="thoughts/index.html#/today"><div class="k">Today's thought</div>
      <blockquote>${esc(q.q.join(' '))}</blockquote>
      <div class="r">${esc(a.name)}${q.ref ? ' · ' + esc(q.ref) : ''}</div></a>`;
  },
};
})();
