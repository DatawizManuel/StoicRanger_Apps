/* SR Physical Fitness — muscle map: front and back view of the same anatomical figure as the exercise drawings,
   main muscles in blue, supporting muscles in light blue. MMAP.svg(prim, sec) → <svg>. */
'use strict';
(function () {
  const MMAP = window.MMAP = {};
  const pose = view => ({ view, p: [100, 110], an: [-14, -6], af: [14, 6], ln: [-3, -2], lf: [3, 2], fist: false });
  MMAP.svg = function (prim = [], sec = [], o = {}) {
    const M = { prim, sec };
    const f = FIG.drawPose(pose('front'), M).svg, b = FIG.drawPose(pose('back'), M).svg;
    const label = o.label || 'Muscles worked';
    return `<svg class="fig mmap" viewBox="0 0 280 214" role="img" aria-label="${label.replace(/"/g, '')}">
      <g transform="translate(-30 -16) scale(1.08)">${f}</g><g transform="translate(110 -16) scale(1.08)">${b}</g>
      <text x="78" y="211">FRONT</text><text x="218" y="211">BACK</text></svg>`;
  };
  /* legend text: "Main: … · Supporting: …" */
  MMAP.names = list => list.map(k => (FIG.MUSCLE_NAMES[k] || k)).join(', ');
})();
