/* Resistance band exercises (long loop bands; mini band for the hips) */
'use strict';
(function () {
  const { stand, hinge, supine, kneel, front, back, arm, hang } = PB;
  const band = (from, to, o) => Object.assign({ k: 'band', from, to }, o || {});

  X('band_pullapart', 'Band pull-apart', 'band', 'prehab', {
    lvl: 1, equip: ['band'], prim: ['upperback', 'shoulders'], sec: ['traps'],
    how: ['Hold a light band in front of the chest with straight arms, hands shoulder-width.', 'Pull the band apart until it touches the chest, squeezing the shoulder blades.', 'Return slowly.'],
    cue: ['Shoulders down, away from the ears.'], err: ['Bending the elbows a lot.', 'Arching the back.'],
    easy: 'Wider grip.', hard: 'Narrower grip or a stronger band.',
    A: back({ an: [-150, -150], af: [150, 150], eq: [band('hnN', 'hnF')] }), B: back({ an: [-95, -95], af: [95, 95], eq: [band('hnN', 'hnF')] })
  });
  X('band_facepull', 'Face pull', 'band', 'prehab', {
    lvl: 1, equip: ['band'], prim: ['shoulders', 'upperback'], sec: ['traps', 'biceps'],
    how: ['Anchor the band at face height, hold one end in each hand, step back until it is tight.', 'Pull towards the forehead, hands going apart and back, elbows high.', 'Finish like a double-biceps pose, then return slowly.'],
    cue: ['Thumbs point back at the end.'], err: ['Pulling to the chest with low elbows.'],
    easy: 'Lighter band.', hard: 'Pause 2 s at the end.',
    A: stand({ an: [88, 90], eq: [band('hnN', [178, 70])] }), B: arm(stand(), { an: [-6, -16, 1], hn: 150, eq: [band('hnN', [178, 70])] })
  });
  X('band_row', 'Band row (anchored)', 'band', 'hpull', {
    lvl: 1, equip: ['band'], prim: ['lats', 'upperback'], sec: ['biceps', 'shoulders'],
    how: ['Anchor the band at chest height and step back until it is tight.', 'Pull the hands to the lower ribs, elbows close to the body.', 'Straighten the arms slowly.'],
    cue: ['Squeeze the shoulder blades, then pull.'], err: ['Leaning back to finish the rep.'],
    easy: 'Step closer to the anchor.', hard: 'Step further away.',
    A: stand({ an: [86, 90], eq: [band('hnN', [180, 84])] }), B: stand({ an: [-40, 80], eq: [band('hnN', [180, 84])] })
  });
  X('band_pulldown', 'Band lat pulldown (anchored high)', 'band', 'vpull', {
    lvl: 1, equip: ['band', 'bar'], prim: ['lats'], sec: ['biceps', 'upperback'],
    how: ['Loop the band over the pull-up bar, kneel underneath and hold both ends.', 'Pull the elbows down to the sides until the hands are at the shoulders.', 'Let the arms go back up slowly.'],
    cue: ['Chest up, elbows to the back pockets.'], err: ['Rounding forward.'],
    easy: 'Lighter band.', hard: 'Stronger band or kneel further down.',
    A: kneel({ an: [176, 178], hn: 178, eq: [band('hnN', [104, 20]), { k: 'bar', at: [104, 18], back: true, fixed: true }] }),
    B: arm(kneel(), { an: [8, -14, 1], hn: 180, eq: [band('hnN', [104, 20]), { k: 'bar', at: [104, 18], back: true, fixed: true }] })
  });
  X('band_pullup', 'Band-assisted pull-up', 'band', 'vpull', {
    lvl: 1, equip: ['band', 'bar'], prim: ['lats', 'biceps'], sec: ['upperback', 'forearms'], noFloor: true,
    how: ['Loop a band over the bar and put one knee or foot in the loop.', 'Pull up until the chin is over the bar.', 'Lower slowly to straight arms.'],
    cue: ['Use the lightest band that lets you do all the reps.'], err: ['Bouncing out of the bottom on the band.'],
    easy: 'Stronger band.', hard: 'pullup',
    A: hang(104, 30, { ln: [10, -40], eq: [band([104, 31], [98, 200], { anchor: false })] }), B: hang(104, 30, { p: [100, 92], t: -4, ln: [14, -40], eq: [band([104, 31], [94, 166], { anchor: false })] })
  });
  X('band_chestpress', 'Band chest press (anchored)', 'band', 'hpush', {
    lvl: 1, equip: ['band'], prim: ['chest', 'triceps'], sec: ['shoulders', 'abs'],
    how: ['Anchor the band behind you at chest height, one end in each hand.', 'Step forward until it is tight, press the hands straight forward.', 'Return slowly until the hands are at the chest.'],
    cue: ['Split stance for balance.'], err: ['Letting the band pull the shoulders back.'],
    easy: 'Lighter band.', hard: 'One arm at a time.',
    A: arm(stand({ ln: [10, 4], lf: [-12, -8] }), { an: [-4, 18, 1], hn: 90, eq: [band('hnN', [20, 80])] }), B: stand({ ln: [10, 4], lf: [-12, -8], an: [88, 90], eq: [band('hnN', [20, 80])] })
  });
  X('band_press', 'Band overhead press', 'band', 'vpush', {
    lvl: 1, equip: ['band'], prim: ['shoulders', 'triceps'], sec: ['traps', 'abs'],
    how: ['Stand on the band, hold the ends at the shoulders.', 'Press straight up to locked arms.', 'Lower to the shoulders.'],
    cue: ['Glutes tight, ribs down.'], err: ['Leaning back.'],
    easy: 'Lighter band.', hard: 'Stronger band.',
    A: arm(stand(), { an: [8, 4, 1], hn: 180, eq: [band('hnN', [104, 198], { anchor: false })] }), B: stand({ an: [176, 178], hn: 178, eq: [band('hnN', [104, 198], { anchor: false })] })
  });
  X('band_pallof', 'Pallof press', 'band', 'rot', {
    lvl: 1, equip: ['band'], dose: 'reps', side: true, prim: ['obliques', 'abs'], sec: ['shoulders', 'glutes'],
    how: ['Anchor the band at chest height to your side. Hold it with both hands at the chest, step away until it pulls.', 'Press the hands straight forward and hold 2 seconds without turning.', 'Bring them back to the chest.'],
    cue: ['The band tries to twist you: do not let it.'], err: ['Rotating towards the anchor.'],
    easy: 'Step closer.', hard: 'Half-kneeling or longer holds.',
    A: arm(front(), { an: [15, 30, -1], af: [-15, 30, 1], eq: [band('hnN', [10, 86])] }), B: arm(front(), { an: [15, 30, -1], af: [-15, 30, 1], eq: [band('hnN', [10, 86])] })
  });
  X('band_woodchop', 'Band woodchop', 'band', 'rot', {
    lvl: 1, equip: ['band'], side: true, prim: ['obliques', 'shoulders'], sec: ['abs', 'glutes'],
    how: ['Anchor the band high to one side, hold it with both hands.', 'Pull it diagonally down across the body to the opposite hip, turning the chest and pivoting the back foot.', 'Return slowly.'],
    cue: ['The power comes from the hips and trunk, arms stay long.'], err: ['Pulling only with the arms.'],
    easy: 'Lighter band.', hard: 'Low-to-high direction too.',
    A: front({ an: [-150, -150], af: [-170, -170], eq: [band('hnN', [26, 30])] }), B: front({ t: 12, an: [30, 30], af: [14, 14], ln: [-8, -8], lf: [8, 8], eq: [band('hnN', [26, 30])] })
  });
  X('band_goodmorning', 'Banded good morning', 'band', 'hinge', {
    lvl: 1, equip: ['band'], prim: ['hamstrings', 'lowerback'], sec: ['glutes'],
    how: ['Stand on the band, loop the other end behind the neck over the upper back.', 'Push the hips back with a flat back until the torso is nearly level.', 'Drive the hips forward to stand up.'],
    cue: ['Soft knees, long spine.'], err: ['Rounding the back.'],
    easy: 'Lighter band.', hard: 'Pause at the bottom.',
    A: arm(stand(), { an: [6, 2, 1], hn: 160, eq: [band('neck', [100, 198], { anchor: false })] }), B: arm(hinge(70, 86, 120, { h: -20 }), { an: [6, 2, 1], hn: 160, eq: [band('neck', [100, 198], { anchor: false })] })
  });
  X('band_latwalk', 'Lateral band walk (mini band)', 'band', 'prehab', {
    lvl: 1, equip: ['mini'], dose: 'reps', side: true, prim: ['glutes'], sec: ['adductors', 'quads'],
    how: ['Mini band above the knees or around the ankles, quarter squat.', 'Step sideways with control, keep tension on the band.', 'Count steps per side.'],
    cue: ['Toes forward, knees out.'], err: ['Feet coming together.'],
    easy: 'Band above the knees.', hard: 'Band around the feet.',
    A: front({ p: [100, 118], ln: [-10, -6], lf: [10, 6], eq: [band('knN', 'knF', { mini: true })] }), B: front({ p: [100, 118], ln: [-18, -14], lf: [18, 14], eq: [band('knN', 'knF', { mini: true })] })
  });
  X('band_monster', 'Monster walk (mini band)', 'band', 'prehab', {
    lvl: 1, equip: ['mini'], dose: 'reps', prim: ['glutes'], sec: ['quads', 'adductors'],
    how: ['Mini band around the ankles or above the knees, athletic stance.', 'Walk forward diagonally: out and forward with each step.', 'Then walk backwards the same way.'],
    cue: ['Stay low the whole time.'], err: ['Standing up tall between steps.'],
    easy: 'Smaller steps.', hard: 'Stronger band.',
    A: hinge(20, 96, 124, { ln: { to: [116, 196] }, lf: { to: [84, 196] }, an: [30, 60], eq: [band('anN', 'anF', { mini: true })] }), B: hinge(20, 96, 124, { ln: { to: [88, 196] }, lf: { to: [112, 196] }, an: [30, 60], eq: [band('anN', 'anF', { mini: true })] })
  });
  X('band_extrot', 'External rotation', 'band', 'prehab', {
    lvl: 1, equip: ['band'], side: true, prim: ['shoulders'], sec: ['upperback'],
    how: ['Anchor the band at elbow height to your side. Elbow bent 90° and tucked against the ribs (a towel in the armpit helps).', 'Rotate the forearm outwards, away from the body.', 'Return slowly.'],
    cue: ['The elbow does not leave the ribs.'], err: ['Turning the whole body.'],
    easy: 'Lighter band.', hard: 'Arm out to the side at 90°.',
    A: arm(front(), { an: [2, 46, -1], eq: [band('hnN', [150, 104])] }), B: arm(front(), { an: [-28, 46, 1], eq: [band('hnN', [150, 104])] })
  });
  X('band_dislocate', 'Band dislocate (pass-through)', 'band', 'mob', {
    lvl: 1, equip: ['band'], prim: ['shoulders', 'chest'], sec: ['upperback', 'traps'],
    how: ['Hold a light band very wide in front of the hips, arms straight.', 'Lift it over the head and behind you down to the lower back.', 'Bring it back the same way.'],
    cue: ['Go wider if you have to bend the elbows.'], err: ['Arching the lower back.'],
    easy: 'Wider grip.', hard: 'Narrower grip.',
    A: front({ an: [-30, -30], af: [30, 30], eq: [band('hnN', 'hnF')] }), B: front({ an: [-160, -160], af: [160, 160], eq: [band('hnN', 'hnF')] })
  });
  X('band_pushdown', 'Triceps pushdown', 'band', 'arms', {
    lvl: 1, equip: ['band', 'bar'], prim: ['triceps'], sec: ['forearms'],
    how: ['Loop the band over the pull-up bar, hold it at chest height, elbows at the sides.', 'Push the hands down until the arms are straight.', 'Let them come back up to chest height.'],
    cue: ['Only the forearms move.'], err: ['Elbows drifting forward.'],
    easy: 'Lighter band.', hard: 'Pause at the bottom.',
    A: stand({ an: [4, 150], eq: [band('hnN', [112, 20]), { k: 'bar', at: [112, 18], back: true, fixed: true }] }), B: stand({ an: [4, 10], eq: [band('hnN', [112, 20]), { k: 'bar', at: [112, 18], back: true, fixed: true }] })
  });
  X('band_curl', 'Biceps curl', 'band', 'arms', {
    lvl: 1, equip: ['band'], prim: ['biceps'], sec: ['forearms'],
    how: ['Stand on the band, ends in the hands, palms forward.', 'Curl the hands up to the shoulders.', 'Lower slowly.'],
    cue: ['Elbows stay at the sides.'], err: ['Swinging the body.'],
    easy: 'Lighter band.', hard: 'Stronger band.',
    A: stand({ an: [2, 4], eq: [band('hnN', [102, 198], { anchor: false })] }), B: stand({ an: [4, 160], eq: [band('hnN', [102, 198], { anchor: false })] })
  });
  X('band_hamstretch', 'Banded hamstring stretch', 'band', 'mob', {
    lvl: 1, equip: ['band'], dose: 'time', side: true, prim: ['hamstrings'], sec: ['calves'],
    how: ['Lie on your back, band around one foot.', 'Pull the straight leg up until you feel a stretch behind the thigh.', 'Breathe slowly and relax into it.'],
    cue: ['Other leg stays long on the floor.'], err: ['Bending the knee of the stretched leg.'],
    easy: 'Bend the other knee.', hard: 'Pull the toes towards you too.',
    A: supine({ ln: [140, 140], lf: [90, 90], fn: 230, an: { to: [130, 150] }, eq: [band('hnN', 'toeN', { anchor: false })] }),
    B: supine({ ln: [170, 170], lf: [90, 90], fn: 260, an: { to: [116, 140] }, eq: [band('hnN', 'toeN', { anchor: false })] })
  });
})();
