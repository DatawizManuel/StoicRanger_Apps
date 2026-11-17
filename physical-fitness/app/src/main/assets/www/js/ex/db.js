/* Dumbbell exercises */
'use strict';
(function () {
  const { stand, hinge, split, supine, front, back, arm } = PB;
  const db = (at = 'hnN', o) => Object.assign({ k: 'db', at }, o || {});
  const two = [db('hnN'), db('hnF', { back: true })];
  const bench = (o) => Object.assign({ k: 'bench', at: [100, 160], w: 70, fixed: true, back: true }, o || {});

  X('db_press_flat', 'Floor press / bench press', 'db', 'hpush', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['chest', 'triceps'], sec: ['shoulders'],
    how: ['Lie on the floor (or a bench) with a dumbbell in each hand above the chest.', 'Lower until the upper arms touch the floor (on a bench: to chest level).', 'Press back up until the arms are straight.'],
    cue: ['Elbows about 45° from the body.'], err: ['Bouncing the elbows.', 'Wrists bent back.'],
    easy: 'pushup_incline', hard: 'Slow 3 s lowering.',
    A: supine({ ln: { to: [148, 196], bend: -1 }, an: [178, 178], hn: 180, eq: [db()] }), B: supine({ ln: { to: [148, 196], bend: -1 }, an: [80, 178], hn: 180, eq: [db()] })
  });
  X('db_row', 'One-arm row', 'db', 'hpull', {
    lvl: 1, equip: ['db'], dose: 'load', side: true, prim: ['lats', 'upperback'], sec: ['biceps', 'forearms', 'shoulders'],
    how: ['One hand and knee on a bench (or hand on a chair), back flat.', 'Row the dumbbell to the hip.', 'Lower to a straight arm with a stretch.'],
    cue: ['Lead with the elbow.'], err: ['Twisting to lift.'],
    easy: 'Lighter dumbbell.', hard: 'Pause at the top.',
    A: hinge(68, 86, 124, { an: [4, 4], af: { to: [150, 150] }, h: -26, eq: [db(), bench({ at: [150, 152], w: 40 })] }), B: hinge(68, 86, 124, { an: [-56, 0], af: { to: [150, 150] }, h: -26, eq: [db(), bench({ at: [150, 152], w: 40 })] })
  });
  X('db_press', 'Seated or standing shoulder press', 'db', 'vpush', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['shoulders', 'triceps'], sec: ['traps', 'abs', 'upperback'],
    how: ['Dumbbells at the shoulders, palms forward or facing each other.', 'Press up until the arms are straight.', 'Lower to the shoulders.'],
    cue: ['Ribs down, glutes tight.'], err: ['Leaning back.'],
    easy: 'Seated with back support.', hard: 'kb_pushpress',
    A: front({ an: [-80, 170], af: [80, -170], eq: two }), B: front({ an: [-176, -178], af: [176, 178], eq: two })
  });
  X('db_rdl', 'Romanian deadlift', 'db', 'hinge', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['hamstrings', 'glutes'], sec: ['lowerback', 'forearms'],
    how: ['Stand with a dumbbell in each hand in front of the thighs.', 'Push the hips back, dumbbells sliding down the legs, until you feel a strong stretch.', 'Drive the hips forward to stand up.'],
    cue: ['Knees soft but they do not bend more.'], err: ['Squatting instead of hinging.', 'Rounding the back.'],
    easy: 'kb_deadlift', hard: 'Single-leg.',
    A: stand({ an: [4, 4], eq: [db()] }), B: hinge(70, 88, 118, { an: [4, 4], h: -24, eq: [db()] })
  });
  X('db_goblet', 'Goblet squat (dumbbell)', 'db', 'squat', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['quads', 'glutes'], sec: ['adductors', 'abs'],
    how: ['Hold one dumbbell vertically at the chest by one end.', 'Squat down between the knees.', 'Stand up tall.'],
    cue: ['Heels down.'], err: ['Leaning forward.'],
    easy: 'squat', hard: 'Heavier dumbbell, pause at the bottom.',
    A: arm(stand(), { an: [12, 26, 1], eq: [{ k: 'dbs', at: 'hnN', a: 180 }] }), B: arm(hinge(26, 86, 152), { an: [12, 26, 1], eq: [{ k: 'dbs', at: 'hnN', a: 180 }] })
  });
  X('db_stepup', 'Step-up (bench or box)', 'db', 'lunge', {
    lvl: 1, equip: ['db', 'bench'], dose: 'load', side: true, prim: ['quads', 'glutes'], sec: ['hamstrings', 'calves'],
    how: ['One foot fully on a sturdy box or bench, dumbbells at the sides.', 'Push through that foot and stand up on the box.', 'Step down slowly with the other foot.'],
    cue: ['Do not push off the back foot.'], err: ['Box so high that the hip is far below the knee.'],
    easy: 'Lower box, no weight.', hard: 'Higher box.',
    A: { p: [96, 120], t: 8, ln: { to: [124, 150] }, lf: { to: [90, 196] }, an: [4, 4], eq: [db(), { k: 'box', at: [132, 152], w: 40, fixed: true, back: true }] },
    B: { p: [118, 76], t: 2, ln: { to: [124, 150] }, lf: [-8, 20], an: [2, 2], eq: [db(), { k: 'box', at: [132, 152], w: 40, fixed: true, back: true }] }
  });
  X('db_lunge', 'Walking lunge (dumbbells)', 'db', 'lunge', {
    lvl: 1, equip: ['db'], dose: 'load', side: true, prim: ['quads', 'glutes'], sec: ['adductors', 'forearms'],
    how: ['Dumbbells at the sides, step forward into a lunge.', 'Back knee almost touches the floor.', 'Bring the back foot through into the next step.'],
    cue: ['Long steps, upright torso.'], err: ['Wobbling knees.'],
    easy: 'lunge', hard: 'Heavier dumbbells.',
    A: stand({ an: [2, 2], eq: [db()] }), B: split(4, 98, 151, 132, 50, { an: [2, 2], eq: [db()] }, 188)
  });
  X('db_thruster', 'Thruster', 'db', 'cond', {
    lvl: 2, equip: ['db'], dose: 'load', prim: ['quads', 'shoulders', 'glutes'], sec: ['triceps', 'abs'],
    how: ['Dumbbells at the shoulders, squat down.', 'Drive up hard and press the dumbbells overhead in one movement.', 'Bring them to the shoulders as you sink into the next squat.'],
    cue: ['Legs start the press.'], err: ['Pressing after you stand (two separate moves).'],
    easy: 'Lighter dumbbells.', hard: 'Heavier, or for time.',
    A: arm(hinge(22, 88, 154), { an: [10, 2, 1], hn: 180, eq: [db()] }), B: stand({ an: [176, 178], hn: 178, eq: [db()] })
  });
  X('db_renegade', 'Renegade row', 'db', 'hpull', {
    lvl: 2, equip: ['db'], dose: 'load', side: true, prim: ['upperback', 'abs'], sec: ['lats', 'obliques', 'triceps'],
    how: ['Push-up position, hands on the dumbbells, feet wide.', 'Row one dumbbell to the hip without twisting.', 'Put it down and row the other.'],
    cue: ['Hips stay square to the floor.'], err: ['Rotating the hips open.'],
    easy: 'From the knees.', hard: 'Add a push-up.',
    A: PB.plank([0, 0], { eq: [db()] }), B: Object.assign(PB.plank([0, 0], { af: [0, 0] }), { an: [-60, 6], eq: [db()] })
  });
  X('db_latraise', 'Lateral raise', 'db', 'arms', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['shoulders'], sec: ['traps'],
    how: ['Light dumbbells at the sides, slight bend in the elbows.', 'Raise the arms out to the sides up to shoulder height.', 'Lower slowly.'],
    cue: ['Lead with the elbows, pinkies slightly up.'], err: ['Swinging and shrugging.'],
    easy: 'One arm at a time.', hard: 'Slow 3 s lowering.',
    A: front({ an: [-8, -4], af: [8, 4], eq: two }), B: front({ an: [-88, -92], af: [88, 92], eq: two })
  });
  X('db_reardelt', 'Rear delt fly', 'db', 'prehab', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['shoulders', 'upperback'], sec: ['traps'],
    how: ['Hinge forward until the torso is nearly level, light dumbbells hanging.', 'Raise the arms out to the sides, squeezing the shoulder blades.', 'Lower slowly.'],
    cue: ['Small weight, big squeeze.'], err: ['Using momentum.'],
    easy: 'band_pullapart', hard: 'Pause at the top.',
    A: back({ t: 0, an: [-4, -4], af: [4, 4], eq: two }), B: back({ an: [-90, -90], af: [90, 90], eq: two })
  });
  X('db_curl', 'Biceps / hammer curl', 'db', 'arms', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['biceps', 'forearms'], sec: [],
    how: ['Dumbbells at the sides, palms forward (hammer: palms facing in).', 'Curl up to the shoulders.', 'Lower slowly.'],
    cue: ['Elbows pinned.'], err: ['Swinging the hips.'],
    easy: 'band_curl', hard: 'Slow lowering.',
    A: stand({ an: [2, 4], eq: [db()] }), B: stand({ an: [4, 160], eq: [db()] })
  });
  X('db_ohext', 'Overhead triceps extension', 'db', 'arms', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['triceps'], sec: ['shoulders'],
    how: ['Hold one dumbbell with both hands over the head.', 'Bend the elbows to lower it behind the head.', 'Straighten the arms.'],
    cue: ['Elbows point forward, close to the head.'], err: ['Elbows flaring wide.'],
    easy: 'band_pushdown', hard: 'Heavier dumbbell.',
    A: stand({ an: [176, 178], hn: 178, eq: [db()] }), B: stand({ an: [170, -10], hn: -10, eq: [db()] })
  });
  X('db_pullover', 'Pullover', 'db', 'arms', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['lats', 'chest'], sec: ['triceps', 'abs'],
    how: ['Lie on the floor or across a bench, one dumbbell held with both hands above the chest.', 'With slightly bent arms, lower it behind the head.', 'Pull it back over the chest.'],
    cue: ['Ribs stay down.'], err: ['Arching the back to reach further.'],
    easy: 'Lighter dumbbell.', hard: 'Across a bench.',
    A: supine({ ln: { to: [148, 196], bend: -1 }, an: [178, 178], hn: 180, eq: [db()] }), B: supine({ ln: { to: [148, 196], bend: -1 }, an: [-110, -116], hn: -116, eq: [db()] })
  });
  X('db_shrug', 'Shrug', 'db', 'neck', {
    lvl: 1, equip: ['db'], dose: 'load', prim: ['traps'], sec: ['forearms', 'neck'],
    how: ['Heavy dumbbells at the sides.', 'Lift the shoulders straight up towards the ears.', 'Hold 1 s and lower fully.'],
    cue: ['Straight up, no rolling.'], err: ['Bending the elbows.'],
    easy: 'Lighter dumbbells.', hard: 'Longer holds.',
    A: front({ an: [-4, -2], af: [4, 2], eq: two }), B: front({ p: [100, 106], an: [-4, -2], af: [4, 2], eq: two })
  });
  X('db_farmer', 'Farmer carry', 'db', 'carry', {
    lvl: 1, equip: ['db'], dose: 'carry', prim: ['forearms', 'traps', 'abs'], sec: ['upperback', 'glutes', 'calves'],
    how: ['Heavy dumbbell (or kettlebell) in each hand.', 'Walk tall with short, fast steps.', 'Set them down with a flat back.'],
    cue: ['Crush the handles.', 'Shoulders back and down.'], err: ['Leaning or shrugging.'],
    easy: 'Shorter distance.', hard: 'grip_farmer',
    A: stand({ ln: [-14, -10], lf: [14, 4], an: [2, 2], eq: [db()] }), B: stand({ ln: [12, 4], lf: [-14, -10], an: [2, 2], eq: [db()] })
  });
})();
