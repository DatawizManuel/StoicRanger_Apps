/* SR Field Kit 0.7.0 — Vault: encrypted files on the user's own Nextcloud, and "Send encrypted" (a separate encrypted
   copy, a Nextcloud public link that expires, and a password the user sends another way).
   All encryption happens here in the page with WebCrypto: AES-256-GCM, keys from passwords with PBKDF2-SHA256
   (600,000 rounds). The phone side (Vault.java) only moves bytes; Nextcloud only ever stores scrambled data.

   On Nextcloud, in <folder>/vault/ (folder from ⋯ › Where your data is stored, default /Stoic Ranger/):
     keys.json   {format:"SR-Vault-1", kdf, iter, salt, wrapPw, recSalt, wrapRec}: the random vault key, wrapped once
                 with the vault password and once with the recovery key. Nothing in it is readable without one of them.
     index.bin   "SRV1" + iv + AES-GCM(vault key, JSON {files:[{id,name,type,size,added}], shares:[…]})
     <id>.bin    "SRV1" + iv + AES-GCM(vault key, file bytes); id is random, so names and types stay hidden
     shared/<sid>.bin  "SRS1" + iter(u32) + salt + iv + AES-GCM(key from the share password, u32 len + JSON {name,type,size} + bytes)
   Decrypt page (stoic-ranger.com/vault/): link = <page>#<nextcloud host>/<share token>. The part after # never
   reaches any server. No lambdas in Java; this file is plain JS. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const N = window.FKNative || null, store = window.FKStore;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = t => window.FK && FK.toast ? FK.toast(t) : null;
  const te = new TextEncoder(), td = new TextDecoder();
  const ITER = 600000, CHUNK = 393216;
  const WORDS = "acorn adder agate alder alpine amber anchor antler anvil apple arch arrow ash aspen atlas autumn axe badger bamboo banner barley barn basalt basin bay beacon bear beaver beech bell berry birch bison blade blaze bluff boar bolt bone boulder bow bramble brass breeze brick bridge brook buck buffalo bugle bull bunker cabin cactus camel camp candle canoe canyon cape cargo cedar chalk channel cherry chest cider cinder cliff clover coast cobalt comet compass condor copper coral cougar cove coyote crane crater creek crest crow cypress dagger dawn deer delta desert dew dingo dove dragon drift drum dune dusk eagle echo elk elm ember falcon fern ferry field finch fir flame flint fog forest forge fort fox frost galaxy garnet gate geyser glacier glade glen goat granite grape gravel grove gull hammer harbor hare harvest hawk hazel heath helmet heron hill holly hornet horse hull husky ibex iceberg inlet iris iron island ivory ivy jackal jade jaguar jasper juniper kayak kestrel kettle kiln knight lake lance lantern larch lark lava ledge lemon leopard lichen lily lime linden lion lizard lodge lotus lynx magpie mallet mango maple marble marsh mast meadow mesa meteor mink mint moose moss moth mountain mule nectar nettle north oak oasis ocean olive onyx orbit orchid osprey otter owl oyster panther parrot peak pearl pebble pelican pepper pine plain plume pond poplar prairie puma quail quarry quartz quiver rabbit raft rain ram range raven reed reef ridge river robin rock rose rowan ruby saber saddle sage salmon sand sapphire shale shark shield shore".split(" ");

  // ---------- native callbacks ----------
  const cbs = {}; let cbn = 0;
  const prevCb = window.FKNativeCallback;
  window.FKNativeCallback = (id, res) => { if (cbs[id]) { const f = cbs[id]; delete cbs[id]; f(res); return; } if (prevCb) prevCb(id, res); };
  const call = fn => new Promise(res => { const id = "vt-" + (++cbn); cbs[id] = res; fn(id); });

  // ---------- crypto (also used by the tests and, copied, by the decrypt page) ----------
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  const hex = a => Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; a.forEach(x => { o.set(x, p); p += x.length; }); return o; };
  async function kdf(pw, salt, iter) {
    const k = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter || ITER, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(key, u8) { const iv = rnd(12); return cat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, u8))); }
  async function unseal(key, box) { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.subarray(0, 12) }, key, box.subarray(12))); }
  const importKey = raw => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const MAG_V = te.encode("SRV1"), MAG_S = te.encode("SRS1");
  const isMag = (u8, m) => u8.length > 4 && u8[0] === m[0] && u8[1] === m[1] && u8[2] === m[2] && u8[3] === m[3];
  async function sealFile(key, u8) { return cat(MAG_V, await seal(key, u8)); }
  async function openFile(key, u8) { if (!isMag(u8, MAG_V)) throw new Error("not a vault file"); return unseal(key, u8.subarray(4)); }
  async function sharePack(pw, meta, bytes) {
    const head = te.encode(JSON.stringify(meta)), body = new Uint8Array(4 + head.length + bytes.length);
    new DataView(body.buffer).setUint32(0, head.length); body.set(head, 4); body.set(bytes, 4 + head.length);
    const salt = rnd(16), it = new Uint8Array(4); new DataView(it.buffer).setUint32(0, ITER);
    return cat(MAG_S, it, salt, await seal(await kdf(pw, salt, ITER), body));
  }
  async function shareUnpack(pw, pkg) {
    if (!isMag(pkg, MAG_S)) throw new Error("not a Stoic Ranger file");
    const iter = new DataView(pkg.buffer, pkg.byteOffset + 4, 4).getUint32(0), salt = pkg.subarray(8, 24);
    const body = await unseal(await kdf(pw, salt, iter), pkg.subarray(24));
    const hl = new DataView(body.buffer, body.byteOffset, 4).getUint32(0);
    return { meta: JSON.parse(td.decode(body.subarray(4, 4 + hl))), bytes: body.subarray(4 + hl) };
  }
  function genPw() { const r = rnd(7), w = []; for (let i = 0; i < 6; i++) w.push(WORDS[r[i]]); return w.join("-") + "-" + (10 + r[6] % 90); }
  function genRec() { const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = rnd(24); let s = ""; for (let i = 0; i < 24; i++) { s += abc[r[i] % 32]; if (i % 4 === 3 && i < 23) s += "-"; } return s; }
  const normRec = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");
  window.FKVaultCrypto = { kdf, seal, unseal, sealFile, openFile, sharePack, shareUnpack, genPw, genRec, normRec, b64, unb64, WORDS };

  // ---------- settings (not secret, in db.json) ----------
  const DEF_PAGE = "https://stoic-ranger.com/vault/";
  const set = Object.assign({ lockMin: 5, page: DEF_PAGE }, store.get("sr-vault", {}));
  const saveSet = () => store.set("sr-vault", set);

  // ---------- Nextcloud ----------
  const cfg = () => (window.FKSync ? FKSync.cfg() : {}) || {};
  const why = () => {
    if (!N || !N.vaultNc) return "The vault works in the Android app. The iPhone web version can't reach Nextcloud directly.";
    const C = cfg(); return C.url && C.user && C.hasPassword ? "" : "The vault keeps its files on your Nextcloud. Set it up first: ⋯ › Where your data is stored (address, user name, app password).";
  };
  const dir = () => { let f = cfg().folder || "/Stoic Ranger/"; if (!f.endsWith("/")) f += "/"; return f + "vault/"; };
  function toNative(u8) { N.vaultBlobStart(); for (let i = 0; i < u8.length; i += CHUNK) if (!N.vaultBlobAppend(b64(u8.subarray(i, i + CHUNK)))) throw new Error("The file is larger than 100 MB."); if (!u8.length) N.vaultBlobAppend(""); return N.vaultBlobEnd(); }
  function fromNative() { const n = N.vaultBlobSize(), out = new Uint8Array(n); for (let i = 0; i < n; i += CHUNK * 2) out.set(unb64(N.vaultBlobRead(i, CHUNK * 2)), i); return out; }
  const netErr = r => r.status === 0 ? "No connection to your Nextcloud (" + (r.error || "offline") + ")." : r.status === 401 ? "Nextcloud did not accept the login. Check the app password under ⋯ › Where your data is stored." : "Nextcloud answered " + r.status + ".";
  async function ncGet(path) { const r = await call(id => N.vaultNc("GET", path, "", id)); if (r.status === 200) return { bytes: fromNative(), etag: r.etag || "" }; if (r.status === 404) return null; throw new Error(netErr(r)); }
  async function ncPut(path, u8, ifMatch) { toNative(u8); const r = await call(id => N.vaultNc("PUT", path, ifMatch || "", id)); if (r.status === 412) { const e = new Error("changed"); e.code = 412; throw e; } if (r.status < 200 || r.status > 299) throw new Error(netErr(r)); return r.etag || ""; }
  async function ncDel(path) { const r = await call(id => N.ncRequest("DELETE", path, "", "", "", id)); return r.status === 204 || r.status === 200 || r.status === 404; }
  async function ncMkdirs(path) { let p = ""; for (const seg of path.split("/").filter(Boolean)) { p += "/" + seg; await call(id => N.ncRequest("MKCOL", p + "/", "", "", "", id)); } }
  async function shareApi(method, sub, form) {
    const r = await call(id => N.vaultShare(method, sub || "", form || "", id));
    let j = null; try { j = JSON.parse(r.body || ""); } catch (e) { }
    const code = j && j.ocs && j.ocs.meta ? j.ocs.meta.statuscode : 0;
    if (r.status >= 200 && r.status < 300 && (code === 200 || code === 100)) return j.ocs.data;
    const m = j && j.ocs && j.ocs.meta && j.ocs.meta.message;
    throw new Error(r.status === 0 ? netErr(r) : "Nextcloud could not " + (method === "DELETE" ? "cancel" : "create") + " the link" + (m ? ": " + m : " (" + r.status + ")."));
  }

  // ---------- state ----------
  const S = { keys: null, keysEtag: "", master: null, index: null, indexEtag: "", left: 0, timer: 0, awayOk: 0, awaySince: 0, urls: [], phase: "" };
  const isOpen = () => !!S.master;
  let rawBox = null, rawKey = null;   // the raw vault key, sealed with a one-time key while open (only to re-wrap it)
  async function loadKeys() { const r = await ncGet(dir() + "keys.json"); if (!r) { S.keys = null; return false; } S.keys = JSON.parse(td.decode(r.bytes)); S.keysEtag = r.etag; return true; }
  async function saveKeys(newFile) { S.keysEtag = await ncPut(dir() + "keys.json", te.encode(JSON.stringify(S.keys, null, 1)), newFile ? "*new*" : S.keysEtag); }
  async function loadIndex() {
    const r = await ncGet(dir() + "index.bin");
    if (!r) { S.index = { files: [], shares: [] }; S.indexEtag = ""; return; }
    S.index = JSON.parse(td.decode(await openFile(S.master, r.bytes))); S.indexEtag = r.etag;
    S.index.files = S.index.files || []; S.index.shares = S.index.shares || [];
  }
  /** Change the index and save it; if another phone changed it meanwhile, load theirs and apply the change again. */
  async function editIndex(fn) {
    for (let i = 0; i < 3; i++) {
      fn(S.index);
      try { S.indexEtag = await ncPut(dir() + "index.bin", await sealFile(S.master, te.encode(JSON.stringify(S.index))), S.indexEtag || "*new*"); return; }
      catch (e) { if (e.code !== 412) throw e; await loadIndex(); }
    }
    throw new Error("The vault keeps changing on another device. Try again.");
  }

  // ---------- lock ----------
  function lock(msg) {
    const was = isOpen();
    S.master = null; S.index = null; rawBox = null; rawKey = null; clearInterval(S.timer); S.timer = 0; S.awaySince = 0;
    S.urls.forEach(u => URL.revokeObjectURL(u)); S.urls = [];
    if (N && N.vaultWipe) N.vaultWipe();
    if (N && N.vaultSecure) N.vaultSecure(false);
    closeAll();
    if (was) { S.lockMsg = msg || ""; if (location.hash === "#vault") render(); }
  }
  function tick() {
    S.left--;
    const c = $("vtCount"); if (c) c.textContent = Math.floor(S.left / 60) + ":" + String(S.left % 60).padStart(2, "0");
    if (S.left <= 0) lock("The vault locked itself after " + set.lockMin + " minute" + (set.lockMin === 1 ? "" : "s") + " without use.");
  }
  const poke = () => { if (isOpen()) S.left = set.lockMin * 60; };
  document.addEventListener("pointerdown", poke, true); document.addEventListener("keydown", poke, true);
  function startOpen() {
    S.left = set.lockMin * 60; clearInterval(S.timer); S.timer = setInterval(tick, 1000);
    if (N && N.vaultSecure) N.vaultSecure(true);
  }
  // leaving the app locks it, except for a share menu or file picker the vault opened itself (up to 2 minutes)
  const away = () => { S.awayOk = Date.now(); };
  { const prev = window.FK && FK.pause; if (window.FK) FK.pause = () => { if (isOpen()) { if (Date.now() - S.awayOk < 8000) S.awaySince = Date.now(); else lock("The vault locked when you left the app."); } if (prev) prev(); }; }
  { const prev = window.FK && FK.resume; if (window.FK) FK.resume = () => { if (isOpen() && S.awaySince && Date.now() - S.awaySince > 120000) lock("The vault locked because you were away for more than 2 minutes."); S.awaySince = 0; if (prev) prev(); }; }
  window.addEventListener("hashchange", () => { if (location.hash !== "#vault" && isOpen()) lock("The vault locked when you left it."); });

  // ---------- overlays (sheets, viewer): phone Back closes them first (js/fk.js, .fkover) ----------
  function closeAll() { document.querySelectorAll(".vtover").forEach(o => o.remove()); }
  function sheet(html) {
    closeAll();
    const bg = document.createElement("div"); bg.className = "fkover vtover vtsheetbg";
    bg.innerHTML = '<div class="vtsheet" role="dialog" aria-modal="true">' + html + "</div>";
    bg.fkClose = () => bg.remove();
    bg.onclick = e => { if (e.target === bg && !bg.dataset.busy) bg.remove(); };
    (document.querySelector(".phone") || document.body).appendChild(bg);
    return bg;
  }
  const q = (bg, sel) => bg.querySelector(sel);
  const busy = (bg, on) => { if (on) bg.dataset.busy = "1"; else delete bg.dataset.busy; bg.querySelectorAll("button").forEach(b => b.disabled = !!on); };

  // ---------- helpers ----------
  const size = n => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
  const day = t => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const ext = n => { const m = /\.([a-z0-9]{1,4})$/i.exec(n || ""); return m ? m[1].toUpperCase() : "FILE"; };
  const active = s => !s.cancelled && !s.gone && s.exp > Date.now();
  const strength = p => Math.min(100, p.length * 5 + (/[^a-z]/i.test(p) ? 10 : 0) + (/[- ]/.test(p) ? 10 : 0));
  function linkFor(s) { const host = String(cfg().url || "").replace(/^https:\/\//, "").replace(/\/+$/, ""); return (set.page || DEF_PAGE) + "#" + host + "/" + s.token; }
  const isText = f => /^text\//.test(f.type) || /\.(txt|md|csv|gpx|json|xml|log)$/i.test(f.name);
  const isImg = f => /^image\/(png|jpe?g|gif|webp|bmp)/.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);

  // ---------- views ----------
  const V = () => $("v-vault");
  function render() {
    const v = V(); if (!v) return;
    const w = why();
    if (w) { v.innerHTML = '<h2>Vault</h2><p class="lede">Encrypted files on your own Nextcloud. Send one with a link that expires and a password.</p><div class="vtbox">' + esc(w) + '</div>'; return; }
    if (isOpen()) return renderOpen();
    v.innerHTML = '<h2>Vault</h2><p class="note" id="vtLoad">Checking your Nextcloud …</p>';
    loadKeys().then(has => { if (location.hash !== "#vault" || isOpen()) return; has ? renderLocked() : renderSetup(); },
      e => { v.innerHTML = '<h2>Vault</h2><div class="vtbox">' + esc(e.message) + '</div><div class="actions start"><button type="button" class="button" id="vtRetry">Try again</button></div>'; $("vtRetry").onclick = render; });
  }

  function renderSetup() {
    V().innerHTML = `<h2>Set up the vault</h2>
      <p class="lede">Files are encrypted on this phone before they go to your Nextcloud, so Nextcloud only stores scrambled data with random names.</p>
      <p>Choose a vault password, only for the vault and separate from your Nextcloud password. Long and easy to remember works best, for example four or five words.</p>
      <div class="field"><label for="vtP1">Vault password</label><input id="vtP1" type="password" autocomplete="new-password"></div>
      <div class="vtmeter" aria-hidden="true"><i id="vtMeter"></i></div><p class="note" id="vtHint">At least 12 characters.</p>
      <div class="field"><label for="vtP2">Repeat password</label><input id="vtP2" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="vtLockSel">Lock the vault after</label><select id="vtLockSel"><option value="1">1 minute without use</option><option value="5">5 minutes without use</option><option value="15">15 minutes without use</option></select></div>
      <p class="note">It also locks as soon as you leave the app. Folder on Nextcloud: <span class="mono">${esc(dir())}</span></p>
      <p class="note bad" id="vtSetMsg" aria-live="polite"></p>
      <div class="actions start"><button type="button" class="button" id="vtCreate">Create vault</button></div>`;
    $("vtLockSel").value = String(set.lockMin);
    $("vtP1").oninput = () => { const s = strength($("vtP1").value), m = $("vtMeter"); m.style.width = s + "%"; m.dataset.l = s < 60 ? "bad" : s < 85 ? "mid" : "ok"; $("vtHint").textContent = $("vtP1").value.length < 12 ? "At least 12 characters." : s < 85 ? "OK. Longer is stronger." : "Strong."; };
    $("vtCreate").onclick = async () => {
      const p1 = $("vtP1").value, p2 = $("vtP2").value, m = $("vtSetMsg"), btn = $("vtCreate");
      if (p1.length < 12) { m.textContent = "The password needs at least 12 characters."; return; }
      if (p1 !== p2) { m.textContent = "The two passwords are different. Type them again."; return; }
      set.lockMin = +$("vtLockSel").value; saveSet();
      btn.disabled = true; m.classList.remove("bad"); m.textContent = "Creating the vault …";
      try {
        if (await loadKeys()) { m.classList.add("bad"); m.textContent = "A vault already exists in this Nextcloud folder. Unlock it instead."; btn.disabled = false; setTimeout(renderLocked, 1500); return; }
        const raw = rnd(32), rec = genRec(), salt = rnd(16), recSalt = rnd(16);
        const [kp, kr] = await Promise.all([kdf(p1, salt), kdf(rec.replace(/-/g, ""), recSalt)]);
        S.keys = { format: "SR-Vault-1", kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), wrapPw: b64(await seal(kp, raw)), recSalt: b64(recSalt), wrapRec: b64(await seal(kr, raw)), created: new Date().toISOString() };
        await ncMkdirs(dir() + "shared/");
        await saveKeys(true);
        S.master = await importKey(raw); await keepRaw(raw); raw.fill(0);
        S.index = { files: [], shares: [] }; S.indexEtag = "";
        await editIndex(() => { });
        startOpen(); renderRecovery(rec, false);
      } catch (e) { S.master = null; m.classList.add("bad"); m.textContent = e.message; btn.disabled = false; }
    };
  }

  function renderRecovery(rec, renewed) {
    V().innerHTML = `<h2>${renewed ? "Your new recovery key" : "Your recovery key"}</h2>
      <p class="lede">If you forget the vault password, this key is the only way back in. Write it on paper and keep it somewhere safe, away from the phone. Nobody can reset it for you, not even with access to your Nextcloud.</p>
      <div class="vtrec mono" id="vtRecKey">${esc(rec)}</div>
      ${renewed ? '<p class="note">The old recovery key no longer works.</p>' : ""}
      <label class="check setrow"><input type="checkbox" id="vtRecOk"> I wrote the key down</label>
      <div class="actions start"><button type="button" class="button" id="vtRecGo" disabled>Open the vault</button></div>`;
    $("vtRecOk").onchange = () => { $("vtRecGo").disabled = !$("vtRecOk").checked; };
    $("vtRecGo").onclick = () => renderOpen();
  }

  function renderLocked() {
    V().innerHTML = `<h2>Vault locked</h2>
      <p class="lede">${esc(S.lockMsg || "Type your vault password to open it.")}</p>
      <div class="field"><label for="vtPw">Vault password</label><input id="vtPw" type="password" autocomplete="current-password"></div>
      <p class="note bad" id="vtLkMsg" aria-live="polite"></p>
      <div class="actions start"><button type="button" class="button" id="vtUnlock">Unlock</button><button type="button" class="button ghost" id="vtForgot">Forgot password?</button></div>`;
    S.lockMsg = "";
    $("vtPw").onkeydown = e => { if (e.key === "Enter") $("vtUnlock").click(); };
    $("vtUnlock").onclick = async () => {
      const m = $("vtLkMsg"), btn = $("vtUnlock"); btn.disabled = true; m.classList.remove("bad"); m.textContent = "Checking …";
      try { await unlock($("vtPw").value, false); }
      catch (e) { btn.disabled = false; m.classList.add("bad"); m.textContent = e.wrong ? "Wrong password. Try again, or use your recovery key." : e.message; }
    };
    $("vtForgot").onclick = recoverySheet;
  }
  async function unlock(secret, useRec) {
    if (!S.keys) await loadKeys();
    const K = S.keys;
    let raw;
    try { raw = await unseal(await kdf(useRec ? normRec(secret).replace(/-/g, "") : secret, unb64(useRec ? K.recSalt : K.salt), K.iter), unb64(useRec ? K.wrapRec : K.wrapPw)); }
    catch (e) { const x = new Error("wrong"); x.wrong = true; throw x; }
    S.master = await importKey(raw); await keepRaw(raw); raw.fill(0);
    try { await loadIndex(); } catch (e) { S.master = null; throw e; }
    startOpen(); tidyShares();
    if (useRec) newPasswordSheet(true); else renderOpen();
  }
  function recoverySheet() {
    const bg = sheet(`<h3>Use your recovery key</h3><p>Type the key from your paper. Then choose a new vault password.</p>
      <div class="field"><label for="vtRcIn">Recovery key</label><input id="vtRcIn" class="mono" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></div>
      <p class="note bad" id="vtRcMsg"></p><div class="actions start"><button type="button" class="button" id="vtRcGo">Unlock</button><button type="button" class="button ghost" id="vtRcNo">Cancel</button></div>`);
    q(bg, "#vtRcNo").onclick = () => bg.remove();
    q(bg, "#vtRcGo").onclick = async () => {
      const m = q(bg, "#vtRcMsg"); busy(bg, true); m.classList.remove("bad"); m.textContent = "Checking …";
      try { await unlock(q(bg, "#vtRcIn").value, true); }
      catch (e) { busy(bg, false); m.classList.add("bad"); m.textContent = e.wrong ? "That key does not match. Check each group of four." : e.message; }
    };
  }
  function newPasswordSheet(forced) {
    const bg = sheet(`<h3>${forced ? "Choose a new vault password" : "Change vault password"}</h3>
      <div class="field"><label for="vtN1">New vault password</label><input id="vtN1" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="vtN2">Repeat it</label><input id="vtN2" type="password" autocomplete="new-password"></div>
      <p class="note bad" id="vtNMsg"></p><div class="actions start"><button type="button" class="button" id="vtNGo">Save password</button>${forced ? "" : '<button type="button" class="button ghost" id="vtNNo">Cancel</button>'}</div>`);
    if (forced) { bg.onclick = null; bg.fkClose = () => toast("Choose a new password first."); }
    else q(bg, "#vtNNo").onclick = () => bg.remove();
    q(bg, "#vtNGo").onclick = async () => {
      const p1 = q(bg, "#vtN1").value, p2 = q(bg, "#vtN2").value, m = q(bg, "#vtNMsg");
      if (p1.length < 12) { m.textContent = "At least 12 characters."; return; }
      if (p1 !== p2) { m.textContent = "The two passwords are different."; return; }
      busy(bg, true); m.classList.remove("bad"); m.textContent = "Saving …";
      try { await rewrap("pw", p1); bg.remove(); toast("New vault password saved"); renderOpen(); }
      catch (e) { busy(bg, false); m.classList.add("bad"); m.textContent = e.message; }
    };
  }
  /** Wrap the vault key again with a new password ("pw") or a new recovery key ("rec"); needs the vault open. */
  async function rewrap(which, secret) {
    const K = S.keys;
    const raw = await currentRaw();
    const salt = rnd(16), key = await kdf(which === "rec" ? secret.replace(/-/g, "") : secret, salt, ITER);
    const next = Object.assign({}, K, which === "rec" ? { recSalt: b64(salt), wrapRec: b64(await seal(key, raw)) } : { salt: b64(salt), wrapPw: b64(await seal(key, raw)), iter: ITER });
    raw.fill(0);
    const old = S.keys; S.keys = next;
    try { await saveKeys(false); } catch (e) { S.keys = old; throw e.code === 412 ? new Error("The vault was changed on another device. Lock it, unlock again and retry.") : e; }
  }
  // The raw vault key is kept only while it is needed to re-wrap it; it is stored sealed with a one-time key while open.
  async function keepRaw(raw) { rawKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); rawBox = await seal(rawKey, raw); }
  async function currentRaw() { if (!rawBox) throw new Error("Lock the vault and unlock it again, then retry."); return unseal(rawKey, rawBox); }

  function renderOpen() {
    const I = S.index;
    V().innerHTML = `<div class="vtlockbar"><span>Open · locks in <b id="vtCount" class="mono"></b></span><span class="vtlbtns"><button type="button" class="button ghost" id="vtSet" aria-label="Vault settings">⚙</button><button type="button" class="button ghost" id="vtLockNow">Lock</button></span></div>
      <div class="seg" role="group" aria-label="Vault"><button type="button" data-vt="files" aria-pressed="true">Files</button><button type="button" data-vt="sent" aria-pressed="false">Sent links</button></div>
      <div id="vtFiles"><ul class="vtlist" id="vtFList"></ul>
        <div class="actions start"><button type="button" class="button" id="vtAdd">Add file</button></div>
        <p class="note">Any file type, up to 100 MB each. Each file is encrypted on this phone, then uploaded.</p>
        <p class="note" id="vtMsg" aria-live="polite"></p></div>
      <div id="vtSent" hidden><ul class="vtlist" id="vtSList"></ul>
        <p class="note">A link stops working when it expires or when you cancel it. The app then deletes the shared copy from Nextcloud. The file stays in your vault.</p></div>`;
    { const c = $("vtCount"); if (c) c.textContent = Math.floor(S.left / 60) + ":" + String(S.left % 60).padStart(2, "0"); }
    const tab = t => { V().querySelectorAll("[data-vt]").forEach(b => b.setAttribute("aria-pressed", b.dataset.vt === t)); $("vtFiles").hidden = t !== "files"; $("vtSent").hidden = t !== "sent"; S.tab = t; };
    V().querySelectorAll("[data-vt]").forEach(b => b.onclick = () => tab(b.dataset.vt));
    $("vtLockNow").onclick = () => lock();
    $("vtSet").onclick = settingsSheet;
    $("vtAdd").onclick = addFile;
    const fl = $("vtFList");
    fl.innerHTML = I.files.length ? "" : '<li class="vtempty">The vault is empty. Tap Add file.</li>';
    I.files.slice().sort((a, b) => b.added - a.added).forEach(f => {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" class="vtrow"><span class="vtft">${esc(ext(f.name))}</span><span class="vtfn"><b>${esc(f.name)}</b><small>${size(f.size)} · added ${day(f.added)}</small></span><span class="vtfx">›</span></button>`;
      li.firstChild.onclick = () => fileSheet(f); fl.appendChild(li);
    });
    const sl = $("vtSList");
    sl.innerHTML = I.shares.length ? "" : '<li class="vtempty">No links yet. Open a file and tap Send encrypted.</li>';
    I.shares.slice().sort((a, b) => b.created - a.created).forEach(s => {
      const on = active(s), li = document.createElement("li");
      li.innerHTML = `<button type="button" class="vtrow${on ? "" : " gone"}"><span class="vtft">${on ? "LINK" : "OFF"}</span><span class="vtfn"><b>${esc(s.name)}</b><small>${on ? "Expires " + day(s.exp) : s.cancelled ? "Cancelled" : "Expired"} · sent ${day(s.created)}</small></span><span class="vtfx">›</span></button>`;
      li.firstChild.onclick = () => resultSheet(s); sl.appendChild(li);
    });
    tab(S.tab || "files");
  }

  // ---------- files ----------
  async function addFile() {
    const msg = $("vtMsg"), btn = $("vtAdd");
    away();
    const r = await call(id => N.vaultPick(id));
    if (!r.ok) { if (r.msg !== "cancelled") { msg.textContent = r.msg; msg.classList.add("bad"); } return; }
    if (!isOpen()) return;
    let meta; try { meta = JSON.parse(r.msg); } catch (e) { return; }
    btn.disabled = true; msg.classList.remove("bad"); msg.textContent = "Encrypting " + meta.name + " …";
    try {
      const bytes = fromNative();
      const box = await sealFile(S.master, bytes); bytes.fill(0);
      const id = hex(rnd(16));
      msg.textContent = "Uploading " + size(box.length) + " …";
      await ncPut(dir() + id + ".bin", box, "*new*");
      await editIndex(I => I.files.push({ id, name: meta.name, type: meta.type || "application/octet-stream", size: meta.size, added: Date.now() }));
      N.vaultWipe();
      toast("Added to the vault"); renderOpen();
    } catch (e) { N.vaultWipe(); btn.disabled = false; msg.classList.add("bad"); msg.textContent = e.message; }
  }
  async function plain(f) {
    const r = await ncGet(dir() + f.id + ".bin");
    if (!r) throw new Error("This file is missing on Nextcloud.");
    return openFile(S.master, r.bytes);
  }
  function fileSheet(f) {
    const bg = sheet(`<h3>${esc(f.name)}</h3><dl class="kv"><dt>Size</dt><dd>${size(f.size)}</dd><dt>Added</dt><dd>${day(f.added)}</dd><dt>On Nextcloud</dt><dd class="mono vtwrap">${esc(f.id)}.bin</dd></dl>
      <div class="vtbtns"><button type="button" class="button" id="vtSend">Send encrypted</button><button type="button" class="button ghost" id="vtOpen">Open</button><button type="button" class="button ghost" id="vtSave">Save a copy</button><button type="button" class="button ghost" id="vtDel">Delete</button></div>
      <p class="note" id="vtFMsg" aria-live="polite"></p>
      <div class="confirm" id="vtAsk" hidden></div>`);
    const m = q(bg, "#vtFMsg"), ask = q(bg, "#vtAsk");
    const fail = e => { busy(bg, false); m.classList.add("bad"); m.textContent = e.message; };
    q(bg, "#vtSend").onclick = () => sendSheet(f);
    q(bg, "#vtOpen").onclick = async () => {
      busy(bg, true); m.classList.remove("bad"); m.textContent = "Decrypting …";
      try { const b = await plain(f); busy(bg, false); bg.remove(); viewer(f, b); } catch (e) { fail(e); }
    };
    q(bg, "#vtSave").onclick = () => {
      ask.hidden = false;
      ask.innerHTML = '<p>This saves a normal, unencrypted copy outside the vault (for example in Downloads). Anyone with access to that place can read it.</p><div class="actions start"><button type="button" class="button" id="vtSaveYes">Save unencrypted copy</button><button type="button" class="button ghost" id="vtSaveNo">Cancel</button></div>';
      q(bg, "#vtSaveNo").onclick = () => { ask.hidden = true; };
      q(bg, "#vtSaveYes").onclick = async () => {
        busy(bg, true); m.classList.remove("bad"); m.textContent = "Decrypting …";
        try { const b = await plain(f); toNative(b); b.fill(0); away(); const r = await call(id => N.vaultSave(f.name, f.type, id)); N.vaultWipe(); busy(bg, false); ask.hidden = true; m.textContent = r.ok ? "Saved as " + r.msg + "." : r.msg === "cancelled" ? "" : r.msg; }
        catch (e) { N.vaultWipe(); fail(e); }
      };
    };
    q(bg, "#vtDel").onclick = () => {
      const n = S.index.shares.filter(s => s.file === f.id && active(s)).length;
      ask.hidden = false;
      ask.innerHTML = `<p>Delete this file from the vault and from Nextcloud?${n ? " " + n + " active link" + (n === 1 ? "" : "s") + " for it stop working too." : ""} This can't be undone.</p><div class="actions start"><button type="button" class="button" id="vtDelYes">Delete</button><button type="button" class="button ghost" id="vtDelNo">Keep</button></div>`;
      q(bg, "#vtDelNo").onclick = () => { ask.hidden = true; };
      q(bg, "#vtDelYes").onclick = async () => {
        busy(bg, true); m.classList.remove("bad"); m.textContent = "Deleting …";
        try {
          for (const s of S.index.shares.filter(s => s.file === f.id && active(s))) await cancelShare(s, true);
          await ncDel(dir() + f.id + ".bin");
          await editIndex(I => { I.files = I.files.filter(x => x.id !== f.id); I.shares.forEach(s => { if (s.file === f.id && !s.gone) s.cancelled = true; }); });
          bg.remove(); toast("Deleted"); renderOpen();
        } catch (e) { fail(e); }
      };
    };
  }
  function viewer(f, bytes) {
    closeAll();
    const ov = document.createElement("div"); ov.className = "fkover vtover vtviewer";
    ov.fkClose = () => { ov.remove(); N.vaultWipe(); };
    let body;
    if (isImg(f)) { const u = URL.createObjectURL(new Blob([bytes], { type: f.type || "image/png" })); S.urls.push(u); body = `<img src="${u}" alt="${esc(f.name)}">`; }
    else if (isText(f)) body = `<pre>${esc(td.decode(bytes.subarray(0, 200000)))}</pre>`;
    else body = '<div class="vtbox">This file type can\'t be shown inside the app. "Open with another app" hands a decrypted copy to an app on this phone (for example a PDF viewer). The copy is deleted when the vault locks.</div>';
    ov.innerHTML = `<div class="viewbar"><button type="button" class="vback" id="vtVClose">‹ Back</button><button type="button" class="button ghost" id="vtVWith">Open with another app</button></div><h2 class="vtwrap">${esc(f.name)}</h2><p class="note">Decrypted only for viewing. Closed and wiped when the vault locks.</p>${body}`;
    (document.querySelector(".phone") || document.body).appendChild(ov);
    q(ov, "#vtVClose").onclick = ov.fkClose;
    q(ov, "#vtVWith").onclick = async () => { toNative(bytes); away(); const r = await call(id => N.vaultOpen(f.name, f.type, id)); if (!r.ok) toast(r.msg); };
  }

  // ---------- send encrypted ----------
  const EXP = [[1, "1 day"], [7, "7 days"], [30, "30 days"]];
  function sendSheet(f) {
    let days = 7;
    const bg = sheet(`<h3>Send encrypted</h3><p><b>${esc(f.name)}</b></p>
      <p class="note">The app makes a separate encrypted copy with its own password. Your vault password is never shared.</p>
      <div class="field"><label>Link expires after</label><div class="seg" role="group" id="vtExp">${EXP.map(e => `<button type="button" data-d="${e[0]}" aria-pressed="${e[0] === 7}">${e[1]}</button>`).join("")}</div></div>
      <div class="field"><label for="vtSPw">Password for the receiver</label><input id="vtSPw" class="mono" autocomplete="off" spellcheck="false" value="${genPw()}"></div>
      <div class="actions start"><button type="button" class="button ghost" id="vtSNew">New password</button></div>
      <p class="note">Six random words and a number: easy to read out or type. You can also type your own (at least 12 characters).</p>
      <p class="note bad" id="vtSMsg" aria-live="polite"></p>
      <div class="actions start"><button type="button" class="button" id="vtSGo">Encrypt and create link</button><button type="button" class="button ghost" id="vtSNo">Cancel</button></div>`);
    q(bg, "#vtExp").querySelectorAll("button").forEach(b => b.onclick = () => { days = +b.dataset.d; q(bg, "#vtExp").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    q(bg, "#vtSNew").onclick = () => { q(bg, "#vtSPw").value = genPw(); };
    q(bg, "#vtSNo").onclick = () => bg.remove();
    q(bg, "#vtSGo").onclick = () => {
      const pw = q(bg, "#vtSPw").value.trim();
      if (pw.length < 12) { q(bg, "#vtSMsg").textContent = "Use at least 12 characters, or tap New password."; return; }
      progress(f, pw, days);
    };
  }
  async function progress(f, pw, days) {
    const bg = sheet(`<h3>Sending</h3><ul class="vtprog" id="vtPg"><li class="run">Encrypting a copy on this phone</li><li>Uploading to ${esc(dir())}shared/</li><li>Creating a Nextcloud link, expires in ${days} day${days === 1 ? "" : "s"}</li></ul><p class="note bad" id="vtPMsg"></p><div class="actions start" id="vtPAct" hidden><button type="button" class="button ghost" id="vtPClose">Close</button></div>`);
    busy(bg, true);
    const li = bg.querySelectorAll("#vtPg li"), step = i => { li[i - 1].className = "done"; if (li[i]) li[i].className = "run"; };
    const sid = hex(rnd(16)), path = dir() + "shared/" + sid + ".bin";
    let uploaded = false;
    try {
      const b = await plain(f);
      const pkg = await sharePack(pw, { name: f.name, type: f.type, size: f.size }, b); b.fill(0);
      step(1);
      await ncPut(path, pkg, "*new*"); uploaded = true; N.vaultWipe();
      step(2);
      const exp = new Date(Date.now() + days * 86400000), ymd = exp.getFullYear() + "-" + String(exp.getMonth() + 1).padStart(2, "0") + "-" + String(exp.getDate()).padStart(2, "0");
      const d = await shareApi("POST", "", "path=" + encodeURIComponent(path) + "&shareType=3&permissions=1&expireDate=" + ymd);
      step(3);
      const s = { id: String(d.id), token: d.token, sid, file: f.id, name: f.name, pw, exp: new Date(ymd + "T23:59:59").getTime(), created: Date.now() };
      await editIndex(I => I.shares.push(s));
      busy(bg, false); bg.remove(); resultSheet(s, true);
    } catch (e) {
      if (uploaded) ncDel(path);
      N.vaultWipe(); busy(bg, false);
      q(bg, "#vtPMsg").textContent = e.message; q(bg, "#vtPAct").hidden = false; q(bg, "#vtPClose").onclick = () => bg.remove();
    }
  }
  function resultSheet(s, fresh) {
    const on = active(s), link = linkFor(s);
    const bg = sheet(`<h3>${fresh ? "Link ready" : esc(s.name)}</h3>
      ${on ? `<p class="note">Expires ${day(s.exp)}. Send the link and the password in two different ways, for example the link by email and the password via Signal or Threema.</p>` : `<p class="note bad">This link ${s.cancelled ? "was cancelled" : "has expired"}. The shared copy was deleted from Nextcloud.</p>`}
      <div class="vtlink"><small>Link</small><code id="vtLk">${esc(link)}</code></div>
      <div class="vtlink"><small>Password</small><code id="vtLp">${esc(s.pw)}</code></div>
      ${on ? '<div class="vtbtns"><button type="button" class="button" id="vtShL">Share link</button><button type="button" class="button" id="vtShP">Share password</button></div>' : ""}
      <p class="note" id="vtRMsg" aria-live="polite"></p>
      <div class="vtbtns">${on ? '<button type="button" class="button ghost" id="vtCancel">Cancel link now</button>' : ""}<button type="button" class="button ghost" id="vtDone">Done</button></div>`);
    q(bg, "#vtDone").onclick = () => { bg.remove(); renderOpen(); };
    if (!on) return;
    q(bg, "#vtShL").onclick = () => { away(); N.vaultShareText(link, "Share link"); q(bg, "#vtRMsg").textContent = "Now send the password a different way."; };
    q(bg, "#vtShP").onclick = () => { away(); N.vaultShareText(s.pw, "Share password"); q(bg, "#vtRMsg").textContent = "Use a different app than for the link, for example Signal or Threema."; };
    q(bg, "#vtCancel").onclick = async () => {
      busy(bg, true); q(bg, "#vtRMsg").textContent = "Cancelling …";
      try { await cancelShare(s); busy(bg, false); bg.remove(); toast("Link cancelled"); renderOpen(); }
      catch (e) { busy(bg, false); q(bg, "#vtRMsg").textContent = e.message; }
    };
  }
  async function cancelShare(s, noSave) {
    try { await shareApi("DELETE", "/" + s.id); } catch (e) { if (!/404|not found|wrong share/i.test(e.message)) throw e; }
    await ncDel(dir() + "shared/" + s.sid + ".bin");
    if (!noSave) await editIndex(I => { const x = I.shares.find(y => y.sid === s.sid); if (x) x.cancelled = true; });
    else s.cancelled = true;
  }
  /** After unlocking: delete shared copies whose link has expired (Nextcloud already stopped the link), forget old entries. */
  async function tidyShares() {
    const I = S.index, now = Date.now(), done = I.shares.filter(s => !s.gone && (s.cancelled || s.exp < now));
    if (!done.length && !I.shares.some(s => s.exp < now - 60 * 86400000)) return;
    try {
      for (const s of done) { if (!s.cancelled) { try { await shareApi("DELETE", "/" + s.id); } catch (e) { } } await ncDel(dir() + "shared/" + s.sid + ".bin"); }
      await editIndex(J => { J.shares.forEach(s => { if (done.some(d => d.sid === s.sid)) s.gone = true; }); J.shares = J.shares.filter(s => s.exp > now - 60 * 86400000); });
      if (location.hash === "#vault" && isOpen() && !document.querySelector(".vtover")) renderOpen();
    } catch (e) { }
  }

  // ---------- settings ----------
  function settingsSheet() {
    const bg = sheet(`<h3>Vault settings</h3>
      <div class="field"><label for="vtSLock">Lock the vault after</label><select id="vtSLock"><option value="1">1 minute without use</option><option value="5">5 minutes without use</option><option value="15">15 minutes without use</option></select></div>
      <div class="field"><label for="vtSPage">Decrypt page (where receivers open links)</label><input id="vtSPage" type="url" class="mono" autocomplete="off" spellcheck="false"></div>
      <p class="note">The page from the release folder (vault-page/index.html), put on your website. Default ${esc(DEF_PAGE)}</p>
      <div class="vtbtns"><button type="button" class="button" id="vtSSave">Save</button><button type="button" class="button ghost" id="vtSPwC">Change vault password</button><button type="button" class="button ghost" id="vtSRec">Make a new recovery key</button></div>
      <p class="note" id="vtSetMsg2" aria-live="polite"></p>`);
    q(bg, "#vtSLock").value = String(set.lockMin); q(bg, "#vtSPage").value = set.page || DEF_PAGE;
    q(bg, "#vtSSave").onclick = () => {
      const p = q(bg, "#vtSPage").value.trim() || DEF_PAGE;
      if (!/^https:\/\/[^\s#]+$/.test(p)) { q(bg, "#vtSetMsg2").textContent = "The page address must start with https:// and have no # in it."; return; }
      set.lockMin = +q(bg, "#vtSLock").value; set.page = p; saveSet(); S.left = set.lockMin * 60; bg.remove(); toast("Saved");
    };
    q(bg, "#vtSPwC").onclick = () => newPasswordSheet(false);
    q(bg, "#vtSRec").onclick = async () => {
      busy(bg, true); q(bg, "#vtSetMsg2").textContent = "Making a new key …";
      try { const rec = genRec(); await rewrap("rec", rec); bg.remove(); renderRecovery(rec, true); }
      catch (e) { busy(bg, false); q(bg, "#vtSetMsg2").textContent = e.message; }
    };
  }

  // ---------- hooks ----------
  window.FKVault = { render, lock, isOpen, state: S };
  const homeLine = () => { const e = $("hVt"); if (e) e.textContent = why() ? "Needs your Nextcloud" : isOpen() ? "Open · " + S.index.files.length + " file" + (S.index.files.length === 1 ? "" : "s") : "Locked"; };
  window.addEventListener("hashchange", () => { if (location.hash === "#vault") render(); if ((location.hash || "#home") === "#home") homeLine(); });
  homeLine();
  if (location.hash === "#vault") render();
})();
