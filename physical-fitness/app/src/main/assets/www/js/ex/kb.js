/* Kettlebell exercises (bells 10 / 12 / 16 / 24 kg by default) */
'use strict';
(function () {
  const { stand, hinge, split, supine, kneel, front, arm } = PB;
  const F = FIG;
  const kb = (o = {}) => Object.assign({ k: 'kb', a: 0 }, o);
  const rack = (P, side = 'an') => arm(P, { [side]: [9, 6, 1] });
  const lock = [176, 178];

  X('kb_swing', 'Two-hand swing', 'kb', 'hinge', {
    lvl: 1, equip: ['kb'], dose: 'load', prim: ['glutes', 'hamstrings', 'lowerback'], sec: ['quads', 'abs', 'forearms', 'shoulders'],
    how: ['Bell a step in front of you. Hinge, grab the handle with both hands and hike it back between the legs.', 'Snap the hips forward and stand tall: the bell floats up to chest height.', 'Let it fall, hinge late and hike it back again. Repeat.'],
    cue: ['It is a jump with the feet on the floor, not a squat.', 'Arms are ropes: the hips do the work.'], err: ['Squatting the bell up.', 'Lifting with the arms.', 'Leaning back at the top.'],
    easy: 'kb_deadlift', hard: 'kb_swing1',
    A: hinge(58, 88, 122, { an: { to: [92, 150] }, h: -30, eq: [kb({ a: -30, mid: true })] }), B: stand({ an: [88, 90], eq: [kb({ a: 80 })] })
  });
  X('kb_swing1', 'One-arm swing', 'kb', 'hinge', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['glutes', 'hamstrings', 'obliques'], sec: ['forearms', 'lowerback', 'shoulders'],
    how: ['Same as the two-hand swing with one hand on the handle.', 'Keep the shoulders square: do not let the bell twist you.', 'Switch hands after the set (or hand-to-hand at the top).'],
    cue: ['Free arm moves along with the swing.'], err: ['Rotating the torso with the bell.'],
    easy: 'kb_swing', hard: 'kb_snatch',
    A: hinge(58, 88, 122, { an: { to: [92, 150] }, af: [20, 20], h: -30, eq: [kb({ a: -30, mid: true })] }), B: stand({ an: [88, 90], af: [-10, -6], eq: [kb({ a: 80 })] })
  });
  X('kb_deadlift', 'Kettlebell deadlift', 'kb', 'hinge', {
    lvl: 1, equip: ['kb'], dose: 'load', prim: ['glutes', 'hamstrings'], sec: ['lowerback', 'quads', 'forearms'],
    how: ['Bell between the feet. Push the hips back, flat back, grip the handle.', 'Stand up by driving the hips forward.', 'Push the hips back again and set the bell down.'],
    cue: ['Shins nearly vertical.', 'Proud chest, long neck.'], err: ['Rounding the back.', 'Bell too far in front.'],
    hard: 'kb_swing',
    A: hinge(60, 84, 126, { an: [4, 4], h: -30, eq: [kb({ a: 0 })] }), B: stand({ an: [2, 2], eq: [kb({ a: 0 })] })
  });
  X('kb_sldl', 'Single-leg Romanian deadlift', 'kb', 'hinge', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['hamstrings', 'glutes'], sec: ['lowerback', 'calves', 'forearms'],
    how: ['Stand on one leg, bell in the opposite hand.', 'Hinge forward while the free leg reaches straight back, until the torso is nearly level.', 'Stand back up by squeezing the glute of the standing leg.'],
    cue: ['Hips stay square to the floor.', 'Soft knee on the standing leg.'], err: ['Opening the hip of the free leg.', 'Rounding the back.'],
    easy: 'Touch the toes of the free leg on the floor.', hard: 'Heavier bell.',
    A: stand({ an: [2, 2], lf: [-4, -4], eq: [kb({ a: 0 })] }), B: hinge(76, 96, 116, { an: [4, 4], lf: [-80, -80], ff: 10, h: -20, eq: [kb({ a: 0 })] })
  });
  X('goblet', 'Goblet squat', 'kb', 'squat', {
    lvl: 1, equip: ['kb'], dose: 'load', prim: ['quads', 'glutes', 'adductors'], sec: ['abs', 'upperback', 'biceps'],
    how: ['Hold the bell by the horns at the chest, elbows down.', 'Squat between the knees until the elbows touch the inside of the knees.', 'Drive up, chest tall.'],
    cue: ['Elbows push the knees out at the bottom.'], err: ['Heels lifting.', 'Bell drifting away from the chest.'],
    easy: 'squat', hard: 'kb_frontsquat',
    A: arm(stand(), { an: [12, 26, 1], eq: [kb({ a: 180 })] }), B: arm(hinge(26, 86, 152), { an: [12, 26, 1], eq: [kb({ a: 180 })] })
  });
  X('kb_frontsquat', 'Front rack squat (one or two bells)', 'kb', 'squat', {
    lvl: 2, equip: ['kb'], dose: 'load', prim: ['quads', 'glutes', 'abs'], sec: ['upperback', 'adductors'],
    how: ['Clean the bell(s) to the rack: handle in the palm, bell on the back of the forearm, elbow tucked.', 'Squat down with an upright torso.', 'Stand up, keep the rack tight.'],
    cue: ['Brace like someone will punch your belly.'], err: ['Elbows flaring and the bell pulling you forward.'],
    easy: 'goblet', hard: 'Two bells.',
    A: rack(stand(), 'an'), B: rack(hinge(22, 88, 154))
  });
  X('kb_clean', 'Clean', 'kb', 'power', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['glutes', 'hamstrings', 'upperback'], sec: ['forearms', 'biceps', 'lowerback'],
    how: ['Start like a one-arm swing.', 'Snap the hips and pull the elbow close to the body: the bell travels close and rolls around the hand.', 'Catch it softly in the rack position, then drop back into the swing.'],
    cue: ['Zip up a jacket: keep the bell close.'], err: ['Letting the bell flip over and bang the forearm.'],
    easy: 'kb_swing1', hard: 'Two bells.',
    A: hinge(58, 88, 122, { an: { to: [92, 150] }, h: -30, eq: [kb({ a: -30, mid: true })] }), B: Object.assign(rack(stand()), { eq: [kb({ a: -25, mid: true })] })
  });
  X('kb_press', 'Overhead press', 'kb', 'vpush', {
    lvl: 1, equip: ['kb'], dose: 'load', side: true, prim: ['shoulders', 'triceps'], sec: ['traps', 'abs', 'upperback'],
    how: ['Bell in the rack position, glutes and belly tight.', 'Press the bell straight up until the arm is locked next to the ear.', 'Lower under control back to the rack.'],
    cue: ['Forearm vertical the whole way.', 'Do not lean back.'], err: ['Arching the lower back.', 'Bent elbow at the top.'],
    easy: 'Half-kneeling press.', hard: 'kb_pushpress',
    A: Object.assign(rack(stand()), { eq: [kb({ a: -25, mid: true })] }), B: stand({ an: lock, hn: 178, eq: [kb({ a: -150 })] })
  });
  X('kb_pushpress', 'Push press', 'kb', 'vpush', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['shoulders', 'triceps', 'quads'], sec: ['glutes', 'abs', 'calves'],
    how: ['Bell in the rack.', 'Dip a few centimetres by bending the knees, torso upright.', 'Drive up hard with the legs and use that momentum to press the bell overhead. Lower to the rack.'],
    cue: ['Short, fast dip.'], err: ['Dipping too deep like a squat.'],
    easy: 'kb_press', hard: 'Two bells.',
    A: Object.assign(rack(hinge(10, 96, 120)), { eq: [kb({ a: -25, mid: true })] }), B: stand({ an: lock, fn: 60, eq: [kb({ a: -150 })] })
  });
  X('kb_snatch', 'Snatch', 'kb', 'power', {
    lvl: 3, equip: ['kb'], dose: 'load', side: true, prim: ['glutes', 'shoulders', 'upperback'], sec: ['hamstrings', 'forearms', 'traps'],
    how: ['Hike the bell back like a one-arm swing.', 'Snap the hips, pull the elbow back high, then punch the hand up through the handle.', 'Lock out overhead, then drop the bell back between the legs.'],
    cue: ['Punch through at the top so the bell does not crash on the wrist.'], err: ['Arm-lifting the bell.', 'Bell flipping over hard.'],
    easy: 'kb_clean', hard: 'Heavier bell or timed sets.',
    A: hinge(58, 88, 122, { an: { to: [92, 150] }, h: -30, eq: [kb({ a: -30, mid: true })] }), B: stand({ an: lock, eq: [kb({ a: -150 })] })
  });
  X('kb_tgu', 'Turkish get-up', 'kb', 'core', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['shoulders', 'abs', 'obliques'], sec: ['glutes', 'triceps', 'quads'],
    how: ['Lie on your back, bell pressed straight up in one hand, same-side knee bent.', 'Roll to the elbow, then to the hand; bridge the hips and sweep the straight leg under to a kneel.', 'Stand up from the lunge. Reverse every step to lie down again.'],
    cue: ['Eyes on the bell until you kneel.', 'Arm locked the whole time.'], err: ['Rushing the steps.', 'Bent elbow.'],
    easy: 'Only to the elbow (half get-up).', hard: 'Heavier bell.',
    A: supine({ ln: { to: [148, 196], bend: -1 }, lf: [92, 92], an: [180, 180], hn: 180, af: [-80, -80], eq: [kb({ a: -170 })] }),
    B: supine({ t: -42, h: 20, ln: { to: [148, 196], bend: -1 }, lf: [92, 92], an: [180, 180], af: [-20, -20], eq: [kb({ a: -170 })] })
  });
  X('kb_row', 'Single-arm row', 'kb', 'hpull', {
    lvl: 1, equip: ['kb'], dose: 'load', side: true, prim: ['lats', 'upperback', 'biceps'], sec: ['forearms', 'shoulders', 'lowerback'],
    how: ['Stagger stance, free hand on a bench or knee, flat back.', 'Pull the bell towards the hip, elbow close to the body.', 'Lower until the arm is straight.'],
    cue: ['Pull to the hip pocket, not to the chest.'], err: ['Twisting the torso to lift.', 'Shrugging.'],
    easy: 'Lighter bell.', hard: 'kb_gorilla',
    A: hinge(64, 88, 124, { an: [4, 4], h: -26, eq: [kb({ a: 0 })] }), B: hinge(64, 88, 124, { an: [-56, 0], h: -26, eq: [kb({ a: 0 })] })
  });
  X('kb_gorilla', 'Gorilla row (two bells)', 'kb', 'hpull', {
    lvl: 2, equip: ['kb'], dose: 'load', prim: ['lats', 'upperback', 'abs'], sec: ['biceps', 'forearms', 'glutes'],
    how: ['Two bells between wide feet, deep hinge, both hands on the handles.', 'Row one bell to the hip while pushing the other into the floor.', 'Alternate sides.'],
    cue: ['Torso stays still and level.'], err: ['Rocking the torso.'],
    easy: 'kb_row', hard: 'Heavier bells.',
    A: hinge(70, 86, 130, { an: [-50, 0], af: [6, 6], h: -26, eq: [kb({ a: 0 }), kb({ a: 0, at: 'hnF', back: true })] }),
    B: hinge(70, 86, 130, { an: [6, 6], af: [-50, 0], h: -26, eq: [kb({ a: 0 }), kb({ a: 0, at: 'hnF', back: true })] })
  });
  X('kb_floorpress', 'Floor press', 'kb', 'hpush', {
    lvl: 1, equip: ['kb'], dose: 'load', side: true, prim: ['chest', 'triceps'], sec: ['shoulders'],
    how: ['Lie on your back, knees bent, bell in one hand with the elbow on the floor.', 'Press the bell straight up to a locked arm.', 'Lower until the upper arm touches the floor.'],
    cue: ['Wrist straight, bell on the back of the forearm.'], err: ['Bouncing the elbow off the floor.'],
    easy: 'Lighter bell.', hard: 'Two bells.',
    A: supine({ ln: { to: [148, 196], bend: -1 }, an: [80, 178], hn: 180, eq: [kb({ a: 25 })] }), B: supine({ ln: { to: [148, 196], bend: -1 }, an: [178, 178], hn: 180, eq: [kb({ a: 25 })] })
  });
  X('kb_windmill', 'Windmill', 'kb', 'rot', {
    lvl: 3, equip: ['kb'], dose: 'load', side: true, prim: ['obliques', 'shoulders', 'glutes'], sec: ['hamstrings', 'adductors', 'abs'],
    how: ['Bell locked out overhead, feet turned away from the bell side.', 'Push the hip out to the bell side and hinge down sideways, free hand sliding down the leg.', 'Eyes on the bell; come back up the same way.'],
    cue: ['Bell arm stays vertical.'], err: ['Bending the bell arm.', 'Rounding instead of hinging.'],
    easy: 'No weight.', hard: 'Bell in the bottom hand as well.',
    A: front({ an: [-4, -4], af: [176, 176], ln: [-8, -8], lf: [8, 8], eq: [kb({ a: 170, at: 'hnF' })] }),
    B: front({ t: -42, p: [112, 108], an: [-8, -8], af: [180, 180], ln: [-10, -10], lf: [6, 6], eq: [kb({ a: 170, at: 'hnF' })] })
  });
  X('kb_halo', 'Halo', 'kb', 'prehab', {
    lvl: 1, equip: ['kb'], dose: 'load', prim: ['shoulders', 'traps'], sec: ['abs', 'triceps', 'upperback'],
    how: ['Hold the bell upside down by the horns in front of the chest.', 'Circle it around the head, close to the ears and the back of the head.', 'Change direction after half the reps.'],
    cue: ['Head and hips stay still.'], err: ['Circling the head instead of the bell.'],
    easy: 'Lighter bell.', hard: 'Half-kneeling.',
    A: arm(front(), { an: [10, 2, -1], af: [-10, 2, 1], eq: [kb({ a: 180, c: true })] }), B: arm(front(), { an: [24, -30, -1], af: [4, -24, 1], eq: [kb({ a: 180, at: 'hnF' })] })
  });
  X('kb_complex', 'Clean + press + squat complex', 'kb', 'cond', {
    lvl: 2, equip: ['kb'], dose: 'load', side: true, prim: ['glutes', 'shoulders', 'quads'], sec: ['hamstrings', 'triceps', 'abs', 'upperback'],
    how: ['Clean the bell to the rack.', 'Press it overhead and lower it back to the rack.', 'Squat with the bell in the rack. That is one rep.'],
    cue: ['Breathe at the top of each part.'], err: ['Losing the rack position when tired.'],
    easy: 'Fewer reps per side.', hard: 'Two bells.',
    A: hinge(58, 88, 122, { an: { to: [92, 150] }, h: -30, eq: [kb({ a: -30, mid: true })] }), B: stand({ an: lock, eq: [kb({ a: -150 })] })
  });
  X('kb_rackcarry', 'Rack carry', 'kb', 'carry', {
    lvl: 1, equip: ['kb'], dose: 'carry', side: true, prim: ['abs', 'upperback'], sec: ['obliques', 'shoulders', 'biceps'],
    how: ['Clean one or two bells to the rack.', 'Walk tall with short steps.', 'Switch sides after the distance.'],
    cue: ['Ribs down, no leaning.'], err: ['Leaning away from a single bell.'],
    easy: 'Lighter bell.', hard: 'Two bells, or one rack + one overhead.',
    A: Object.assign(rack(stand({ ln: [-14, -10], lf: [14, 4] })), { eq: [kb({ a: -25, mid: true })] }), B: Object.assign(rack(stand({ ln: [12, 4], lf: [-14, -10] })), { eq: [kb({ a: -25, mid: true })] })
  });
})();
