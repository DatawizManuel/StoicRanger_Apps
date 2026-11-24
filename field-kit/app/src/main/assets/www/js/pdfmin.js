/* SR Field Kit 0.6.0 — a very small PDF writer for the Drop & wind export (#19). No library, no network.
   One page, vector only: text in the PDF base fonts Helvetica / Helvetica-Bold (WinAnsi), lines, polylines,
   rectangles, circles. Coordinates in points from the top left (1 pt = 1/72 inch). Widths are the standard
   Helvetica metrics, so right-aligned table columns line up. */
'use strict';
window.FKPdf = (function () {
  const WID = [[278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500], [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556]];   // char codes 32..255
  const SPECIAL = { 8364: 128, 8218: 130, 8222: 132, 8230: 133, 8211: 150, 8212: 151, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8482: 153, 8240: 137 };
  const codes = s => { const out = []; for (const ch of String(s)) { const c = ch.codePointAt(0);
    out.push(SPECIAL[c] || (c >= 32 && c < 127 ? c : c >= 160 && c < 256 ? c : c === 9 ? 32 : 63)); } return out; };
  const width = (s, size, bold) => codes(s).reduce((a, c) => a + (WID[bold ? 1 : 0][c - 32] || 556), 0) / 1000 * size;
  const esc = s => codes(s).map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('');
  const n = v => (Math.round(v * 100) / 100).toString();
  const rgb = c => { if (!c) return [0, 0, 0]; const h = c.replace('#', ''); const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return [0, 2, 4].map(i => parseInt(f.substr(i, 2), 16) / 255); };
  const col = (c, op) => rgb(c).map(n).join(' ') + ' ' + op;

  function Doc(w, h) {
    const ops = [];
    const Y = y => h - y;
    const stroke = o => { ops.push(n(o.w || 0.6) + ' w', col(o.color || '#000', 'RG'), (o.dash ? '[' + o.dash.map(n).join(' ') + '] 0 d' : '[] 0 d')); };
    return {
      w, h, width,
      text(x, y, s, o) { o = o || {}; const size = o.size || 9, bold = !!o.bold, tw = width(s, size, bold);
        const x0 = o.align === 'right' ? x - tw : o.align === 'center' ? x - tw / 2 : x;
        if (o.halo) ops.push('1 1 1 rg', n(x0 - 1) + ' ' + n(Y(y) - size * 0.22) + ' ' + n(tw + 2) + ' ' + n(size * 0.92) + ' re f');
        ops.push(col(o.color || '#000', 'rg'), 'BT /F' + (bold ? 2 : 1) + ' ' + n(size) + ' Tf ' + n(x0) + ' ' + n(Y(y)) + ' Td (' + esc(s) + ') Tj ET');
        return tw; },
      line(x1, y1, x2, y2, o) { o = o || {}; stroke(o); ops.push(n(x1) + ' ' + n(Y(y1)) + ' m ' + n(x2) + ' ' + n(Y(y2)) + ' l S'); },
      poly(pts, o) { if (pts.length < 2) return; o = o || {}; stroke(o); ops.push('1 j 1 J'); ops.push(pts.map((p, i) => n(p[0]) + ' ' + n(Y(p[1])) + (i ? ' l' : ' m')).join(' ') + ' S', '0 j 0 J'); },
      rect(x, y, rw, rh, o) { o = o || {}; let op = '';
        if (o.fill) { ops.push(col(o.fill, 'rg')); op = 'f'; }
        if (o.stroke) { stroke({ w: o.w, color: o.stroke, dash: o.dash }); op = o.fill ? 'B' : 'S'; }
        if (op) ops.push(n(x) + ' ' + n(Y(y + rh)) + ' ' + n(rw) + ' ' + n(rh) + ' re ' + op); },
      circle(cx, cy, r, o) { o = o || {}; const k = 0.5523 * r, c = [cx, Y(cy)];
        const p = [[c[0] + r, c[1]], [c[0] + r, c[1] + k, c[0] + k, c[1] + r, c[0], c[1] + r], [c[0] - k, c[1] + r, c[0] - r, c[1] + k, c[0] - r, c[1]],
          [c[0] - r, c[1] - k, c[0] - k, c[1] - r, c[0], c[1] - r], [c[0] + k, c[1] - r, c[0] + r, c[1] - k, c[0] + r, c[1]]];
        let op = ''; if (o.fill) { ops.push(col(o.fill, 'rg')); op = 'f'; } if (o.stroke) { stroke({ w: o.w, color: o.stroke }); op = o.fill ? 'B' : 'S'; }
        ops.push(n(p[0][0]) + ' ' + n(p[0][1]) + ' m ' + p.slice(1).map(q => q.map(n).join(' ') + ' c').join(' ') + ' ' + op); },
      /** the finished file as bytes */
      bytes(title) {
        const content = ops.join('\n');
        const objs = [
          '<< /Type /Catalog /Pages 2 0 R >>',
          '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(w) + ' ' + n(h) + '] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
          '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
          '<< /Title (' + esc(title || 'SR Field Kit') + ') /Producer (SR Field Kit) >>'
        ];
        let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
        objs.forEach((o, i) => { off.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
        const x = s.length;
        s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        s += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 7 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
        const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u;
      }
    };
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  /** paper sizes in points, portrait */
  const PAPER = { A4: [595.28, 841.89], A5: [419.53, 595.28], A6: [297.64, 419.53] };
  return { Doc, width, b64, PAPER };
})();
