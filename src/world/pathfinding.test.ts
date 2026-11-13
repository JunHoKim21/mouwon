import test from 'node:test';
import assert from 'node:assert/strict';
import { findWorldPath } from './pathfinding';
import {
  LANDMARKS,
  Vec2,
  isInsideMainBath,
  resolvePlayerCollisions,
} from './terrainMath';

function assertPathObstacleFree(
  start: Vec2,
  goal: Vec2,
  path: Vec2[],
  opts: { allowBathWaterAtStart?: boolean } = {},
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

      if (!opts.allowBathWaterAtStart) {
        assert.equal(
          isInsideMainBath(px, pz),
          false,
          `Courtyard path segment ${i} cut through main bath water at (${px.toFixed(2)}, ${pz.toFixed(2)})`,
        );
      }
    }
  }
}

test('findWorldPath routes around obstacles from entrance (0, 38) to firewood yard (-3, -24.2)', () => {
  const start = { x: 0, z: 38 };
  const goal = { x: -3, z: -24.2 };
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
  assert.ok(path.length >= 2, 'Expected multi-waypoint detour around bath and Myoyeongak');
});

test('findWorldPath exits central bath via stairs from (0, 5) to milk bench (14.1, 8.8)', () => {
  const start = { x: 0, z: 5 };
  const goal = { x: 14.1, z: 8.8 };
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path, { allowBathWaterAtStart: true });
  // Ensure path routes through stair corridor (near x = 0) before heading east
  assert.ok(
    path.some((wp) => Math.abs(wp.x) < 1.5 && wp.z >= 5.5),
    'Expected path to exit bath through south stair corridor',
  );
});

test('findWorldPath routes from foot stream (20.4, 26.5) to yuzu pond (-12.3, 9.6)', () => {
  const start = { x: 20.4, z: 26.5 };
  const goal = { x: -12.3, z: 9.6 };
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
});

test('findWorldPath routes from entrance (0, 38) around bath through veranda to Myoyeongak (0, -10.5)', () => {
  const start = { x: 0, z: 38 };
  const goal = { x: 0, z: -10.5 };
  const path = findWorldPath(start, goal);
  assertPathObstacleFree(start, goal, path);
  assert.ok(
    path.some((wp) => Math.abs(wp.x) < 1.0 && wp.z <= -5.5 && wp.z >= -8.0),
    'Expected path to enter Myoyeongak through front veranda gate',
  );
});
