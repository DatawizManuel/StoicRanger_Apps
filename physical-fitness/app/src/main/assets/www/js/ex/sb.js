/* Sandbag exercises (10 / 20 kg bags by default) */
'use strict';
(function () {
  const { stand, hinge, split, supine, kneel, front, arm } = PB;
  const sb = (o = {}) => Object.assign({ k: 'sb', a: 90, len: 34, r: 8.5 }, o);
  const hug = P => arm(P, { an: [16, 28, 1], hn: 200, eq: [sb({ c: 'hnN', off: [-4, -4], a: 4, len: 30, r: 10, mid: true })] });
  const floorBag = [sb({ c: [116, 191], a: 90, fixed: true })];

  X('sb_deadlift', 'Sandbag deadlift', 'sb', 'hinge', {
    lvl: 1, equip: ['sb'], dose: 'load', prim: ['glutes', 'hamstrings', 'forearms'], sec: ['lowerback', 'quads', 'upperback'],
    how: ['Bag lengthwise between the feet, grab the handles or the fabric.', 'Hips back, flat back, then stand up by driving the hips forward.', 'Lower the same way.'],
    cue: ['Bag close to the legs.'], err: ['Rounding the back to reach the bag.'],
    hard: 'sb_clean',
    A: hinge(62, 84, 128, { an: [6, 6], h: -30, eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] }), B: stand({ an: [4, 4], eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] })
  });
  X('sb_hugsquat', 'Bear-hug squat', 'sb', 'squat', {
    lvl: 1, equip: ['sb'], dose: 'load', prim: ['quads', 'glutes', 'upperback'], sec: ['abs', 'biceps', 'adductors'],
    how: ['Hug the bag high against the chest.', 'Squat down with an upright torso.', 'Stand up while squeezing the bag.'],
    cue: ['The bag makes you brace: use it.'], err: ['Letting the bag slide down.'],
    easy: 'squat', hard: 'sb_zercher',
    A: hug(stand()), B: hug(hinge(18, 88, 154))
  });
  X('sb_zercher', 'Zercher squat (bag in the elbows)', 'sb', 'squat', {
    lvl: 2, equip: ['sb'], dose: 'load', prim: ['quads', 'abs', 'upperback'], sec: ['glutes', 'biceps'],
    how: ['Hold the bag in the crooks of the elbows, hands together.', 'Squat down, elbows between the knees.', 'Stand up tall.'],
    cue: ['Elbows up, chest up.'], err: ['Rounding the upper back.'],
    easy: 'sb_hugsquat', hard: 'Heavier bag.',
    A: stand({ an: [30, 160], eq: [sb({ c: 'elN', off: [6, -4], a: 0, len: 22, r: 9 })] }), B: hinge(24, 88, 154, { an: [36, 166], eq: [sb({ c: 'elN', off: [6, -4], a: 0, len: 22, r: 9 })] })
  });
  X('sb_clean', 'Sandbag clean', 'sb', 'power', {
    lvl: 2, equip: ['sb'], dose: 'load', prim: ['glutes', 'upperback', 'forearms'], sec: ['hamstrings', 'biceps', 'quads'],
    how: ['Bag on the floor between the feet, grip the sides.', 'Explode with the hips, pull the bag up the body and drop under it.', 'Catch it high on the chest in a quarter squat, stand up.'],
    cue: ['Hips first, arms last.'], err: ['Reverse-curling the bag with the arms.'],
    easy: 'sb_deadlift', hard: 'sb_g2o',
    A: hinge(62, 84, 128, { an: [6, 6], h: -30, eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] }), B: hug(stand())
  });
  X('sb_shoulder', 'Shouldering (floor to shoulder)', 'sb', 'power', {
    lvl: 2, equip: ['sb'], dose: 'load', side: true, prim: ['glutes', 'lowerback', 'obliques'], sec: ['hamstrings', 'upperback', 'biceps'],
    how: ['Bag on the floor. Squat down and wrap the arms around it.', 'Explode up and roll the bag onto one shoulder.', 'Drop it in front of you and alternate shoulders.'],
    cue: ['Lift with the legs and hips, rotate at the top.'], err: ['Twisting with a round back under load.'],
    easy: 'sb_clean', hard: 'Heavier bag.',
    A: hinge(50, 84, 140, { an: { to: [118, 178] }, h: -24, eq: [sb({ c: 'hnN', off: [0, 4], a: 90 })] }), B: arm(stand(), { an: [6, -4, 1], hn: 170, eq: [sb({ c: 'sh', off: [0, -9], a: 90, len: 34, r: 8 })] })
  });
  X('sb_g2o', 'Ground-to-overhead', 'sb', 'power', {
    lvl: 3, equip: ['sb'], dose: 'load', prim: ['quads', 'shoulders', 'glutes'], sec: ['triceps', 'upperback', 'abs'],
    how: ['Clean the bag to the chest.', 'Dip and drive with the legs, press it overhead.', 'Bring it down to the chest and to the floor. Repeat.'],
    cue: ['Use the legs for every part.'], err: ['Arching the back overhead.'],
    easy: 'sb_clean', hard: 'Heavier bag or for time.',
    A: hinge(62, 84, 128, { an: [6, 6], h: -30, eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] }), B: stand({ an: [176, 178], hn: 178, eq: [sb({ c: 'hnN', off: [0, -4], a: 90 })] })
  });
  X('sb_press', 'Sandbag press / push press', 'sb', 'vpush', {
    lvl: 2, equip: ['sb'], dose: 'load', prim: ['shoulders', 'triceps'], sec: ['abs', 'traps', 'quads'],
    how: ['Bag on the front of the shoulders, hands on the handles or sides.', 'Press it overhead (or dip and drive for a push press).', 'Lower it to the shoulders.'],
    cue: ['Head through at the top.'], err: ['Leaning back.'],
    easy: 'band_press', hard: 'Push press with a heavier bag.',
    A: arm(stand(), { an: [12, 2, 1], hn: 180, eq: [sb({ c: 'hnN', off: [0, -2], a: 90 })] }), B: stand({ an: [176, 178], hn: 178, eq: [sb({ c: 'hnN', off: [0, -4], a: 90 })] })
  });
  X('sb_row', 'Bent-over row', 'sb', 'hpull', {
    lvl: 1, equip: ['sb'], dose: 'load', prim: ['upperback', 'lats'], sec: ['biceps', 'lowerback', 'forearms'],
    how: ['Hinge forward with a flat back, bag hanging from the handles.', 'Row it to the lower ribs.', 'Lower to straight arms.'],
    cue: ['Torso stays still.'], err: ['Standing up to row.'],
    easy: 'Lighter bag.', hard: 'Pause at the top.',
    A: hinge(66, 86, 126, { an: [4, 4], h: -26, eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] }), B: hinge(66, 86, 126, { an: [-60, 6], h: -26, eq: [sb({ c: 'hnN', off: [0, 6], a: 90 })] })
  });
  X('sb_lunge', 'Front-loaded reverse lunge', 'sb', 'lunge', {
    lvl: 2, equip: ['sb'], dose: 'load', side: true, prim: ['quads', 'glutes'], sec: ['abs', 'upperback', 'adductors'],
    how: ['Hug the bag at the chest (or in the elbows).', 'Step back into a lunge until the back knee almost touches the floor.', 'Drive back up through the front foot.'],
    cue: ['Tall torso.'], err: ['Leaning forward.'],
    easy: 'lunge', hard: 'Heavier bag.',
    A: hug(stand()), B: hug(split(4, 98, 151, 132, 50, {}, 188))
  });
  X('sb_hugcarry', 'Bear-hug carry', 'sb', 'carry', {
    lvl: 1, equip: ['sb'], dose: 'carry', prim: ['abs', 'upperback', 'biceps'], sec: ['quads', 'glutes', 'forearms'],
    how: ['Pick the bag up and hug it high on the chest.', 'Walk with short, steady steps.', 'Set it down with a flat back.'],
    cue: ['Breathe behind the brace.'], err: ['Leaning back to hold the bag.'],
    easy: 'Shorter distance.', hard: 'Heavier bag or uphill.',
    A: hug(stand({ ln: [-14, -10], lf: [14, 4] })), B: hug(stand({ ln: [12, 4], lf: [-14, -10] }))
  });
  X('sb_drag', 'Sandbag drag', 'sb', 'cond', {
    lvl: 1, equip: ['sb'], dose: 'dist', prim: ['quads', 'glutes', 'forearms'], sec: ['upperback', 'hamstrings', 'calves'],
    how: ['Grab the bag by one end or a strap, lean back.', 'Walk backwards dragging it along the ground.', 'Turn around and drag it with the other hand or forwards.'],
    cue: ['Sit into the hips, short steps.'], err: ['Pulling with a round back.'],
    easy: 'Lighter bag.', hard: 'Heavier bag or on grass.',
    A: hinge(16, 94, 128, { t: -14, an: [30, 30], eq: [sb({ c: [160, 190], a: 100, fixed: true }), { k: 'band', from: 'hnN', to: [146, 188], anchor: false }] }),
    B: hinge(16, 94, 128, { t: -16, ln: { to: [86, 196] }, an: [34, 34], eq: [sb({ c: [160, 190], a: 100, fixed: true }), { k: 'band', from: 'hnN', to: [146, 188], anchor: false }] })
  });
  X('sb_toss', 'Over-the-shoulder toss', 'sb', 'power', {
    lvl: 2, equip: ['sb'], dose: 'load', prim: ['glutes', 'lowerback'], sec: ['hamstrings', 'upperback', 'shoulders'],
    how: ['Bag on the floor in front, squat down and grab it.', 'Explode up and throw it over one shoulder behind you.', 'Turn around, walk to it and repeat.'],
    cue: ['Full hip extension, arms just guide.'], err: ['Throwing with the arms.'],
    easy: 'Lighter bag.', hard: 'Heavier bag.',
    A: hinge(50, 84, 140, { an: { to: [118, 178] }, h: -24, eq: [sb({ c: 'hnN', off: [0, 4], a: 90 })] }), B: stand({ t: -10, an: [170, 170], fn: 50, eq: [sb({ c: 'hnN', off: [-10, -6], a: 60 })] })
  });
  X('sb_rotlunge', 'Rotational lunge (around the body)', 'sb', 'rot', {
    lvl: 2, equip: ['sb'], dose: 'load', side: true, prim: ['obliques', 'glutes', 'quads'], sec: ['abs', 'shoulders'],
    how: ['Hold the bag at the chest.', 'Step back into a lunge and rotate the bag towards the front-leg side.', 'Rotate back to the middle as you stand up.'],
    cue: ['Turn the ribs, not just the arms.'], err: ['Knee caving in during the twist.'],
    easy: 'No rotation.', hard: 'Heavier bag.',
    A: front({ an: [-30, 20], af: [30, -20], eq: [sb({ c: [100, 92], a: 90, len: 30, fixed: true })] }), B: front({ t: 14, an: [-50, 10], af: [10, -20], ln: [-14, 2], lf: [6, -40], eq: [sb({ c: [74, 104], a: 70, len: 30, fixed: true })] })
  });
  X('sb_getup', 'Sandbag get-up (from lying)', 'sb', 'cond', {
    lvl: 2, equip: ['sb'], dose: 'load', side: true, prim: ['abs', 'quads', 'glutes'], sec: ['shoulders', 'obliques', 'upperback'],
    how: ['Lie on your back with the bag on one shoulder.', 'Get up to standing any way you can without dropping the bag.', 'Lie back down and switch shoulders.'],
    cue: ['Move smooth, not fast.'], err: ['Holding the breath the whole time.'],
    easy: 'Bag hugged on the chest.', hard: 'Heavier bag.',
    A: supine({ ln: { to: [148, 196], bend: -1 }, an: [-150, -180], eq: [sb({ c: 'neck', off: [4, -10], a: 90, len: 30 })] }), B: arm(stand(), { an: [6, -4, 1], hn: 170, eq: [sb({ c: 'sh', off: [0, -9], a: 90, len: 34, r: 8 })] })
  });
})();
