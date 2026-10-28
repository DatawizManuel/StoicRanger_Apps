/* Stoic Ranger — optional Claude: image reading (handwritten sheets, target holes) and online look-up of targets, guns, ammo.
   Uses the user's own Anthropic API key, stored only on this device. Images are sent to Anthropic only
   when the user taps a "with Claude" button. For a Play release this should move behind a backend. */
'use strict';
(() => {
RB.claude = {
  key: () => RB.secret.get('anthropicKey'),
  ready: () => !!RB.secret.get('anthropicKey'),
  model: () => RB.db.settings.claudeModel || 'claude-opus-5-5',

  /** Shrink a canvas/image to a JPEG for upload (long side ≤ 1568 px keeps detail and cost sensible). */
  async jpeg(canvas, max = 1568) {
    const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return { b64: c.toDataURL('image/jpeg', .9).split(',')[1], scale: s, w: c.width, h: c.height };
  },

  /** Ask for a JSON answer about one image. Returns the parsed object. */
  async json(prompt, img, { effort = 'medium' } = {}) {
    const key = RB.claude.key();
    if (!key) throw new Error('Add your Anthropic API key under More › Claude first.');
    const model = RB.claude.model();
    const body = {
      model, max_tokens: 16000,
      output_config: { effort },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.b64 } },
        { type: 'text', text: prompt },
      ] }],
    };
    const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };
    if (/opus-5|sonnet-5-5|fable-5/.test(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    let r;
    try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('No connection to Claude. Check the internet connection.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && j.error.message) || r.statusText;
      if (r.status === 401) throw new Error('The API key was rejected. Check it under More › Claude.');
      if (r.status === 429) throw new Error('Rate limit reached. Try again in a minute.');
      throw new Error(`Claude error ${r.status}: ${m}`);
    }
    if (j.stop_reason === 'refusal') throw new Error('Claude declined to read this image.');
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Claude did not return readable data. Try a sharper photo.');
    return JSON.parse(text.slice(a, b + 1));
  },

  /** Look up a target, gun or ammunition on the web (Claude web search) and return the fields as JSON, in metric units.
      Returns { fields: {key: value}, sources: [{title, url}], note }. Only when online and a key is set. */
  async lookup(table, query) {
    const key = RB.claude.key();
    if (!key) throw new Error('Online search uses Claude with your Anthropic API key. Add it under More › Claude.');
    if (navigator.onLine === false) throw new Error('No internet connection. Fill the fields by hand, or try again when online.');
    const T = RB.TABLES[table], skip = ['id', 'aliases', 'added', 'status', 'roundsBeforeLog', 'countedOn', 'serial', 'notes', 'lot', 'source', 'weaponId'];
    const fields = T.fields.filter(f => !skip.includes(f[0]) && !String(f[2]).startsWith('ref:'))
      .map(([k, l, t, o = {}]) => `"${k}": ${t === 'num' || t === 'int' ? 'number' : 'string'} (${l}${o.options ? '; one of ' + o.options.join(' | ') : ''}${o.hint ? '; ' + o.hint : ''})`).join(',\n  ');
    const what = { targets: 'shooting target (paper ring target or steel plate)', weapons: 'gun (rifle or pistol; factory model / variant)', munitions: 'ammunition (factory load)' }[table];
    const prompt = `Find reliable published specifications for this ${what}: "${query}".
Search the web (manufacturer pages and rulebooks first, then reputable retailers). Convert everything to metric: mm, m, g, kg, m/s. Bullet weights given in grains: g = gr × 0.06479891. fps: m/s = fps × 0.3048. Inches: mm = in × 25.4. Yards: m = yd × 0.9144.
For ballistic coefficients give the G1 and/or G7 value exactly as published (dimensionless).${table === 'targets' ? ' For ring targets: d10 = diameter of the 10 ring, w = width of each further ring (radius step), rings = number of scoring rings, xd = inner ten diameter.' : ''}
Leave a field null if you did not find it; never guess.
Reply with JSON only, no prose:
{"fields": {
  ${fields}
 },
 "sources": [{"title": "", "url": ""}],
 "note": "one short sentence: what matched, and anything uncertain"}`;
    const model = RB.claude.model();
    const tool = /haiku/.test(model) ? { type: 'web_search_20250305', name: 'web_search', max_uses: 5 } : { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
    const messages = [{ role: 'user', content: prompt }];
    const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };
    const body = { model, max_tokens: 16000, output_config: { effort: 'medium' }, tools: [tool], messages };
    if (/opus-5|sonnet-5-5|fable-5/.test(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    let j, cites = [];
    for (let turn = 0; turn < 4; turn++) {      // pause_turn: the server paused a long search; send the turn back to continue
      let r;
      try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) }); }
      catch (e) { throw new Error('No connection to Claude. Check the internet connection.'); }
      j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401) throw new Error('The API key was rejected. Check it under More › Claude.');
        if (r.status === 429) throw new Error('Rate limit reached. Try again in a minute.');
        throw new Error(`Claude error ${r.status}: ${(j.error && j.error.message) || r.statusText}`);
      }
      (j.content || []).forEach(b => { if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(x => x.url && cites.push({ title: x.title || x.url, url: x.url })); });
      if (j.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: j.content });
    }
    if (j.stop_reason === 'refusal') throw new Error('Claude declined this search.');
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Nothing usable found online. Fill the fields by hand.');
    const out = JSON.parse(text.slice(a, b + 1));
    out.fields = out.fields || {};
    out.sources = (out.sources || []).filter(x => x && /^https?:\/\//.test(x.url || ''));
    if (!out.sources.length) out.sources = cites.slice(0, 3);
    return out;
  },

  async test() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#000'; x.beginPath(); x.arc(32, 32, 10, 0, 7); x.fill();
    return RB.claude.json('Reply with JSON only: {"ok":true,"shape":"<what you see>"}', await RB.claude.jpeg(c), { effort: 'low' });
  },
};
})();
