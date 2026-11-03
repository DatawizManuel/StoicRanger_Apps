/* Mobility drills and the daily mobility block (optional, never affects the plan) */
'use strict';
(function () {
  const { stand, hinge, split, supine, prone, kneel, front, back, arm, sit } = PB;
  const F = FIG;

  X('mob_9090', 'Hip 90/90 switches', 'mob', 'mob', {
    dose: 'reps', prim: ['glutes', 'hipflex', 'adductors'], sec: ['obliques'],
    how: ['Sit with both knees bent 90°: one leg in front, one to the side.', 'Rotate both knees to the other side without using the hands.', 'Sit tall the whole time.'],
    cue: ['Slow and controlled.'], err: ['Leaning far back.'],
    A: front({ p: [100, 186], an: [-20, -20], af: [20, 20], ln: [-80, 0], lf: [80, 170] }), B: front({ p: [100, 186], an: [-20, -20], af: [20, 20], ln: [-80, -170], lf: [80, 0] })
  });
  X('mob_couch', 'Couch stretch', 'mob', 'mob', {
    dose: 'time', side: true, prim: ['hipflex', 'quads'], sec: ['abs'],
    how: ['Back knee on the floor against a wall or sofa, shin up the wall.', 'Front foot flat in a lunge.', 'Squeeze the glute of the back leg and stand the torso up tall.'],
    cue: ['Tuck the pelvis under.'], err: ['Arching the lower back.'],
    A: { p: [86, 152], t: 10, ln: { to: [128, 196] }, lf: [-10, -170], ff: 0, an: { to: [124, 150] }, eq: [{ k: 'wall', x: 54, y: 90, fixed: true }] },
    B: { p: [84, 152], t: -4, ln: { to: [128, 196] }, lf: [-14, -172], ff: 0, an: [10, 10], eq: [{ k: 'wall', x: 54, y: 90, fixed: true }] }
  });
  X('mob_wgs', "World's greatest stretch", 'mob', 'mob', {
    dose: 'reps', side: true, prim: ['hipflex', 'hamstrings', 'upperback'], sec: ['adductors', 'chest'],
    how: ['Step into a long lunge, both hands on the floor inside the front foot.', 'Drop the same-side elbow towards the instep.', 'Rotate that arm up to the ceiling, eyes follow the hand.'],
    cue: ['Back leg straight and strong.'], err: ['Rushing the rotation.'],
    A: { p: [90, 150], t: 70, ln: { to: [134, 196] }, lf: { to: [30, 192] }, ff: 30, an: [4, 4], hn: 90, h: -20 },
    B: { p: [90, 150], t: 70, ln: { to: [134, 196] }, lf: { to: [30, 192] }, ff: 30, an: [160, 170], af: [4, 4], h: 40 }
  });
  X('mob_deepsquat', 'Deep squat hold', 'mob', 'mob', {
    dose: 'time', prim: ['quads', 'glutes', 'adductors', 'calves'], sec: ['lowerback'],
    how: ['Sit down into the deepest squat you can, heels down.', 'Elbows inside the knees, chest up.', 'Hold on to a door frame if you need to.'],
    cue: ['Breathe into the belly.'], err: ['Heels lifting.'],
    A: arm(hinge(30, 88, 166, { h: -6 }), { an: [22, 30, 1] }), B: arm(hinge(26, 88, 170, { h: -6 }), { an: [24, 26, 1] })
  });
  X('mob_cossack', 'Cossack squat', 'mob', 'mob', {
    dose: 'reps', side: true, prim: ['adductors', 'quads', 'glutes'], sec: ['hamstrings'],
    how: ['Very wide stance.', 'Shift into one bent leg while the other stays straight, toes up.', 'Move to the other side through the middle.'],
    cue: ['Heel of the bent leg stays down.'], err: ['Rounding forward.'],
    A: front({ ln: [-24, -24], lf: [24, 24], an: [-8, -8], af: [8, 8] }), B: front({ p: [80, 150], ln: { to: [52, 196] }, lf: [52, 52], an: [24, 60], af: [-24, -60] })
  });
  X('mob_jefferson', 'Jefferson curl (light)', 'mob', 'mob', {
    dose: 'reps', prim: ['hamstrings', 'lowerback'], sec: ['upperback'],
    how: ['Stand on a step with a light weight (4–8 kg) hanging in the hands.', 'Roll down one vertebra at a time, chin first, legs straight.', 'Roll up slowly. Go light.'],
    cue: ['Slow, 5 s down, 5 s up.'], err: ['Too heavy.'],
    A: stand({ an: [2, 2], eq: [{ k: 'kb', a: 0 }] }), B: hinge(86, 96, 112, { h: 40, an: [-10, -10], eq: [{ k: 'kb', a: 0 }] })
  });
  X('mob_catcow', 'Cat-cow', 'mob', 'mob', {
    dose: 'reps', prim: ['lowerback', 'abs'], sec: ['upperback'],
    how: ['On hands and knees, hands under the shoulders.', 'Round the back up to the ceiling, head down.', 'Let the belly sink and lift the head. Move with the breath.'],
    cue: ['Slow, one breath per movement.'], err: ['Only moving the neck.'],
    A: F.fit({ p: [80, 150], t: 96, h: -30, ln: [0, -90], fn: 0, an: [0, 0], hn: 90 }, ['knN', 'haN']), B: F.fit({ p: [80, 150], t: 84, h: 26, ln: [0, -90], fn: 0, an: [0, 0], hn: 90 }, ['knN', 'haN'])
  });
  X('mob_child', "Child's pose with side reach", 'mob', 'mob', {
    dose: 'time', prim: ['lats', 'lowerback'], sec: ['shoulders', 'glutes'],
    how: ['Kneel, sit back on the heels and reach the arms forward on the floor.', 'Walk both hands to one side and hold.', 'Then to the other side.'],
    cue: ['Sink the hips towards the heels.'], err: ['Hips lifting.'],
    A: F.fit({ p: [84, 176], t: 104, h: -6, ln: [82, -92], fn: -95, an: [96, 96], hn: 96 }, ['knN', 'haN', 'head', 'elN']), B: F.fit({ p: [80, 178], t: 110, h: -6, ln: [84, -92], fn: -95, an: [98, 98], hn: 98 }, ['knN', 'haN', 'head', 'elN'])
  });
  X('mob_openbook', 'Thoracic open book', 'mob', 'mob', {
    dose: 'reps', side: true, prim: ['upperback', 'chest'], sec: ['obliques', 'shoulders'],
    how: ['Lie on your side, knees bent 90°, arms together in front.', 'Open the top arm over to the other side like a book.', 'Follow the hand with the eyes; return.'],
    cue: ['Knees stay together on the floor.'], err: ['Knees lifting.'],
    A: front({ view: 'front', p: [100, 120], an: [-90, -90], af: [-90, -90], ln: [0, 0], lf: [0, 0] }), B: front({ p: [100, 120], an: [-90, -90], af: [90, 90], ln: [0, 0], lf: [0, 0] })
  });
  X('mob_wallslide', 'Wall slides', 'mob', 'prehab', {
    dose: 'reps', prim: ['upperback', 'shoulders', 'traps'], sec: [],
    how: ['Back, head and arms against the wall, elbows bent 90° (goal-post arms).', 'Slide the arms up as high as you can without losing contact.', 'Slide back down.'],
    cue: ['Lower back stays near the wall.'], err: ['Arching off the wall.'],
    A: back({ an: [-90, -180], af: [90, 180] }), B: back({ an: [-150, -170], af: [150, 170] })
  });
  X('mob_ankle', 'Knee-to-wall ankle rocks', 'mob', 'feet', {
    dose: 'reps', side: true, prim: ['calves'], sec: [],
    how: ['Half-kneel facing a wall, front foot about 10 cm from it.', 'Push the knee forward to touch the wall, heel stays down.', 'Move the foot back when it gets easy.'],
    cue: ['Knee over the middle toes.'], err: ['Heel lifting.'],
    A: { p: [90, 152], t: 0, ln: { to: [120, 196] }, lf: [-10, -90], ff: 0, an: { to: [150, 110] }, eq: [{ k: 'wall', x: 156, y: 60, fixed: true }] },
    B: { p: [100, 152], t: 6, ln: { to: [120, 196] }, lf: [-6, -86], ff: 0, an: { to: [150, 110] }, eq: [{ k: 'wall', x: 156, y: 60, fixed: true }] }
  });
  X('mob_traps', 'Upper trap stretch', 'mob', 'neck', {
    dose: 'time', side: true, prim: ['traps', 'neck'], sec: [],
    how: ['Sit on one hand or hold the chair seat.', 'Tilt the ear towards the other shoulder.', 'Let the free hand rest on the head; no pulling.'],
    cue: ['Shoulder of the stretched side stays down.'], err: ['Pulling hard on the head.'],
    A: front({ an: [-4, -4], af: [4, 4] }), B: front({ h: 28, an: [-4, -4], af: [40, 170] })
  });

  /* daily block: areas and the pool (exercise ids and the daily dose) */
  window.MOB_AREAS = { hips: 'Hips', back: 'Hamstrings & back', shoulders: 'Shoulders & upper back', feet: 'Feet & ankles', neck: 'Neck' };
  window.MOB = [
    { id: 'm90', a: 'hips', ex: 'mob_9090', d: '2 × 8 switches' },
    { id: 'mcouch', a: 'hips', ex: 'mob_couch', d: '45 s per side' },
    { id: 'mwgs', a: 'hips', ex: 'mob_wgs', d: '5 per side' },
    { id: 'msq', a: 'hips', ex: 'mob_deepsquat', d: '2 × 30 s' },
    { id: 'mcos', a: 'hips', ex: 'mob_cossack', d: '2 × 6 per side' },
    { id: 'mjc', a: 'back', ex: 'mob_jefferson', d: '2 × 8, 4–8 kg' },
    { id: 'mham', a: 'back', ex: 'band_hamstretch', d: '45 s per side' },
    { id: 'mcat', a: 'back', ex: 'mob_catcow', d: '10 slow reps' },
    { id: 'mchild', a: 'back', ex: 'mob_child', d: '60 s' },
    { id: 'mopen', a: 'shoulders', ex: 'mob_openbook', d: '8 per side' },
    { id: 'mdis', a: 'shoulders', ex: 'band_dislocate', d: '2 × 10' },
    { id: 'mwall', a: 'shoulders', ex: 'mob_wallslide', d: '10 reps' },
    { id: 'mhang', a: 'shoulders', ex: 'grip_hang', d: '2 × 30 s, relaxed' },
    { id: 'mhalo', a: 'shoulders', ex: 'kb_halo', d: '8 each way, 8–10 kg' },
    { id: 'mank', a: 'feet', ex: 'mob_ankle', d: '10 per side' },
    { id: 'mtib', a: 'feet', ex: 'feet_tib', d: '15 reps' },
    { id: 'mcalf', a: 'feet', ex: 'feet_calf', d: '15 reps, 3 s down' },
    { id: 'mbal', a: 'feet', ex: 'feet_balance', d: '30 s per side, eyes closed' },
    { id: 'mtuck', a: 'neck', ex: 'neck_tuck', d: '10 × 3 s' },
    { id: 'miso', a: 'neck', ex: 'neck_iso', d: '10 s each direction' },
    { id: 'mtrap', a: 'neck', ex: 'mob_traps', d: '30 s per side' }
  ];
})();
