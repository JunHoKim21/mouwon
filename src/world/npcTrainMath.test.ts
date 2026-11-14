import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MAX_TRAIN_FOLLOWERS,
  NPC_CAT_SPECS,
  NpcCatRuntimeState,
  TRAIN_MIN_SEPARATION,
  TRAIN_MOVE_SPEED,
  shortestAngleDelta,
  stepNpcCats,
} from './npcTrainMath.ts';
import {
  FOOTBATH_DECK_HEIGHT,
  FOOTBATH_SEAT_SPOTS,
  LANDMARKS,
  groundHeightAt,
} from './terrainMath.ts';

test('NPC_CAT_SPECS places 6-9 distinct non-overlapping cats in bath and resting spots', () => {
  assert.ok(NPC_CAT_SPECS.length >= 6 && NPC_CAT_SPECS.length <= 9);

  const soakingWithProp = NPC_CAT_SPECS.filter(
    (s) => s.homeAction === 'soak' && (s.hasTowel || s.hasYuzu),
  );
  assert.ok(soakingWithProp.length >= 4);

  const loafing = NPC_CAT_SPECS.filter((s) => s.homeAction === 'loaf');
  assert.ok(loafing.length >= 2);

  for (let i = 0; i < NPC_CAT_SPECS.length; i++) {
    for (let j = i + 1; j < NPC_CAT_SPECS.length; j++) {
      const a = NPC_CAT_SPECS[i];
      const b = NPC_CAT_SPECS[j];
      const dist = Math.hypot(a.homeX - b.homeX, a.homeZ - b.homeZ);
      assert.ok(
        dist >= 1.5,
        `NPC cats ${a.id} and ${b.id} are too close (${dist.toFixed(2)}m)`,
      );
    }
  }
});

test('Walk train aligns cat heading via Math.atan2 toward front cat and maintains separation', () => {
  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: spec.homeX,
    y: groundHeightAt(spec.homeX, spec.homeZ),
    z: spec.homeZ,
    heading: spec.homeHeading,
    actionMode: spec.homeAction,
    moveSpeed: 0,
  }));

  // Player strolls around the south-east bath perimeter
  const player = { x: 8.5, z: 13.5, heading: Math.PI * 0.5 };
  for (let step = 0; step < 180; step++) {
    player.x += Math.sin(player.heading) * 0.04;
    player.z += Math.cos(player.heading) * 0.04;
    player.heading += 0.008;
    stepNpcCats(cats, player, true, 0.04, groundHeightAt);
  }

  const followers = cats.filter((c) => c.spec.joinsTrain);
  assert.ok(followers.length >= 4);

  // Every follower must stay separated from player and from one another
  for (let i = 0; i < followers.length; i++) {
    const a = followers[i];
    const pDist = Math.hypot(a.x - player.x, a.z - player.z);
    assert.ok(
      pDist >= TRAIN_MIN_SEPARATION - 0.1,
      `Follower ${a.spec.id} overlapped player (${pDist.toFixed(2)}m)`,
    );

    const leader = i === 0 ? player : followers[i - 1];
    const expectedHeading = Math.atan2(leader.x - a.x, leader.z - a.z);
    const angleDiff = Math.abs(shortestAngleDelta(a.heading, expectedHeading));
    assert.ok(
      angleDiff < 0.75,
      `Follower ${a.spec.id} should face leader forward (diff=${angleDiff.toFixed(2)})`,
    );

    for (let j = i + 1; j < followers.length; j++) {
      const b = followers[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(
        dist >= TRAIN_MIN_SEPARATION - 0.1,
        `Followers ${a.spec.id} and ${b.spec.id} overlapped (${dist.toFixed(2)}m)`,
      );
    }
  }
});

test('Disabling walk train returns NPC cats to their soaking and loafing home spots', () => {
  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: 6.5,
    y: 0,
    z: 14.5,
    heading: 0,
    actionMode: 'walk',
    moveSpeed: 2.0,
  }));

  const player = { x: 0, z: LANDMARKS.entranceBridge.z, heading: Math.PI };
  for (let step = 0; step < 650; step++) {
    stepNpcCats(cats, player, false, 0.05, groundHeightAt);
  }

  for (const cat of cats) {
    const dist = Math.hypot(cat.x - cat.spec.homeX, cat.z - cat.spec.homeZ);
    assert.ok(dist < 0.25, `${cat.spec.id} failed to return home (dist=${dist.toFixed(2)})`);
    assert.equal(cat.actionMode, cat.spec.homeAction);
  }
});

test('Bath-soaking train cats exit cleanly through the south stairs even when player stands at (0, 11.8)', () => {
  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: spec.homeX,
    y: groundHeightAt(spec.homeX, spec.homeZ),
    z: spec.homeZ,
    heading: spec.homeHeading,
    actionMode: spec.homeAction,
    moveSpeed: 0,
  }));

  const player = { x: 0, z: 11.8, heading: 0 };
  for (let step = 0; step < 160; step++) {
    stepNpcCats(cats, player, true, 0.05, groundHeightAt);
  }

  const mikan = cats.find((c) => c.spec.id === 'npc-mikan')!;
  const haru = cats.find((c) => c.spec.id === 'npc-haru')!;
  assert.ok(
    mikan.z > 8.5,
    `npc-mikan should exit bath via south stairs instead of getting stuck (z=${mikan.z.toFixed(2)})`,
  );
  assert.ok(
    haru.z > 7.5,
    `npc-haru should exit bath via south stairs instead of getting stuck (z=${haru.z.toFixed(2)})`,
  );
});

