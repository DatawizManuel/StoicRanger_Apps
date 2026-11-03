/* Grip strength, loaded carries, feet/ankles/shins, neck, power & speed */
'use strict';
(function () {
  const { stand, hinge, split, supine, prone, kneel, front, back, arm, hang, sit } = PB;
  const F = FIG;
  const kb = (o = {}) => Object.assign({ k: 'kb', a: 0 }, o);
  const walk = (o = {}, k) => stand(Object.assign(k ? { ln: [12, 4], lf: [-14, -10] } : { ln: [-14, -10], lf: [14, 4] }, o));

  /* ---------- grip ---------- */
  X('grip_hang', 'Dead hang', 'grip', 'grip', {
    lvl: 1, equip: ['bar'], dose: 'time', prim: ['forearms', 'lats'], sec: ['shoulders', 'upperback'], noFloor: true,
    how: ['Grab the bar shoulder-width, palms away.', 'Hang with straight arms, shoulders active (not shrugged into the ears).', 'Hold for time, breathe calmly.'],
    cue: ['Squeeze the bar as if to crush it.'], err: ['Hanging completely passive with pain in the shoulders.'],
    easy: 'Feet lightly on a box.', hard: 'grip_hang1',
    A: hang(104, 30), B: hang(104, 30, { p: [103, 132], ln: [4, -4] })
  });
  X('grip_hang1', 'One-arm dead hang', 'grip', 'grip', {
    lvl: 3, equip: ['bar'], dose: 'time', side: true, prim: ['forearms', 'lats'], sec: ['shoulders', 'obliques'], noFloor: true,
    how: ['Start in a two-arm hang, then let go with one hand.', 'Keep the shoulder of the hanging arm active.', 'Switch arms.'],
    cue: ['Free hand ready to grab again.'], err: ['Dropping into a passive hang on one shoulder.'],
    easy: 'grip_hang', hard: 'Longer holds.',
    A: hang(104, 30, { af: [10, 10] }), B: hang(104, 30, { af: [20, 30], ln: [10, -4] })
  });
  X('grip_towel', 'Towel hang / towel pull-up', 'grip', 'grip', {
    lvl: 2, equip: ['bar'], dose: 'time', prim: ['forearms', 'lats'], sec: ['biceps', 'upperback'], noFloor: true,
    how: ['Hang two towels over the bar, grab one in each hand.', 'Hang for time, or pull up if you can.', 'Lower slowly.'],
    cue: ['Thumbs wrap around.'], err: ['Towels too thin to train the grip.'],
    easy: 'One towel and one hand on the bar.', hard: 'Towel pull-ups.',
    A: hang(104, 10, { eq: [{ k: 'towel', at: [104, 12] }] }), B: hang(104, 10, { p: [100, 80], t: -4, ln: [12, -16], eq: [{ k: 'towel', at: [104, 12] }] })
  });
  X('grip_farmer', 'Heavy farmer carry', 'grip', 'carry', {
    lvl: 1, equip: ['kb'], dose: 'carry', prim: ['forearms', 'traps', 'abs'], sec: ['upperback', 'glutes', 'calves'],
    how: ['Heaviest kettlebell (or dumbbell) in each hand.', 'Walk tall with short, quick steps.', 'Put them down before the grip opens.'],
    cue: ['Crush the handles.'], err: ['Shrugging, leaning forward.'],
    easy: 'db_farmer', hard: 'Longer distance.',
    A: walk({ an: [2, 2], eq: [kb()] }), B: walk({ an: [2, 2], eq: [kb()] }, 1)
  });
  X('grip_suitcase', 'Suitcase carry (one side)', 'carry', 'carry', {
    lvl: 1, equip: ['kb'], dose: 'carry', side: true, prim: ['obliques', 'forearms'], sec: ['abs', 'traps', 'glutes'],
    how: ['One heavy bell in one hand, the other hand free.', 'Walk without leaning towards the bell.', 'Switch hands.'],
    cue: ['Stand tall like there is a bell in both hands.'], err: ['Leaning to the loaded side.'],
    easy: 'Lighter bell.', hard: 'Heavier bell.',
    A: front({ an: [-4, -2], af: [10, 10], eq: [kb({ at: 'hnN' })] }), B: front({ an: [-4, -2], af: [10, 10], ln: [-6, -4], lf: [8, 20], eq: [kb({ at: 'hnN' })] })
  });
  X('grip_bottomsup', 'Bottoms-up kettlebell hold / press', 'grip', 'grip', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['forearms', 'shoulders'], sec: ['triceps', 'abs'],
    how: ['Hold the bell upside down by the handle, bell pointing to the ceiling, at shoulder height.', 'Hold it steady, or press it overhead.', 'Lower slowly.'],
    cue: ['Crush grip, wrist straight.'], err: ['Too heavy: the bell flips over.'],
    easy: 'Hold only.', hard: 'Press.',
    A: arm(stand(), { an: [12, 0, 1], hn: 180, eq: [kb({ a: 180 })] }), B: stand({ an: [176, 178], hn: 178, eq: [kb({ a: 180 })] })
  });
  X('grip_horns', 'Kettlebell horn squeeze hold', 'grip', 'grip', {
    lvl: 1, equip: ['kb'], dose: 'time', prim: ['forearms', 'chest'], sec: ['biceps', 'shoulders'],
    how: ['Hold the bell by the horns, palms squeezing the sides.', 'Hold it at chest height with bent arms.', 'Squeeze as hard as you can for time.'],
    cue: ['Palms press inwards, fingers relaxed.'], err: ['Shrugging.'],
    easy: 'Bell lower.', hard: 'Arms further from the body.',
    A: arm(stand(), { an: [14, 24, 1], eq: [kb({ a: 180 })] }), B: arm(stand(), { an: [22, 20, 1], eq: [kb({ a: 180 })] })
  });
  X('grip_pinch', 'Sandbag pinch hold', 'grip', 'grip', {
    lvl: 2, equip: ['sb'], dose: 'time', side: true, prim: ['forearms'], sec: ['traps'],
    how: ['Pinch the end of the bag between fingers and thumb, no handles.', 'Stand up with it and hold.', 'Switch hands.'],
    cue: ['Thumb works as hard as the fingers.'], err: ['Curling the wrist.'],
    easy: 'Lighter bag.', hard: 'Walk with it.',
    A: stand({ an: [2, 2], eq: [{ k: 'sb', c: 'hnN', off: [0, 16], a: 0, len: 30, r: 8 }] }), B: stand({ an: [2, 2], eq: [{ k: 'sb', c: 'hnN', off: [0, 16], a: 0, len: 30, r: 8 }] })
  });
  X('grip_gripper', 'Hand gripper', 'grip', 'grip', {
    lvl: 1, equip: ['gripper'], dose: 'reps', side: true, prim: ['forearms'], sec: [],
    how: ['Set the gripper deep in the hand.', 'Squeeze until the handles touch.', 'Open slowly.'],
    cue: ['Hold the closed position 1–2 s.'], err: ['Only half closing it.'],
    easy: 'Lighter gripper.', hard: 'Harder gripper.',
    A: arm(stand(), { an: [8, 24, 1], hn: 150, eq: [{ k: 'gripper', at: 'hnN', a: 150, sq: 0 }] }), B: arm(stand(), { an: [8, 24, 1], hn: 150, eq: [{ k: 'gripper', at: 'hnN', a: 150, sq: 1 }] })
  });
  X('grip_roller', 'Wrist roller', 'grip', 'grip', {
    lvl: 1, equip: ['roller'], dose: 'reps', prim: ['forearms'], sec: ['shoulders'],
    how: ['Hold the stick in front with straight arms, weight hanging on the rope.', 'Roll the rope up by turning the wrists.', 'Roll it down slowly.'],
    cue: ['Arms stay straight at shoulder height.'], err: ['Letting the arms drop.'],
    easy: 'Lighter weight, elbows bent.', hard: 'Heavier weight.',
    A: stand({ an: [88, 90], eq: [{ k: 'roller', drop: 50 }] }), B: stand({ an: [88, 90], eq: [{ k: 'roller', drop: 20 }] })
  });
  X('grip_wristcurl', 'Reverse curl / wrist curl', 'grip', 'arms', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['forearms'], sec: ['biceps'],
    how: ['Reverse curl: palms down, curl the dumbbells (or band) up.', 'Wrist curl: forearm on the thigh, move only the wrist.', 'Lower slowly.'],
    cue: ['Light weight, full range.'], err: ['Jerking the weight.'],
    easy: 'Band instead of a dumbbell.', hard: 'Slow lowering.',
    A: stand({ an: [2, 4], eq: [{ k: 'db', at: 'hnN' }] }), B: stand({ an: [4, 150], eq: [{ k: 'db', at: 'hnN' }] })
  });
  X('grip_fingerext', 'Finger extensions with a rubber band', 'grip', 'grip', {
    lvl: 1, dose: 'reps', side: true, prim: ['forearms'], sec: [],
    how: ['Put a rubber band around all five fingertips.', 'Open the fingers as wide as you can.', 'Close slowly.'],
    cue: ['Balances all the squeezing: good for the elbows.'], err: ['Too weak a band.'],
    easy: 'Thinner band.', hard: 'Two bands.',
    A: arm(stand(), { an: [8, 24, 1], hn: 150, fist: true }), B: arm(stand(), { an: [8, 24, 1], hn: 150, fist: false })
  });

  /* ---------- loaded carries ---------- */
  X('carry_overhead', 'Overhead carry', 'carry', 'carry', {
    lvl: 2, equip: ['kb'], dose: 'carry', side: true, prim: ['shoulders', 'abs'], sec: ['triceps', 'traps', 'obliques'],
    how: ['Press one bell overhead and lock the arm.', 'Walk slowly with the bell over the shoulder.', 'Switch arms.'],
    cue: ['Biceps by the ear, ribs down.'], err: ['Arm drifting forward.'],
    easy: 'Lighter bell.', hard: 'Two bells.',
    A: walk({ an: [176, 178], hn: 178, eq: [kb({ a: -150 })] }), B: walk({ an: [176, 178], hn: 178, eq: [kb({ a: -150 })] }, 1)
  });

  /* ---------- feet, ankles, shins ---------- */
  X('feet_tib', 'Tibialis raise', 'feet', 'feet', {
    lvl: 1, prim: ['calves'], sec: [], tag: 'shin',
    how: ['Lean your back against a wall, heels about 30 cm from it.', 'Lift the toes as high as you can.', 'Lower slowly.'],
    cue: ['Burn in the shins is the goal.'], err: ['Rocking the body instead of lifting the toes.'],
    easy: 'Heels closer to the wall.', hard: 'Further away or a weight on the toes.',
    A: Object.assign(stand({ t: -12, p: [112, 110], ln: { to: [128, 196] }, fn: 90, eq: [{ k: 'wall', x: 80, y: 30, fixed: true }] })), B: stand({ t: -12, p: [112, 110], ln: { to: [128, 196] }, fn: 125, eq: [{ k: 'wall', x: 80, y: 30, fixed: true }] })
  });
  X('feet_calf', 'Slow calf raise', 'feet', 'feet', {
    lvl: 1, prim: ['calves'], sec: [],
    how: ['Stand on a step, heels off the edge.', 'Rise as high as you can.', 'Lower 3 s until the heels are below the step.'],
    cue: ['Big toe stays pressed down.'], err: ['Rolling to the outside of the foot.'],
    easy: 'Flat floor.', hard: 'calfraise1',
    A: F.fit({ p: [100, 100], t: 0, ln: [0, 0], an: [4, 6], fn: 104, eq: [{ k: 'step', at: [102, 186], w: 32, fixed: true }] }, ['toeN']), B: F.fit({ p: [100, 100], t: 0, ln: [0, 0], an: [4, 6], fn: 40, eq: [{ k: 'step', at: [102, 186], w: 32, fixed: true }] }, ['toeN'])
  });
  X('feet_circles', 'Ankle circles', 'feet', 'feet', {
    lvl: 1, side: true, prim: ['calves'], sec: [],
    how: ['Sit or stand on one leg.', 'Draw big, slow circles with the foot.', 'Change direction, then switch feet.'],
    cue: ['Biggest circle you can draw.'], err: ['Moving the knee instead of the ankle.'],
    easy: 'Seated.', hard: 'Standing on the other leg.',
    A: stand({ lf: [30, 0], ff: 40, an: [4, 6] }), B: stand({ lf: [30, 0], ff: 140, an: [4, 6] })
  });
  X('feet_short', 'Short-foot drill', 'feet', 'feet', {
    lvl: 1, dose: 'time', prim: ['calves'], sec: [],
    how: ['Barefoot, sitting or standing.', 'Pull the ball of the foot towards the heel without curling the toes: the arch rises.', 'Hold 5–10 s, relax.'],
    cue: ['Toes stay long and relaxed.'], err: ['Clawing the toes.'],
    easy: 'Seated.', hard: 'On one leg.',
    A: FIG.fit({ p: [92, 150], t: -2, ln: [90, 0], an: [40, 100], fn: 90, eq: [{ k: 'bench', at: [86, 156], w: 40, back: true }] }), B: FIG.fit({ p: [92, 150], t: -2, ln: [90, 0], an: [40, 100], fn: 82, eq: [{ k: 'bench', at: [86, 156], w: 40, back: true }] })
  });
  X('feet_balance', 'Barefoot one-leg balance', 'feet', 'feet', {
    lvl: 1, dose: 'time', side: true, prim: ['calves', 'glutes'], sec: ['abs'],
    how: ['Barefoot, stand on one leg.', 'Once steady, close your eyes.', 'Hold, then switch legs.'],
    cue: ['Soft knee, quiet foot.'], err: ['Locking the knee.'],
    easy: 'Eyes open.', hard: 'On a cushion.',
    A: front({ lf: [10, -40], af: [30, 30], an: [-30, -30] }), B: front({ lf: [12, -50], af: [24, 24], an: [-24, -24] })
  });

  /* ---------- neck ---------- */
  X('neck_iso', 'Neck isometrics (4 directions)', 'neck', 'neck', {
    lvl: 1, dose: 'time', prim: ['neck'], sec: ['traps'],
    how: ['Put a hand on the forehead and press the head into it without moving.', 'Repeat on the back of the head and both sides.', 'Build up the pressure slowly, 10 s each.'],
    cue: ['Head stays in neutral.'], err: ['Jerky, sudden pushes.'],
    easy: 'Less pressure.', hard: 'Longer holds.',
    A: arm(stand(), { an: [24, -32, 1], hn: 180 }), B: arm(stand(), { an: [-6, -40, 1], hn: 90 })
  });
  X('neck_tuck', 'Chin tucks', 'neck', 'neck', {
    lvl: 1, prim: ['neck'], sec: ['upperback'],
    how: ['Stand or sit tall, look straight ahead.', 'Pull the chin straight back (double chin).', 'Hold 3 s, relax.'],
    cue: ['Like sliding the head back on a shelf.'], err: ['Nodding down.'],
    easy: 'Lying on the back.', hard: 'Lying face down, lift the head.',
    A: stand({ h: 10 }), B: Object.assign(stand({ h: -4 }), {})
  });
  X('neck_bandext', 'Band neck extension', 'neck', 'neck', {
    lvl: 2, equip: ['band'], prim: ['neck', 'traps'], sec: ['upperback'],
    how: ['Light band around the back of the head, held in front by the hands (or anchored).', 'Start looking slightly down, extend the neck to look straight ahead.', 'Return slowly.'],
    cue: ['Small movement, light band.'], err: ['Cranking the head far back.'],
    easy: 'neck_iso', hard: 'Hold 2 s at the end.',
    A: arm(stand({ h: 30 }), { an: [30, 4, 1], hn: 90, eq: [{ k: 'band', from: 'hnN', to: 'head', anchor: false }] }), B: arm(stand({ h: -6 }), { an: [30, 4, 1], hn: 90, eq: [{ k: 'band', from: 'hnN', to: 'head', anchor: false }] })
  });

  /* ---------- power & speed ---------- */
  X('pow_broad', 'Broad jump', 'power', 'power', {
    lvl: 1, prim: ['glutes', 'quads', 'calves'], sec: ['hamstrings', 'shoulders'],
    how: ['Stand with the feet hip-width.', 'Swing the arms back, dip, then jump forward as far as you can.', 'Land softly in a squat and stick the landing. Walk back, rest.'],
    cue: ['Quality over quantity: full rest between jumps.'], err: ['Landing stiff-legged.'],
    easy: 'Jump in place.', hard: 'Several jumps in a row.',
    A: hinge(40, 90, 136, { an: [-40, -30], h: -10 }), B: stand({ t: 20, p: [140, 96], ln: [-20, -40], an: [160, 170], fn: 30, eq: [] })
  });
  X('pow_boxjump', 'Low box jump', 'power', 'power', {
    lvl: 2, equip: ['bench'], prim: ['quads', 'glutes', 'calves'], sec: ['hamstrings', 'abs'],
    how: ['Face a sturdy low box or step (30–50 cm).', 'Swing, dip and jump up onto it, landing softly with both feet.', 'Stand tall, then step down (do not jump down).'],
    cue: ['Land quietly.'], err: ['Box too high: knees to chest.'],
    easy: 'Lower box.', hard: 'Higher box.',
    A: hinge(40, 80, 136, { an: [-40, -30], h: -10, eq: [{ k: 'box', at: [140, 162], w: 46, fixed: true, back: true }] }),
    B: { p: [140, 98], t: 20, ln: { to: [146, 158] }, an: [60, 70], eq: [{ k: 'box', at: [140, 162], w: 46, fixed: true, back: true }] }
  });
  X('pow_sprint', 'Short sprints', 'power', 'power', {
    lvl: 2, dose: 'dist', prim: ['glutes', 'hamstrings', 'quads'], sec: ['calves', 'hipflex', 'abs'],
    how: ['Warm up well first.', 'Sprint 10–30 m at full speed.', 'Walk back, rest fully before the next one.'],
    cue: ['Drive the knees, push the ground back.'], err: ['Sprinting cold.', 'Too many reps: speed drops.'],
    easy: 'Uphill sprints (easier on the hamstrings).', hard: 'Longer sprints.',
    A: stand({ t: 18, ln: [70, -10], lf: [-30, -60], an: [-50, 40], af: [50, 120], fn: 90, ff: 30 }), B: stand({ t: 18, ln: [-30, -60], lf: [70, -10], an: [50, 120], af: [-50, 40], fn: 30, ff: 90 })
  });
  X('pow_throw', 'Medicine-ball or sandbag throw', 'power', 'power', {
    lvl: 2, equip: ['sb'], dose: 'reps', prim: ['glutes', 'shoulders', 'abs'], sec: ['quads', 'triceps', 'obliques'],
    how: ['Hold a light sandbag or medicine ball at the chest.', 'Dip and explode, throwing it forward (or overhead backwards) as far as you can.', 'Fetch it, reset, repeat.'],
    cue: ['Throw with the whole body.'], err: ['Too heavy: slow throws.'],
    easy: 'Lighter ball.', hard: 'Rotational throw against a wall.',
    A: arm(hinge(24, 90, 140), { an: [12, 20, 1], eq: [{ k: 'ball', c: 'hnN', off: [6, -2] }] }), B: stand({ t: 16, an: [140, 140], fn: 40, eq: [{ k: 'ball', c: 'hnN', off: [12, -10] }] })
  });
})();
