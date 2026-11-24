'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var te = new TextEncoder(), td = new TextDecoder();
  var show = function (id) { ['sLoad', 'sNoLink', 'sGone', 'sManual', 'sPw', 'sDone'].forEach(function (s) { $(s).hidden = s !== id; }); };
  var size = function (n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; };
  var pkg = null, url = null;

  function kdf(pw, salt, iter) {
    return crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  function isPkg(u8) { return u8.length > 40 && u8[0] === 83 && u8[1] === 82 && u8[2] === 83 && u8[3] === 49; }   // "SRS1"
  function unpack(pw, p) {
    var iter = new DataView(p.buffer, p.byteOffset + 4, 4).getUint32(0), salt = p.subarray(8, 24), box = p.subarray(24);
    if (iter < 100000 || iter > 10000000) return Promise.reject(new Error('bad file'));
    return kdf(pw, salt, iter).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.subarray(0, 12) }, k, box.subarray(12)); }).then(function (b) {
      b = new Uint8Array(b);
      var hl = new DataView(b.buffer, 0, 4).getUint32(0);
      return { meta: JSON.parse(td.decode(b.subarray(4, 4 + hl))), bytes: b.subarray(4 + hl) };
    });
  }

  // link: #<host[/path]>/<token>
  var link = null, h = decodeURIComponent((location.hash || '').slice(1));
  var m = /^([a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~-]+)*)\/([A-Za-z0-9]{6,64})$/i.exec(h);
  if (m) link = { base: 'https://' + m[1], token: m[2] };

  function gotPkg(u8, from) {
    if (!isPkg(u8)) { manual('This is not a file from the Stoic Ranger vault.'); return; }
    pkg = u8;
    $('fileInfo').textContent = 'Encrypted file · ' + size(u8.length) + (from ? ' · ' + from : '');
    show('sPw'); $('pw').focus();
  }
  function manual(why) {
    if (why) $('manualWhy').textContent = why;
    if (link) { $('dlLink').href = link.base + '/s/' + link.token + '/download'; $('dlRow').hidden = false; $('pickRow').textContent = '2. Pick the downloaded file here:'; }
    else { $('dlRow').hidden = true; $('pickRow').textContent = 'Pick the file here:'; }
    show('sManual');
  }
  function fetchBytes(u, opts) {
    return fetch(u, opts).then(function (r) {
      if (r.status === 404) { var e = new Error('gone'); e.gone = true; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (b) { return new Uint8Array(b); });
  }
  function load() {
    if (!link) { manual(''); $('sNoLink').hidden = false; return; }
    var dav = link.base + '/public.php/dav/files/' + encodeURIComponent(link.token);
    fetchBytes(dav, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }).catch(function (e) {
      if (e.gone) throw e;
      // older Nextcloud (before 29): the public WebDAV endpoint with the share token as user name
      return fetchBytes(link.base + '/public.php/webdav/', { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: 'Basic ' + btoa(link.token + ':') } });
    }).then(function (u8) { gotPkg(u8, ''); }, function (e) {
      if (e.gone) { show('sGone'); return; }
      manual('This page could not load the file directly from the sender\'s Nextcloud. You can still open it in two steps.');
    });
  }
  $('pick').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    f.arrayBuffer().then(function (b) { gotPkg(new Uint8Array(b), f.name); });
  };
  $('pw').onkeydown = function (e) { if (e.key === 'Enter') $('go').click(); };
  $('go').onclick = function () {
    var msg = $('msg'), btn = $('go'), pw = $('pw').value.trim();
    if (!pw) { msg.className = 'msg bad'; msg.textContent = 'Type the password first.'; return; }
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Decrypting …';
    unpack(pw, pkg).then(function (r) {
      var meta = r.meta || {}, type = meta.type || 'application/octet-stream', name = String(meta.name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([r.bytes], { type: type }));
      $('dName').textContent = name; $('dSize').textContent = size(r.bytes.length);
      var pv = $('dPrev'); pv.textContent = '';
      if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(type)) { var im = document.createElement('img'); im.className = 'pv'; im.alt = name; im.src = url; pv.appendChild(im); }
      else if (/^text\//.test(type) || /\.(txt|md|csv|json|gpx|xml|log)$/i.test(name)) { var pre = document.createElement('pre'); pre.className = 'pv'; pre.textContent = td.decode(r.bytes.subarray(0, 200000)); pv.appendChild(pre); }
      $('dSave').href = url; $('dSave').setAttribute('download', name);
      $('pw').value = ''; btn.disabled = false; msg.textContent = '';
      show('sDone');
    }, function () {
      btn.disabled = false; msg.className = 'msg bad';
      msg.textContent = 'Wrong password. Check it with the sender: it must match exactly, including the dashes.';
    });
  };
  if (!window.crypto || !crypto.subtle) { $('sLoad').innerHTML = '<p class="msg bad">This page needs a secure (https) address and a current browser.</p>'; return; }
  load();
})();