test('maxFollowers caps companion walk followers at DEFAULT_MAX_TRAIN_FOLLOWERS (2) and keeps soaking cats in bath', () => {
  assert.equal(DEFAULT_MAX_TRAIN_FOLLOWERS, 2);
  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: spec.homeX,
    y: groundHeightAt(spec.homeX, spec.homeZ),
    z: spec.homeZ,
    heading: spec.homeHeading,
    actionMode: spec.homeAction,
    moveSpeed: 0,
  }));

  const player = { x: 8.5, z: 16.0, heading: Math.PI * 0.5 };
  for (let step = 0; step < 120; step++) {
    player.x += Math.sin(player.heading) * 0.03;
    player.z += Math.cos(player.heading) * 0.03;
    stepNpcCats(cats, player, true, 0.05, groundHeightAt, {
      maxFollowers: DEFAULT_MAX_TRAIN_FOLLOWERS,
    });
  }

  const tux = cats.find((c) => c.spec.id === 'npc-tux')!;
  const dangam = cats.find((c) => c.spec.id === 'npc-dangam')!;
  const mikan = cats.find((c) => c.spec.id === 'npc-mikan')!;
  const haru = cats.find((c) => c.spec.id === 'npc-haru')!;
  const cream = cats.find((c) => c.spec.id === 'npc-cream')!;

  assert.ok(Math.hypot(tux.x - player.x, tux.z - player.z) < 4.5);
  assert.ok(Math.hypot(dangam.x - player.x, dangam.z - player.z) < 5.5);
  assert.equal(mikan.actionMode, 'soak');
  assert.equal(haru.actionMode, 'soak');
  assert.equal(cream.actionMode, 'loaf');
});

test('NPC cat reacts to nose greeting (greetReactionTimer) by facing player and entering greet actionMode', () => {
  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: spec.homeX,
    y: groundHeightAt(spec.homeX, spec.homeZ),
    z: spec.homeZ,
    heading: spec.homeHeading,
    actionMode: spec.homeAction,
    moveSpeed: 0,
  }));

  const mikan = cats.find((c) => c.spec.id === 'npc-mikan')!;
  const player = { x: mikan.x + 1.2, z: mikan.z + 0.4, heading: 0 };
  const targetHeading = Math.atan2(player.x - mikan.x, player.z - mikan.z);

  // Trigger nose greeting reaction
  mikan.greetReactionTimer = 2.0;
  mikan.greetTargetHeading = targetHeading;

  stepNpcCats(cats, player, false, 0.05, groundHeightAt);

  assert.equal(mikan.actionMode, 'greet');
  assert.equal(mikan.moveSpeed, 0);
  assert.ok((mikan.greetReactionTimer ?? 0) < 2.0);
  // Heading smoothly turned toward target
  assert.ok(Math.abs(mikan.heading - targetHeading) < Math.abs(mikan.spec.homeHeading - targetHeading) + 0.01);

  // Advance time past reaction timer (2.0s / 0.05s = 40 steps)
  for (let step = 0; step < 45; step++) {
    stepNpcCats(cats, player, false, 0.05, groundHeightAt);
  }

  assert.equal(mikan.greetReactionTimer, 0);
  // Returns to home soak state
  assert.equal(mikan.actionMode, 'soak');
});

test('TRAIN_MOVE_SPEED is slowed to 2.45 and soaking NPCs periodically groom when elapsed is provided', () => {
  assert.equal(TRAIN_MOVE_SPEED, 2.45);

  const cats: NpcCatRuntimeState[] = NPC_CAT_SPECS.map((spec) => ({
    spec,
    x: spec.homeX,
    y: groundHeightAt(spec.homeX, spec.homeZ),
    z: spec.homeZ,
    heading: spec.homeHeading,
    actionMode: spec.homeAction,
    moveSpeed: 0,
  }));

  const player = { x: 0, z: LANDMARKS.entranceBridge.z, heading: Math.PI };
  // For index 2 (npc-mikan), cycle = (4.1 + 2 * 3.7) % 14 = 11.5 in [10.8, 13.8)
  stepNpcCats(cats, player, false, 0.05, groundHeightAt, {}, 4.1);

  const mikan = cats.find((c) => c.spec.id === 'npc-mikan')!;
  const haru = cats.find((c) => c.spec.id === 'npc-haru')!;
  const cream = cats.find((c) => c.spec.id === 'npc-cream')!;

  assert.equal(mikan.actionMode, 'groom');
  assert.equal(haru.actionMode, 'soak');
  assert.equal(cream.actionMode, 'loaf');
});

test('npc-milk (우유냥) rests well inside the milk booth wooden bench at height 0.34', () => {
  const milkCat = NPC_CAT_SPECS.find((s) => s.id === 'npc-milk')!;
  assert.ok(milkCat);
  // Bench mesh spans local x in [-3.55, -0.25], z in [-0.50, +2.10]
  assert.ok(milkCat.homeX >= LANDMARKS.milkBooth.x - 3.45);
  assert.ok(milkCat.homeX <= LANDMARKS.milkBooth.x - 0.35);
  assert.ok(milkCat.homeZ >= LANDMARKS.milkBooth.z - 0.4);
  assert.ok(milkCat.homeZ <= LANDMARKS.milkBooth.z + 2.0);
  assert.equal(groundHeightAt(milkCat.homeX, milkCat.homeZ), 0.34);

  const footbathCat = NPC_CAT_SPECS.find((s) => s.id === 'npc-footbath')!;
  assert.ok(footbathCat);
  assert.equal(footbathCat.homeAction, 'footSoak');
  assert.equal(footbathCat.homeX, FOOTBATH_SEAT_SPOTS[4].x);
  assert.equal(footbathCat.homeZ, FOOTBATH_SEAT_SPOTS[4].z);
  assert.equal(groundHeightAt(footbathCat.homeX, footbathCat.homeZ), FOOTBATH_DECK_HEIGHT);
});


