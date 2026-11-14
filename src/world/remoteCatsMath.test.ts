import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRemotePeerUpdate,
  collectStaleRemoteIds,
  createRemoteCatSimState,
  findNearestMilkRecipient,
  stepRemoteCatSim,
} from './remoteCatsMath.ts';

test('stepRemoteCatSim smoothly interpolates position and wraps heading shortest arc', () => {
  const sim = createRemoteCatSimState(
    {
      id: 'cat-2',
      coatId: 'calico',
      x: 0,
      y: 0,
      z: 0,
      heading: Math.PI - 0.1,
      actionMode: 'walk',
      moveSpeed: 2.75,
      hasHeadYuzu: false,
      carryingFirewood: false,
    },
    1000,
  );

  const { coatChanged } = applyRemotePeerUpdate(
    sim,
    {
      id: 'cat-2',
      coatId: 'tuxedo',
      x: 2,
      y: 0,
      z: 0,
      heading: -Math.PI + 0.1,
      actionMode: 'walk',
      moveSpeed: 2.75,
      hasHeadYuzu: false,
      carryingFirewood: true,
    },
    1100,
  );

  assert.equal(coatChanged, true);
  assert.equal(sim.carryingFirewood, true);
  assert.equal(sim.heldMilkId, null);

  applyRemotePeerUpdate(
    sim,
    {
      id: 'cat-2',
      coatId: 'tuxedo',
      x: 2,
      y: 0,
      z: 0,
      heading: -Math.PI + 0.1,
      actionMode: 'idle',
      moveSpeed: 0,
      hasHeadYuzu: false,
      carryingFirewood: false,
      heldMilkId: 'banana',
    },
    1150,
  );
  assert.equal(sim.heldMilkId, 'banana');

  const speed = stepRemoteCatSim(sim, 0.05);
  assert.ok(sim.x > 0.5 && sim.x < 2, `expected smooth X progress, got ${sim.x}`);
  assert.ok(
    Math.abs(sim.heading) > 2.9,
    `expected heading to wrap across +PI without spinning through 0, got ${sim.heading}`,
  );
  assert.ok(speed > 1);
});

test('collectStaleRemoteIds detects timed out peers and findNearestMilkRecipient picks closest cat', () => {
  const simFresh = createRemoteCatSimState(
    {
      id: 'cat-fresh',
      coatId: 'cheese',
      x: 1.5,
      y: 0,
      z: 0,
      heading: 0,
      actionMode: 'idle',
      moveSpeed: 0,
      hasHeadYuzu: false,
      carryingFirewood: false,
    },
    10_000,
  );
  const simOld = createRemoteCatSimState(
    {
      id: 'cat-old',
      coatId: 'black',
      x: 5,
      y: 0,
      z: 0,
      heading: 0,
      actionMode: 'loaf',
      moveSpeed: 0,
      hasHeadYuzu: false,
      carryingFirewood: false,
    },
    1_000,
  );

  const stale = collectStaleRemoteIds([simFresh, simOld], 15_000, 10_000);
  assert.deepEqual(stale, ['cat-old']);

  const winner = findNearestMilkRecipient(
    0,
    0,
    [{ id: 'npc-1', x: 3.5, z: 0 }],
    [{ id: simFresh.id, x: simFresh.x, z: simFresh.z }],
    10,
  );
  assert.ok(winner);
  assert.equal(winner.kind, 'remote');
  assert.equal(winner.id, 'cat-fresh');
});
