import test from 'node:test';
import assert from 'node:assert/strict';
import { CAT_COATS, getCatCoatById } from './catCoats';
import {
  BATH_RIM_ROCKS,
  CAMERA_DEFAULTS,
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  TELEPORT_SPOTS,
  YUZU_POND_RIM_ROCKS,
  computeCameraRig,
  computeWorldMoveFromInput,
  detectZone,
  exponentialDampingAlpha,
  groundHeightAt,
  isInsideMainBath,
  resolvePlayerCollisions,
} from './terrainMath';

test('CAT_COATS contains all 6 exact requested coats and hex colors', () => {
  assert.equal(CAT_COATS.length, 6);
  assert.equal(getCatCoatById('cheese').primaryColor, '#e69c45');
  assert.equal(getCatCoatById('cheese').secondaryColor, '#f5e6d3');
  assert.equal(getCatCoatById('calico').primaryColor, '#f4f1ea');
  assert.equal(getCatCoatById('calico').secondaryColor, '#d97925');
  assert.equal(getCatCoatById('calico').accentColor, '#33312e');
  assert.equal(getCatCoatById('tuxedo').primaryColor, '#262628');
  assert.equal(getCatCoatById('tuxedo').secondaryColor, '#f5f5f7');
  assert.equal(getCatCoatById('mackerel').primaryColor, '#7d8085');
  assert.equal(getCatCoatById('mackerel').secondaryColor, '#3d4045');
  assert.equal(getCatCoatById('black').primaryColor, '#222326');
  assert.equal(getCatCoatById('black').eyeColor, '#f2c94c');
  assert.equal(getCatCoatById('creamsicle').primaryColor, '#f3dfc1');
});

test('groundHeightAt handles spawn bridge, central bath basin, and outer mountains', () => {
  // Bridge peak at (0, 38)
  const bridgeCenterY = groundHeightAt(0, 38);
  assert.ok(bridgeCenterY > 0.35 && bridgeCenterY <= 0.45);

  // Inside central bath (0, 4) is sunken basin (-0.30m)
  assert.equal(groundHeightAt(0, 4), -0.3);
  assert.equal(isInsideMainBath(0, 4), true);

  // Myoyeongak tatami hall floor at (0, -12) is raised (+0.44m)
  assert.equal(groundHeightAt(0, -12), 0.44);
  assert.equal(detectZone(0, -12), 'tatami_hall');

  // Outer snow mountains rise above 10m at r = 120m
  assert.ok(groundHeightAt(120, 10) > 10);
});

test('resolvePlayerCollisions permits stair entry into central bath and blocks side rim walls', () => {
  // South stair opening around x = 0, z = 8.2 should remain unobstructed
  const stairPos = resolvePlayerCollisions(0, 8.2);
  assert.equal(stairPos.x, 0);
  assert.equal(stairPos.z, 8.2);

  // Side rim wall at x = 8.2, z = 4 should push player away from the rim
  const sideRim = resolvePlayerCollisions(8.4, 4);
  assert.ok(Math.hypot(sideRim.x, sideRim.z - 4) >= 9.4);

  // Playable perimeter clamp around 44.5m
  const farOut = resolvePlayerCollisions(100, 10);
  assert.ok(Math.hypot(farOut.x, farOut.z - 10) <= 44.51);
});

test('computeCameraRig respects landscape/portrait FOV, heights, distance clamp, and 3m lookahead', () => {
  const playerPos = { x: 0, y: 0.42, z: 38 };

  const desktop = computeCameraRig(16 / 9, 2.85, 0, 0, playerPos);
  assert.equal(desktop.fov, 60);
  assert.ok(Math.abs(desktop.position.y - (playerPos.y + 1.45)) < 1e-6);
  assert.ok(Math.abs(desktop.position.z - (playerPos.z + 2.85)) < 1e-6);
  assert.ok(Math.abs(desktop.lookAt.z - (playerPos.z - 3.0)) < 1e-6);
  assert.ok(Math.abs(desktop.lookAt.y - (playerPos.y + 0.55)) < 1e-6);

  const mobile = computeCameraRig(390 / 844, 2.85, 0, 0, playerPos);
  assert.equal(mobile.fov, 65);
  assert.ok(Math.abs(mobile.position.y - (playerPos.y + 2.1)) < 1e-6);
  assert.ok(Math.abs(mobile.lookAt.y - (playerPos.y + 0.45)) < 1e-6);

  // Distance clamped to [1.8, 11.0]
  const zoomedIn = computeCameraRig(16 / 9, 0.2, 0, 0, playerPos);
  assert.ok(Math.abs(zoomedIn.position.z - (playerPos.z + 1.8)) < 1e-6);

  // Pitch sensitivity ratio is 65% of yaw
  assert.equal(CAMERA_DEFAULTS.pitchSensitivityRatio, 0.65);
  // Exponential damping matches 1 - exp(-dt * 6.5)
  assert.ok(
    Math.abs(exponentialDampingAlpha(0.016) - (1 - Math.exp(-0.016 * 6.5))) < 1e-9,
  );
});

