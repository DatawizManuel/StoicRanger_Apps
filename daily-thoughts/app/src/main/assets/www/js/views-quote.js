/* Stoic Ranger - Daily Thoughts — Quote of the day, the quote one-pager, favourites, share and print. */
'use strict';
(() => {
const { $, $$, esc } = DT;
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const TR = 'English rendering by Stoic Ranger, based on the original text.';

/** Size class for the quote: long quotes get a smaller type size. */
const sizeCls = q => { const L = DT.quoteText(q).length; return L > 260 ? 'l3' : L > 150 ? 'l2' : L > 80 ? 'l1' : ''; };
const favBtn = id => { const on = DT.isFav(id); return `<button type="button" class="fav" data-fav="${id}" aria-pressed="${on}">${STAR}<span>${on ? 'Saved' : 'Favourite'}</span></button>`; };
const wireFav = el => $$('[data-fav]', el).forEach(b => b.onclick = () => {
  const on = DT.toggleFav(b.dataset.fav);
  b.setAttribute('aria-pressed', on); b.lastChild.textContent = on ? 'Saved' : 'Favourite';
  DT.toast(on ? 'Saved to Favourites.' : 'Removed from Favourites.');
});

/** The one-pager: quote, citation row, context with the round coin, event, practice, author card, source. */
DT.onePager = (q, { eyebrow = '', nav = true } = {}) => {
  const a = DT.author(q.a), list = a.quotes, k = list.indexOf(q.id);
  const ev = q.e ? `<div class="event"><span class="when">${esc(q.e.when)}</span><h3>${esc(q.e.title)}</h3><p>${esc(q.e.text)}</p></div>` : '';
  const prv = k > 0 ? list[k - 1] : null, nxt = k + 1 < list.length ? list[k + 1] : null;
  return `<article class="one">
    <div class="quote">
      <div class="eyebrow">${eyebrow || `${esc(a.name)} · ${k + 1} of ${list.length}`}</div>
      <blockquote class="${sizeCls(q)}">${q.q.map(x => `<p>${esc(x)}</p>`).join('')}</blockquote>
      <div class="cite"><a class="author" href="#/author/${a.slug}">${esc(a.name)}</a><span class="src">${esc(q.ref)}</span>${favBtn(q.id)}</div>
    </div>
    <section><h2>In context</h2><div class="context">
      <a class="ccoin" href="#/author/${a.slug}" aria-label="Author page: ${esc(a.name)}">${DT.coin(a.slug)}</a>
      <div class="txt">${q.c.map(x => `<p>${esc(x)}</p>`).join('')}${ev}</div></div></section>
    <section class="practice" aria-label="Practice"><span class="lbl">Carry it through the day</span><p>${esc(q.p)}</p></section>
    <section><h2>The author</h2><div class="acard"><p>${esc(a.bio)}</p><a class="btn" href="#/author/${a.slug}">Author page: ${esc(a.name)}</a></div></section>
    <div class="notes"><p>Source: ${esc(a.name)}, ${esc(q.ref)}. ${esc(q.t || TR)}${q.s ? ' ' + esc(q.s) : ''}</p></div>
    <div class="row">
      <button class="btn sm" data-share="${q.id}">Share</button>
      <button class="btn sm" data-print="${q.id}">Print / PDF</button>
    </div>
    ${nav ? `<div class="pn">${prv ? `<a href="#/q/${prv}">← Previous</a>` : '<span></span>'}${nxt ? `<a href="#/q/${nxt}">Next →</a>` : '<span></span>'}</div>` : ''}
  </article>`;
};
const wireOne = el => {
  wireFav(el);
  $$('[data-share]', el).forEach(b => b.onclick = () => DT.shareQuote(DT.quote(b.dataset.share)));
  $$('[data-print]', el).forEach(b => b.onclick = () => DT.printQuote(DT.quote(b.dataset.print)));
};

DT.shareQuote = q => {
  const a = DT.author(q.a);
  DT.shareText(`${a.name}, ${q.ref}`, `“${DT.quoteText(q)}”\n— ${a.name}, ${q.ref}\n\nCarry it through the day: ${q.p}\n\nStoic Ranger · Daily Thoughts`);
};

/** A4 one-pager for the printer or "Save as PDF" (the print view runs without scripts: coin and styles inline). */
DT.printQuote = async q => {
  const a = DT.author(q.a);
  await DT.loadCoin(a.slug);
  const css = await fetch('css/print.css').then(r => r.text()).catch(() => '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${esc(new URL('.', location.href).href)}"><title>${esc(a.name)} - ${esc(q.ref)}</title><style>${css}</style></head><body>
  <svg width="0" height="0" style="position:absolute">${DT.SPRITE}${DT._coinSrc[a.slug] || ''}</svg>
  <div class="page">
    <header><span class="brand">Stoic Ranger · Daily Thoughts</span><span class="when">${esc(DT.dayLabel())}</span></header>
    <blockquote class="${sizeCls(q)}">${q.q.map(x => `<p>${esc(x)}</p>`).join('')}</blockquote>
    <div class="cite"><b>${esc(a.name)}</b> · ${esc(q.ref)}</div>
    <div class="context"><svg class="coin" viewBox="0 0 240 240"><use href="#coin-${a.slug}"/></svg><div>${q.c.map(x => `<p>${esc(x)}</p>`).join('')}
    ${q.e ? `<div class="event"><span class="when">${esc(q.e.when)}</span><h3>${esc(q.e.title)}</h3><p>${esc(q.e.text)}</p></div>` : ''}</div></div>
    <div class="practice"><span>Carry it through the day</span><p>${esc(q.p)}</p></div>
    <p class="notes">Source: ${esc(a.name)}, ${esc(q.ref)}. ${esc(q.t || TR)}${q.s ? ' ' + esc(q.s) : ''}</p>
    <footer><span>${esc(a.name)} · ${esc(a.dates)}</span><span>Impedimentum · fit · via</span></footer>
  </div></body></html>`;
  DT.print(html, `Daily Thoughts - ${a.name} - ${q.ref}`);
};

/* ---------- Today: Quote of the day, then the Authors and earlier days ---------- */
DT.views.today = {
  render(el) {
    DT.header('Daily Thoughts');
    const q = DT.quoteOfDay();
    const earlier = [1, 2, 3, 4, 5, 6].map(n => [n, DT.quoteOfDay(-n)]);
    el.innerHTML = `
      ${DT.onePager(q, { eyebrow: `<span>Quote of the day</span><span class="mono">${esc(DT.dayLabel())}</span>`, nav: false })}
      <section class="below">
        <h2>Authors <small class="mono">${DT.AUTHORS.length}</small></h2>
        <div class="cgrid">${DT.AUTHORS.map(DT.authorCard).join('')}</div>
        <h2>Earlier days</h2>
        <div class="list">${earlier.map(([n, x]) => DT.quoteItem(x, n === 1 ? 'Yesterday' : DT.dayLabel(-n))).join('')}</div>
        <div class="row"><a class="btn" href="#/random" data-random>Another thought</a></div>
      </section>`;
    wireOne(el);
    $('[data-random]', el).onclick = e => { e.preventDefault(); DT.go('#/q/' + DT.QUOTES[Math.floor(Math.random() * DT.QUOTES.length)].id); };
  },
};

/** Quote line for lists: text, author and source, star when it is a favourite. */
DT.quoteItem = (q, date = '', coin = true) => {
  const a = DT.author(q.a);
  return `<a class="qitem" href="#/q/${q.id}">${coin ? DT.coin(a.slug, 'sm') : ''}<div class="main">${date ? `<div class="date">${esc(date)}</div>` : ''}<div class="q">${esc(DT.quoteText(q))}</div><div class="r">${esc(a.name)} · ${esc(q.ref)}${DT.isFav(q.id) ? ' <span class="star">★</span>' : ''}</div></div></a>`;
};
DT.views.q = {
  tab: 'authors',
  render(el, [id]) {
    const q = DT.quote(id);
    if (!q) { DT.header('Quote', { back: true }); el.innerHTML = '<div class="empty">This quote is no longer in the app.</div>'; return; }
    const a = DT.author(q.a);
    DT.header(a.name, { back: true });
    DT.tabNow = DT.quoteOfDay().id === id ? 'today' : DT.isFav(id) && /favourites/.test(DT.prevHash || '') ? 'favourites' : 'authors';
    el.innerHTML = DT.onePager(q);
    wireOne(el);
  },
};

/* ---------- Favourites ---------- */
DT.views.favourites = {
  render(el) {
    DT.header('Favourites');
    const favs = DT.db.favs.slice().reverse(), list = favs.map(f => DT.quote(f.id)).filter(Boolean), gone = favs.length - list.length;
    el.innerHTML = `
      <p class="note">Saved on this phone, newest first. Tap Favourite on any quote to keep it here.</p>
      <div class="list">${list.map(q => DT.quoteItem(q)).join('') || '<div class="empty">No favourites yet. Open a quote and tap <b>☆ Favourite</b>.</div>'}</div>
      ${gone ? `<p class="note">${gone} saved quote${gone === 1 ? ' is' : 's are'} not in this app version; ${gone === 1 ? 'it stays' : 'they stay'} saved and come back if the quote returns.</p>` : ''}
      ${list.length ? `<div class="row"><button class="btn sm" id="fShare">Share the list</button></div>` : ''}`;
    const s = $('#fShare', el);
    if (s) s.onclick = () => DT.shareText('Daily Thoughts favourites', list.map(q => `“${DT.quoteText(q)}”\n— ${DT.author(q.a).name}, ${q.ref}`).join('\n\n') + '\n\nStoic Ranger · Daily Thoughts');
  },
};
})();
