import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MAX_TRAIN_FOLLOWERS,
  NPC_CAT_SPECS,
  NpcCatRuntimeState,
  TRAIN_MIN_SEPARATION,
  shortestAngleDelta,
  stepNpcCats,
} from './npcTrainMath.ts';
import { groundHeightAt } from './terrainMath.ts';

test('NPC_CAT_SPECS places 6-8 distinct non-overlapping cats in bath and resting spots', () => {
  assert.ok(NPC_CAT_SPECS.length >= 6 && NPC_CAT_SPECS.length <= 8);

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

  const player = { x: 0, z: 38, heading: Math.PI };
  for (let step = 0; step < 300; step++) {
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

