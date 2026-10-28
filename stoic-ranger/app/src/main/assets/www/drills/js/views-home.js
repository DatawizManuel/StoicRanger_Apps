/* Stoic Ranger - Shooting Drills — home (drill of the day, library overview, favourites, recent results)
   and the printables gallery. */
'use strict';
(() => {
const { $, $$, esc } = SD;

SD.views.home = {
  render(el) {
    SD.header('Shooting Drills');
    const dod = SD.drillOfDay(), favs = SD.db.favs.map(SD.drill).filter(Boolean);
    const res = SD.db.results.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
    const month = SD.today().slice(0, 7), thisMonth = res.filter(r => (r.date || '').startsWith(month)).length;
    const count = (w, m, t) => SD.DRILLS.filter(d => d.weapon === w && d.motion === m && d.timed === t).length;
    el.innerHTML = `
      <div class="brandbar">${SD.logo('dlogo')}<div><div class="bt">Stoic Ranger</div><div class="bs">Shooting Drills · ${SD.DRILLS.length} drills · ${SD.PRINTABLES.length} printables</div></div></div>
      <h2>Drill of the day</h2>
      <div class="list">${SD.drillCard(dod)}</div>
      <div class="tiles">
        <div class="tile"><div class="l">Results logged</div><div class="v">${res.length}</div><div class="s">${thisMonth} this month</div></div>
        <div class="tile"><div class="l">Drills tried</div><div class="v">${new Set(res.map(r => r.drillId)).size}<small> / ${SD.DRILLS.length}</small></div><div class="s">${res.filter(r => r.pass === true).length} passed runs</div></div>
      </div>
      <h2>Library</h2>
      <div class="grid8">${['pistol', 'rifle'].map(w => `<div class="gcol"><div class="ghead">${w === 'pistol' ? 'Pistol' : 'Rifle'}</div>${[['static', true], ['static', false], ['dynamic', true], ['dynamic', false]].map(([m, t]) =>
        `<a class="gcell" href="javascript:void 0" data-f="${w}|${m}|${t ? 'timed' : 'untimed'}"><span>${m === 'static' ? 'Static' : 'Dynamic'} · ${t ? 'timed' : 'not timed'}</span><b>${count(w, m, t)}</b></a>`).join('')}</div>`).join('')}</div>
      <div class="row"><a class="btn" href="javascript:void 0" data-fire="dry">Dry fire drills (${SD.DRILLS.filter(d => d.dry).length})</a><a class="btn" href="javascript:void 0" data-fire="live">Live fire drills (${SD.DRILLS.filter(d => d.live).length})</a></div>
      <h2>Favourites <small class="mono">${favs.length}</small></h2>
      <div class="list">${favs.map(SD.drillCard).join('') || '<div class="empty">Tap ☆ on a drill to keep it here.</div>'}</div>
      <h2>Recent results</h2>
      <div class="list">${res.slice(0, 5).map(r => { const d = SD.drill(r.drillId); return d ? `<div class="item" data-href="#/drill/${d.id}"><div class="main"><div class="date">${esc(SD.fmtDate(r.date))} · ${r.mode === 'dry' ? 'dry' : 'live'}</div><div class="t">${esc(d.name)}</div><div class="kvs"><span>${esc(SD.resultText(d, r))}</span>${r.shooterId ? `<span>${esc(SD.nameOf('shooters', r.shooterId))}</span>` : ''}</div></div></div>` : ''; }).join('') || '<div class="empty">No results yet. Open a drill and tap <b>Log a result</b>.</div>'}</div>`;
    const f = SD.db.settings.filter;
    $$('[data-f]', el).forEach(a => a.onclick = () => { const [w, m, t] = a.dataset.f.split('|'); Object.assign(f, SD.emptyFilter(), { weapon: w, motion: m, timed: t }); SD.save(); SD.go('#/drills'); });
    $$('[data-fire]', el).forEach(a => a.onclick = () => { Object.assign(f, SD.emptyFilter(), { fire: a.dataset.fire }); SD.save(); SD.go('#/drills'); });
    $$('.item[data-href]', el).forEach(it => it.onclick = () => SD.go(it.dataset.href));
  },
};

SD.views.printables = {
  render(el, [id]) {
    if (id) return one(el, id);
    SD.header('Printables');
    el.innerHTML = `<p class="note">Own target designs with the Stoic Ranger emblem, free for personal training use. Print at 100 % (actual size); the 100 mm bar on each sheet lets you check the scale.</p>
      <div class="pgrid">${SD.PRINTABLES.map(p => `<a class="pcard" href="#/printables/${p.id}"><div class="pthumb">${SD.printableSvg(p.id, { cls: 'thumb' })}</div><div class="pn">${esc(p.name)}</div><div class="pu">${SD.drillsUsing(p.id).length} drills</div></a>`).join('')}</div>`;
  },
};
function one(el, id) {
  const p = SD.printable(id);
  SD.header(p ? p.name : 'Printable', { back: true, actions: p ? '<button class="ib" id="pPrint" aria-label="Print">⎙</button>' : '' });
  if (!p) { el.innerHTML = '<div class="empty">Unknown printable.</div>'; return; }
  const used = SD.drillsUsing(id);
  el.innerHTML = `<p class="lead">${esc(p.desc)}</p>
    <div class="psheet">${SD.printableSvg(id, { cls: 'sheet' })}</div>
    <div class="stack"><button class="btn pri big" id="pPrint2">⎙ Print or save as PDF</button></div>
    <p class="note">In the print dialog choose A4 and 100 % / actual size (no "fit to page").</p>
    <h2>Used by ${used.length} drill${used.length === 1 ? '' : 's'}</h2><div class="list">${used.map(SD.drillCard).join('')}</div>`;
  $('#pPrint').onclick = $('#pPrint2', el).onclick = () => SD.printPrintable(id);
}
})();
