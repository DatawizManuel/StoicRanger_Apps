/* Bodyweight exercises */
'use strict';
(function () {
  const { stand, hinge, split, plank, supine, prone, kneel, hang, sit, front, back, legsTo, fit } = PB;
  const F = FIG;

  X('pushup', 'Push-up', 'bw', 'hpush', {
    lvl: 1, prim: ['chest', 'triceps', 'shoulders'], sec: ['abs', 'quads'],
    how: ['Hands on the floor a bit wider than the shoulders, body straight from head to heels.', 'Lower the chest until it is a fist above the floor, elbows about 45° from the body.', 'Push the floor away until the arms are straight.'],
    cue: ['Squeeze glutes and brace the belly: the body moves as one plank.', 'Look at the floor just ahead of the hands.'],
    err: ['Hips sagging or piking up.', 'Elbows flared straight out to the sides.'],
    easy: 'pushup_incline', hard: 'pushup_decline',
    A: plank([0, 0]), B: plank([-62, -2])
  });
  X('pushup_incline', 'Incline push-up', 'bw', 'hpush', {
    lvl: 1, equip: ['bench'], prim: ['chest', 'triceps', 'shoulders'], sec: ['abs'],
    how: ['Hands on a bench, chair or table edge, body straight.', 'Lower the chest to the edge.', 'Push back up to straight arms.'],
    cue: ['The higher the hands, the easier it gets.'], err: ['Hips leading the movement.'],
    hard: 'pushup',
    A: incl(0), B: incl(1)
  });
  function incl(k) {
    const t = 52 + k * 6; const P = { p: [70, 0], t, ln: [-t, -t], fn: 95 - t, hn: 90, eq: [{ k: 'bench', at: [140, 152], w: 46, fixed: true }] };
    P.p[1] = 0; let Pf = F.fit(P, ['toeN']);
    Pf.an = { to: [138, 150], bend: 1 }; Pf.fist = false;
    return Pf;
  }
  X('pushup_decline', 'Decline push-up', 'bw', 'hpush', {
    lvl: 2, equip: ['bench'], prim: ['chest', 'shoulders', 'triceps'], sec: ['abs'],
    how: ['Feet on a bench or chair, hands on the floor.', 'Lower the chest towards the floor with a straight body.', 'Press back up.'],
    cue: ['Keep the belly tight so the lower back does not sag.'], err: ['Head dropping first.'],
    easy: 'pushup', hard: 'pushup_pike',
    A: decl(0), B: decl(1)
  });
  function decl(k) {
    const t = 104; const P = { p: [80, 120], t, ln: [-t + 180 - 180, -t], an: k ? [-60, -4] : [-3, -3], fn: -14, hn: 90, eq: [{ k: 'bench', at: [24, 150], w: 46, fixed: true }] };
    P.ln = [-t, -t];
    return F.fit(P, ['haN']);
  }
  X('pushup_pike', 'Pike push-up', 'bw', 'vpush', {
    lvl: 2, prim: ['shoulders', 'triceps'], sec: ['traps', 'chest'],
    how: ['Hands and feet on the floor, hips high: the body makes an upside-down V.', 'Bend the elbows and lower the top of the head towards the floor in front of the hands.', 'Press back up until the arms are straight.'],
    cue: ['Head goes forward of the hands, so the path is like an overhead press.'], err: ['Turning it into a normal push-up by dropping the hips.'],
    easy: 'pushup', hard: 'Feet on a chair (elevated pike push-up).',
    A: pike(0), B: pike(1)
  });
  function pike(k) {
    return F.balance(v => ({ p: [100, 110], t: 122 + k * 14, ln: [v, v], an: k ? [-20, 50] : [58, 58], fn: 60, hn: 90, h: k ? -30 : -10 }), 'haN', 'toeN', -45, 5);
  }
  X('dip', 'Dips (chair or parallel bars)', 'bw', 'vpush', {
    lvl: 2, equip: ['bench'], prim: ['triceps', 'chest'], sec: ['shoulders'],
    how: ['Hands on the edge of a sturdy chair or on parallel bars, arms straight.', 'Bend the elbows and lower until the upper arms are about level.', 'Press back up to straight arms.'],
    cue: ['Shoulders down, away from the ears.', 'Elbows point straight back.'], err: ['Dropping too deep with rounded shoulders.', 'Bouncing at the bottom.'],
    easy: 'Bent knees, feet closer to the chair.', hard: 'Parallel bars with straight legs.',
    A: dip(0), B: dip(1)
  });
  function dip(k) {
    const bx = 82; const P = { p: [88, 128 + k * 24], t: -4, ln: { to: [150, 196] }, fn: 120, an: { to: [bx, 140], bend: 1 }, hn: 180, eq: [{ k: 'bench', at: [70, 146], w: 40, fixed: true }] };
    P.ln = [74, 2];
    return P;
  }
  X('pullup', 'Pull-up', 'bw', 'vpull', {
    lvl: 2, equip: ['bar'], prim: ['lats', 'biceps', 'upperback'], sec: ['forearms', 'abs'], noFloor: true,
    how: ['Hang from the bar, palms facing away, hands a bit wider than the shoulders.', 'Pull the shoulder blades down, then pull until the chin is over the bar.', 'Lower under control to straight arms.'],
    cue: ['Think "elbows into the back pockets".', 'Legs still, no swinging.'], err: ['Half reps: not straightening the arms at the bottom.', 'Kicking the legs.'],
    easy: 'band_pullup', hard: 'Add weight in a backpack.',
    A: hang(104, 30), B: hang(104, 30, { p: [99, 92], t: -6, h: 10, ln: [14, -16] })
  });
  X('chinup', 'Chin-up', 'bw', 'vpull', {
    lvl: 2, equip: ['bar'], prim: ['biceps', 'lats'], sec: ['upperback', 'forearms', 'abs'], noFloor: true,
    how: ['Hang with palms facing you, hands shoulder-width.', 'Pull until the chin is over the bar.', 'Lower slowly to straight arms.'],
    cue: ['Chest to the bar, not just the chin.'], err: ['Craning the neck to reach the bar.'],
    easy: 'band_pullup', hard: 'pullup',
    A: hang(104, 30), B: hang(104, 30, { p: [100, 92], t: -2, h: 4, ln: [16, -14] })
  });
  X('invrow', 'Inverted row (low bar or table)', 'bw', 'hpull', {
    lvl: 1, equip: ['bar'], prim: ['upperback', 'lats', 'biceps'], sec: ['shoulders', 'forearms', 'abs'],
    how: ['Lie under a bar set at hip height (or a sturdy table), hands on the bar.', 'Body straight, heels on the floor.', 'Pull the chest to the bar, then lower to straight arms.'],
    cue: ['Squeeze the shoulder blades together at the top.'], err: ['Hips sagging.', 'Shrugging up to the ears.'],
    easy: 'Bend the knees, feet flat.', hard: 'Feet on a chair.',
    A: invrow(0), B: invrow(1)
  });
  function invrow(k) {
    const t = -68 + k * 8;
    const P = F.fit({ p: [100, 150], t, ln: [-t, -t], fn: 170, an: [0, 0] }, ['anN']);
    const S = F.solve(P); const bx = S.sh[0] + 4 - k * 2, by = 120;
    P.an = { to: [bx, by + 3], bend: 1 }; P.hn = 180; P.fist = true;
    P.eq = [{ k: 'bar', at: [bx, by], back: true, fixed: true, low: true }];
    return P;
  }
  X('squat', 'Air squat', 'bw', 'squat', {
    lvl: 1, prim: ['quads', 'glutes'], sec: ['adductors', 'hamstrings', 'abs'],
    how: ['Feet shoulder-width, toes slightly out.', 'Sit down and back between the heels until the thighs are at least parallel.', 'Drive up through the whole foot to standing.'],
    cue: ['Knees follow the toes.', 'Chest proud, arms forward for balance.'], err: ['Heels lifting.', 'Knees caving in.'],
    easy: 'Squat to a chair.', hard: 'goblet',
    A: stand({ an: [10, 14] }), B: hinge(30, 82, 150, { an: [90, 92] })
  });
  X('lunge', 'Reverse / walking lunge', 'bw', 'lunge', {
    lvl: 1, side: true, prim: ['quads', 'glutes'], sec: ['adductors', 'hamstrings', 'calves'],
    how: ['Stand tall, step one leg back about a stride length.', 'Lower until the back knee almost touches the floor.', 'Push through the front heel back to standing. Walking lunges step forward instead.'],
    cue: ['Front knee over the middle of the foot.', 'Upright torso.'], err: ['Front heel lifting.', 'Steps so short the knee shoots past the toes.'],
    easy: 'Hold on to a chair.', hard: 'split_squat',
    A: stand({ an: [4, 8] }), B: split(4, 98, 151, 132, 50, { an: [6, 10] }, 188)
  });
  X('split_squat', 'Bulgarian split squat', 'bw', 'lunge', {
    lvl: 2, side: true, equip: ['bench'], prim: ['quads', 'glutes'], sec: ['adductors', 'hamstrings'],
    how: ['Back foot laces-down on a bench or chair, front foot a long step ahead.', 'Lower straight down until the front thigh is about parallel.', 'Drive up through the front foot.'],
    cue: ['Most of the weight on the front leg.'], err: ['Front foot too close to the bench.'],
    easy: 'lunge', hard: 'Hold kettlebells or dumbbells.',
    A: bss(0), B: bss(1)
  });
  function bss(k) {
    const P = { p: [96, 112 + k * 34], t: 6 + k * 6, ln: { to: [128, 196] }, lf: { to: [48, 150] }, ff: 120, an: [6, 8], eq: [{ k: 'bench', at: [44, 152], w: 34, fixed: true }] };
    return P;
  }
  X('pistol', 'Assisted pistol squat', 'bw', 'lunge', {
    lvl: 3, side: true, prim: ['quads', 'glutes'], sec: ['adductors', 'abs', 'calves'],
    how: ['Stand on one leg, hold a door frame or band in front of you.', 'Reach the free leg forward and squat down on the standing leg as deep as you can control.', 'Stand back up, using the hands only as much as needed.'],
    cue: ['Heel stays down.', 'Sit back, arms forward.'], err: ['Dropping into the bottom without control.'],
    easy: 'Squat to a box on one leg.', hard: 'Without assistance.',
    A: stand({ lf: [30, 0], an: [80, 84] }), B: Object.assign(hinge(36, 84, 160, { an: [86, 88] }), { lf: [80, 88], ff: 160 })
  });
  X('glutebridge1', 'Single-leg glute bridge', 'bw', 'hinge', {
    lvl: 1, side: true, prim: ['glutes', 'hamstrings'], sec: ['lowerback', 'abs'],
    how: ['Lie on your back, one foot flat close to the hip, the other leg straight up or bent.', 'Push through the heel and lift the hips until knee, hip and shoulder form a line.', 'Hold one second and lower.'],
    cue: ['Push the heel, not the toes.', 'Ribs down, no arching.'], err: ['Lifting with the lower back.'],
    easy: 'Two feet on the floor.', hard: 'Foot on a bench.',
    A: bridge(0), B: bridge(1)
  });
  function bridge(k) {
    const P = { p: [104, 188 - k * 22], t: -90 + k * 12 * 0 - 0, ln: { to: [146, 196], bend: -1 }, lf: k ? [140, 150] : [120, 90], ff: 170, an: [-80, -84], hn: -88 };
    // shoulders on the floor: rotate the torso so the shoulder line touches
    const sh = [52, 189]; const dx = P.p[0] - sh[0], dy = sh[1] - P.p[1]; P.t = -Math.atan2(dx, dy) * 180 / Math.PI;
    return P;
  }
  X('nordic', 'Nordic hamstring curl', 'bw', 'hinge', {
    lvl: 3, prim: ['hamstrings'], sec: ['glutes', 'calves'],
    how: ['Kneel on a pad, heels anchored under a sofa or held by a partner.', 'Keep hips straight and lower the body forward as slowly as you can.', 'Catch yourself with the hands, push back lightly and pull up with the hamstrings.'],
    cue: ['Straight line from knees to head.', 'Fight the fall as long as you can.'], err: ['Bending at the hips to shorten the lever.'],
    easy: 'Only the lowering part, small range.', hard: 'Full range without the hands.',
    A: kneel({ an: [10, 14], hn: 20 }), B: kneel({ t: 58, an: [66, 70] })
  });
  X('calfraise1', 'Single-leg calf raise', 'bw', 'feet', {
    lvl: 1, side: true, prim: ['calves'], sec: [],
    how: ['Stand on one foot on a step, heel off the edge, hold on lightly.', 'Rise as high as you can on the toes.', 'Lower slowly until the heel is below the step.'],
    cue: ['3 seconds down.'], err: ['Bouncing at the bottom.'],
    easy: 'Two feet.', hard: 'Hold a weight.',
    A: Object.assign(F.fit({ p: [100, 100], t: 0, ln: [0, 0], lf: [10, -60], an: [4, 6], fn: 104, eq: [{ k: 'step', at: [102, 186], w: 32, fixed: true }] }, ['toeN']), {}),
    B: F.fit({ p: [100, 100], t: 0, ln: [0, 0], lf: [10, -60], an: [4, 6], fn: 40, eq: [{ k: 'step', at: [102, 186], w: 32, fixed: true }] }, ['toeN'])
  });
  X('situp', 'Sit-up', 'bw', 'core', {
    lvl: 1, prim: ['abs', 'hipflex'], sec: ['obliques'],
    how: ['Lie on your back, knees bent, feet flat.', 'Roll up one vertebra at a time until sitting.', 'Roll back down under control.'],
    cue: ['Chin slightly tucked.', 'Exhale on the way up.'], err: ['Yanking on the neck.', 'Feet flying up.'],
    easy: 'Crunch: only lift the shoulders.', hard: 'Hold a weight on the chest.',
    A: supine({ ln: { to: [150, 196], bend: -1 }, an: [-150, -150], hn: -150, contacts: ['pelvis', 'neck'] }),
    B: Object.assign(supine({ t: -22, h: 14, ln: { to: [150, 196], bend: -1 }, an: [60, 70], contacts: ['pelvis'] }))
  });
  X('legraise', 'Hanging knee / leg raise', 'bw', 'core', {
    lvl: 2, equip: ['bar'], prim: ['abs', 'hipflex'], sec: ['forearms', 'obliques'], noFloor: true,
    how: ['Hang from the bar with straight arms.', 'Lift the knees (or straight legs) up to hip height or higher, rolling the pelvis up.', 'Lower slowly without swinging.'],
    cue: ['Curl the pelvis, do not just lift the legs.'], err: ['Swinging for momentum.'],
    easy: 'Knees bent.', hard: 'Toes to bar.',
    A: hang(104, 30), B: hang(104, 30, { ln: [96, 4], t: -10 })
  });
  X('plank', 'Plank / side plank', 'bw', 'core', {
    lvl: 1, dose: 'time', prim: ['abs', 'obliques'], sec: ['shoulders', 'glutes', 'quads'],
    how: ['Forearms on the floor under the shoulders, body straight on the toes.', 'Squeeze glutes, pull the belly button in, breathe calmly.', 'Side plank: on one forearm and the side of the feet, hips high.'],
    cue: ['Push the floor away with the forearms.'], err: ['Hips sagging or high.', 'Holding the breath.'],
    easy: 'On the knees.', hard: 'Lift one foot or arm.',
    A: plank([-2, 90], { hn: 90 }, 'elN', 'toeN'), B: plank([-2, 90], { hn: 90 }, 'elN', 'toeN')
  });
  X('hollow', 'Hollow body hold', 'bw', 'core', {
    lvl: 2, dose: 'time', prim: ['abs'], sec: ['hipflex', 'obliques'],
    how: ['Lie on your back, press the lower back into the floor.', 'Lift legs, shoulders and arms a few centimetres; arms reach past the head.', 'Hold the banana shape and breathe.'],
    cue: ['Lower back stays glued to the floor.'], err: ['Lower back lifting off.'],
    easy: 'Knees bent, arms by the sides.', hard: 'Hollow rocks.',
    A: supine({ t: -82, ln: [97, 97], an: [-100, -100], hn: -100, fn: 170 }), B: supine({ t: -76, ln: [102, 102], an: [-108, -108], hn: -108, fn: 175 })
  });
  X('superman', 'Back extension / superman', 'bw', 'hinge', {
    lvl: 1, prim: ['lowerback', 'glutes'], sec: ['hamstrings', 'upperback'],
    how: ['Lie face down, arms forward.', 'Lift arms, chest and legs a little off the floor.', 'Hold 2 seconds and lower.'],
    cue: ['Look at the floor: long neck.'], err: ['Cranking the head up.'],
    easy: 'Only arms or only legs.', hard: 'Longer holds.',
    A: prone({ an: [90, 90], hn: 90 }), B: prone({ t: 78, ln: [-100, -100], an: [100, 100], hn: 100, h: 0 })
  });
  X('burpee', 'Burpee', 'bw', 'cond', {
    lvl: 2, prim: ['quads', 'chest', 'shoulders'], sec: ['glutes', 'abs', 'triceps', 'calves'],
    how: ['Squat down, hands on the floor.', 'Jump the feet back to a plank and do a push-up.', 'Jump the feet in and jump up with arms overhead.'],
    cue: ['Land softly.', 'Keep a steady rhythm rather than sprinting and stopping.'], err: ['Sagging hips in the plank.'],
    easy: 'Step back instead of jumping, no push-up.', hard: 'Tuck jump at the top.',
    A: stand({ an: [172, 176], hn: 180 }), B: plank([-60, -2])
  });
  X('bearcrawl', 'Bear crawl', 'bw', 'cond', {
    lvl: 1, dose: 'dist', prim: ['shoulders', 'abs'], sec: ['quads', 'triceps', 'hipflex'],
    how: ['On hands and feet, knees bent and hovering just above the floor.', 'Move opposite hand and foot together, small steps.', 'Keep the back flat like a table.'],
    cue: ['Hips low, back flat.'], err: ['Hips shooting up.'],
    easy: 'Hold the position (bear plank).', hard: 'Backwards or with a sandbag on the back.',
    A: crawl(0), B: crawl(1)
  });
  function crawl(k) {
    return { p: [100, 146], t: 80, ln: { to: [k ? 92 : 80, 194], bend: -1 }, lf: { to: [k ? 80 : 92, 194], bend: -1 }, fn: 70, ff: 70, an: k ? [-6, 0] : [10, 4], af: k ? [12, 6] : [-8, -2], hn: 90, h: -20 };
  }
  X('climber', 'Mountain climber', 'bw', 'cond', {
    lvl: 1, prim: ['abs', 'hipflex'], sec: ['shoulders', 'quads'],
    how: ['Start in a push-up position.', 'Drive one knee towards the chest, then switch legs quickly.', 'Keep the hips level.'],
    cue: ['Shoulders over the hands.'], err: ['Bouncing the hips up and down.'],
    easy: 'Slow, stepping.', hard: 'Cross the knee to the opposite elbow.',
    A: plank([0, 0]), B: Object.assign(plank([0, 0]), { lf: [70, -80], ff: 10 })
  });
})();
