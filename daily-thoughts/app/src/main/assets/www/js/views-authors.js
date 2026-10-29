/* Stoic Ranger - Daily Thoughts — Authors (coin grid, quote search) and the author page. */
'use strict';
(() => {
const { $, esc } = DT;
const GROUPS = [['Stoics', 'The Stoa, from Zeno to Marcus Aurelius.'], ['Other authors', 'Thinkers and strategists the Stoics would have argued with, learned from or recognised.']];

DT.authorCard = a => `<a class="acoin" href="#/author/${a.slug}">${DT.coin(a.slug)}<span class="nm">${esc(a.name)}</span><span class="dt">${esc(a.dates)}</span></a>`;

DT.views.authors = {
  render(el, parts, { q = '' }) {
    DT.header('Authors');
    el.innerHTML = `
      <p class="lead">Every voice behind the daily thoughts, each with its own Stoic Ranger coin. Pick an author for their life story and all of their quotes.</p>
      <input type="search" class="search" id="aq" placeholder="Search ${DT.QUOTES.length} quotes" value="${esc(q)}" autocomplete="off">
      <div id="aRes"></div>
      <div id="aGrid">${GROUPS.map(([g, intro]) => `<h2>${g} <small class="mono">${DT.AUTHORS.filter(a => a.group === g).length}</small></h2><p class="note">${intro}</p>
        <div class="cgrid">${DT.AUTHORS.filter(a => a.group === g).map(DT.authorCard).join('')}</div>`).join('')}</div>`;
    const inp = $('#aq', el), res = $('#aRes', el), grid = $('#aGrid', el);
    const run = () => {
      const t = inp.value.trim().toLowerCase();
      history.replaceState(null, '', '#/authors' + (t ? '?q=' + encodeURIComponent(inp.value.trim()) : ''));
      grid.hidden = !!t;
      if (!t) { res.innerHTML = ''; return; }
      const words = t.split(/\s+/);
      const hit = DT.QUOTES.filter(x => { const a = DT.author(x.a), s = (DT.quoteText(x) + ' ' + x.ref + ' ' + a.name + ' ' + x.c.join(' ') + ' ' + x.p).toLowerCase(); return words.every(w => s.includes(w)); });
      const au = DT.AUTHORS.filter(a => words.every(w => (a.name + ' ' + a.school + ' ' + a.origin).toLowerCase().includes(w)));
      res.innerHTML = (au.length ? `<div class="cgrid">${au.map(DT.authorCard).join('')}</div>` : '') +
        `<h2>Quotes <small class="mono">${hit.length}</small></h2><div class="list">${hit.slice(0, 60).map(x => DT.quoteItem(x)).join('') || '<div class="empty">No quote matches.</div>'}</div>` +
        (hit.length > 60 ? `<p class="note">Showing 60 of ${hit.length}. Add a word to narrow the search.</p>` : '');
    };
    inp.oninput = DT.debounce(run, 200);
    if (q) run();
  },
};

DT.views.author = {
  tab: 'authors',
  render(el, [slug]) {
    const a = DT.author(slug);
    DT.header(a ? a.name : 'Author', { back: true });
    if (!a) { el.innerHTML = '<div class="empty">Unknown author.</div>'; return; }
    const qs = a.quotes.map(DT.quote).filter(Boolean);
    el.innerHTML = `
      <div class="ahero">${DT.coin(a.slug, 'big')}
        <div class="who"><div class="eyebrow">${esc(a.school)}</div><h1 class="aname">${esc(a.name)}</h1><div class="src">${esc(a.dates)} · ${esc(a.origin)}</div></div></div>
      <p class="lead">${esc(a.bio)}</p>
      <h2>Life</h2>
      <div class="facts"><div><span class="l">Born</span><div class="v">${esc(a.born)}</div></div><div><span class="l">Died</span><div class="v">${esc(a.died)}</div></div><div><span class="l">From</span><div class="v">${esc(a.origin)}</div></div><div><span class="l">School</span><div class="v">${esc(a.school)}</div></div></div>
      <div class="bio">${a.life.map(s => `<h3>${esc(s.h)}</h3>${s.p.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>
      <h2>Quotes <small class="mono">${qs.length}</small></h2>
      <div class="list">${qs.map(q => DT.quoteItem(q, '', false)).join('') || '<div class="empty">No surviving words of his own are known. The life story above tells what ancient writers report about him.</div>'}</div>
      <p class="note credit">${a.credit}</p>`;
  },
};
})();