test('computeWorldMoveFromInput aligns local +Z heading with Math.atan2(dx, dz) so cat never walks backward', () => {
  // At cameraYaw = 0, pressing W (forwardAxis = +1) moves toward -Z (central bath)
  const forward = computeWorldMoveFromInput(1, 0, 0);
  assert.ok(forward !== null);
  assert.ok(Math.abs(forward.dx) < 1e-6);
  assert.ok(Math.abs(forward.dz + 1) < 1e-6);
  // Rotating local +Z (0, 0, 1) around Y by heading gives (sin(h), 0, cos(h))
  assert.ok(Math.abs(Math.sin(forward.heading) - forward.dx) < 1e-6);
  assert.ok(Math.abs(Math.cos(forward.heading) - forward.dz) < 1e-6);

  // Pressing D (rightAxis = +1) moves toward +X
  const right = computeWorldMoveFromInput(0, 1, 0);
  assert.ok(right !== null);
  assert.ok(Math.abs(Math.sin(right.heading) - right.dx) < 1e-6);
  assert.ok(Math.abs(Math.cos(right.heading) - right.dz) < 1e-6);
});

test('TELEPORT_SPOTS covers all 8 landmarks, maps to detectZone(), and never shifts under resolvePlayerCollisions()', () => {
  assert.equal(TELEPORT_SPOTS.length, 8);
  for (const spot of TELEPORT_SPOTS) {
    assert.equal(detectZone(spot.x, spot.z), spot.zoneId);
    const resolved = resolvePlayerCollisions(spot.x, spot.z);
    const shift = Math.hypot(resolved.x - spot.x, resolved.z - spot.z);
    assert.ok(
      shift < 0.01,
      `Destination spot ${spot.zoneId} shifted by ${shift.toFixed(4)}m under resolvePlayerCollisions`,
    );
  }
  assert.equal(detectZone(-3, -28), 'firewood_yard');
  assert.equal(detectZone(22, 28), 'foot_stream');
});

test('YUZU_POND_RIM_ROCKS has 18 deterministic rocks and blocks cat penetration', () => {
  assert.equal(YUZU_POND_RIM_ROCKS.length, 18);
  for (const rock of YUZU_POND_RIM_ROCKS) {
    const resolved = resolvePlayerCollisions(rock.x, rock.z);
    const distFromRock = Math.hypot(resolved.x - rock.x, resolved.z - rock.z);
    assert.ok(
      distFromRock >= rock.colliderRadius + 0.35,
      `Cat clipped into yuzu pond rock at (${rock.x.toFixed(2)}, ${rock.z.toFixed(2)})`,
    );
  }
});

test('FOOT_STREAM_STEPSTONES sit cleanly above water and resolvePlayerCollisions keeps SE egg basket clear', () => {
  assert.equal(FOOT_STREAM_STEPSTONES.length, 7);
  for (const stone of FOOT_STREAM_STEPSTONES) {
    assert.equal(groundHeightAt(stone.x, stone.z), 0.05);
  }
  for (const rock of BATH_RIM_ROCKS) {
    assert.ok(
      Math.hypot(rock.x - LANDMARKS.eggBasket.x, rock.z - LANDMARKS.eggBasket.z) >= 1.3,
    );
  }
});

test('resolvePlayerCollisions pushes cats clear of BATH_RIM_ROCKS while keeping stair corridors passable', () => {
  assert.ok(BATH_RIM_ROCKS.length >= 24);
  for (const rock of BATH_RIM_ROCKS) {
    const resolved = resolvePlayerCollisions(rock.x, rock.z);
    const distFromRock = Math.hypot(resolved.x - rock.x, resolved.z - rock.z);
    assert.ok(
      distFromRock >= rock.colliderRadius + 0.35,
      `Cat clipped into bath rim rock at (${rock.x.toFixed(2)}, ${rock.z.toFixed(2)})`,
    );
  }

  // North & south stairs stay open from outer courtyard into bath
  const southMouth = resolvePlayerCollisions(0, 14.5);
  assert.equal(southMouth.x, 0);
  assert.equal(southMouth.z, 14.5);

  const northMouth = resolvePlayerCollisions(0, -6.5);
  assert.equal(northMouth.x, 0);
  assert.equal(northMouth.z, -6.5);
});

