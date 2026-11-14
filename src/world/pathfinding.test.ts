import test from 'node:test';
import assert from 'node:assert/strict';
import { findWorldPath } from './pathfinding';
import { ACTION_SPOTS } from './ritualMath';
import {
  CEDAR_TREES,
  LANDMARKS,
  TELEPORT_SPOTS,
  Vec2,
  isInsideMainBath,
  resolvePlayerCollisions,
} from './terrainMath';

function assertPathObstacleFree(
  start: Vec2,
  goal: Vec2,
  path: Vec2[],
) {
  assert.ok(path.length >= 1, 'Path must contain at least one waypoint');
  const finalWp = path[path.length - 1];
  assert.ok(
    Math.hypot(finalWp.x - goal.x, finalWp.z - goal.z) < 0.05,
    `Final waypoint (${finalWp.x.toFixed(2)}, ${finalWp.z.toFixed(2)}) did not reach goal (${goal.x}, ${goal.z})`,
  );

  const fullChain = [start, ...path];
  for (let i = 0; i < fullChain.length - 1; i++) {
    const a = fullChain[i];
    const b = fullChain[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(segLen / 0.2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;

      const resolved = resolvePlayerCollisions(px, pz, 0.42);
      const shift = Math.hypot(resolved.x - px, resolved.z - pz);
      assert.ok(
        shift < 0.02,
        `Path segment ${i} pierced obstacle at (${px.toFixed(2)}, ${pz.toFixed(2)}), pushed by ${shift.toFixed(3)}m`,
      );

      const yuzuDist = Math.hypot(
        px - LANDMARKS.yuzuPond.x,
        pz - LANDMARKS.yuzuPond.z,
      );
      assert.ok(
        yuzuDist >= 3.55,
        `Path segment ${i} entered yuzu wish pond water at (${px.toFixed(2)}, ${pz.toFixed(2)})`,
      );
    }
  }
}

test('findWorldPath routes around obstacles from entrance to firewood yard', () => {
  const start = { x: LANDMARKS.entranceBridge.x, z: LANDMARKS.entranceBridge.z };
  const goal = TELEPORT_SPOTS.find((s) => s.zoneId === 'firewood_yard')!;
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
  assert.ok(path.length >= 2, 'Expected multi-waypoint detour through bath and yard trail');
});

test('findWorldPath exits central bath via stairs from (0, 5) to milk bench', () => {
  const start = { x: 0, z: 5 };
  const goal = ACTION_SPOTS.benchSitSpot;
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
  // Ensure path routes through stair corridor (near x = 0) before heading east
  assert.ok(
    path.some((wp) => Math.abs(wp.x) < 1.5 && wp.z >= 5.5),
    'Expected path to exit bath through south stair corridor',
  );
});

test('findWorldPath routes from foot stream to yuzu pond', () => {
  const start = TELEPORT_SPOTS.find((s) => s.zoneId === 'foot_stream')!;
  const goal = TELEPORT_SPOTS.find((s) => s.zoneId === 'yuzu_pond')!;
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
});

test('findWorldPath routes from entrance through central bath stairs and veranda to Myoyeongak', () => {
  const start = { x: LANDMARKS.entranceBridge.x, z: LANDMARKS.entranceBridge.z };
  const goal = TELEPORT_SPOTS.find((s) => s.zoneId === 'tatami_hall')!;
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
  assert.ok(
    path.some((wp) => isInsideMainBath(wp.x, wp.z)),
    'Expected central corridor path from entrance to traverse through the outdoor bath',
  );
  assert.ok(
    path.some(
      (wp) =>
        Math.abs(wp.x) < 1.5 &&
        wp.z <= LANDMARKS.myoyeongak.maxZ + 1.5 &&
        wp.z >= LANDMARKS.myoyeongak.maxZ - 2.0,
    ),
    'Expected path to enter Myoyeongak through front veranda gate',
  );
});

test('findWorldPath routes around cedar tree trunks even when clicking directly on a trunk', () => {
  const tree = CEDAR_TREES[0];
  const trunkPoint = { x: tree.x, z: tree.z };
  const bridgeGoal = { x: LANDMARKS.entranceBridge.x, z: LANDMARKS.entranceBridge.z };

  const fromTrunkPath = findWorldPath(trunkPoint, bridgeGoal);
  assert.ok(
    Math.hypot(fromTrunkPath[0].x - tree.x, fromTrunkPath[0].z - tree.z) >= tree.trunkRadius + 0.42 - 1e-4,
    'First waypoint should snap outside cedar trunk collider',
  );
  assertPathObstacleFree(fromTrunkPath[0], bridgeGoal, fromTrunkPath);

  const toTrunkPath = findWorldPath(bridgeGoal, trunkPoint);
  const resolvedGoal = resolvePlayerCollisions(tree.x, tree.z, 0.5);
  const finalWp = toTrunkPath[toTrunkPath.length - 1];
  assert.ok(
    Math.hypot(finalWp.x - tree.x, finalWp.z - tree.z) >= tree.trunkRadius + 0.42 - 1e-4,
    'Final waypoint should stay outside cedar trunk collider',
  );
  assertPathObstacleFree(bridgeGoal, resolvedGoal, toTrunkPath);
});

test('findWorldPath inside Myoyeongak detours around the central irori hearth', () => {
  const start = { x: 0, z: LANDMARKS.myoyeongak.z + 1.8 };
  const goal = { x: 0, z: LANDMARKS.myoyeongak.z - 2.6 };
  const path = findWorldPath(start, goal);

  assert.ok(path.length >= 2, `Expected detour waypoints around irori hearth, got ${path.length}`);
  assertPathObstacleFree(start, goal, path);
});
