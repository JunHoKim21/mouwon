import test from 'node:test';
import assert from 'node:assert/strict';
import { CAT_COATS, getCatCoatById } from './catCoats';
import {
  BATH_RIM_ROCKS,
  CAMERA_DEFAULTS,
  CEDAR_TREES,
  FOOTBATH_DECK_HEIGHT,
  FOOTBATH_SEAT_SPOTS,
  FOOTBATH_WATERWHEEL_POS,
  FOOTBATH_WATER_Y,
  FOOT_STREAM_BORDER_ROCKS,
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  MYOYEONGAK_CUSHION_SPOTS,
  PLAYABLE_RADIUS,
  TELEPORT_SPOTS,
  YUZU_POND_RIM_ROCKS,
  computeCameraRig,
  computeWorldMoveFromInput,
  detectZone,
  distToWalkway,
  exponentialDampingAlpha,
  findNearestEmptyCushion,
  findNearestEmptyFootbathSeat,
  footbathLocalToWorld,
  groundHeightAt,
  isInsideMainBath,
  isOnFootbathDeck,
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

test('groundHeightAt handles spawn bridge, central bath basin, walkways, and outer mountains', () => {
  // Bridge peak at (0, LANDMARKS.entranceBridge.z)
  const bridgeCenterY = groundHeightAt(0, LANDMARKS.entranceBridge.z);
  assert.ok(bridgeCenterY > 0.35 && bridgeCenterY <= 0.45);

  // Inside central bath (0, 4) is sunken basin (-0.30m)
  assert.equal(groundHeightAt(0, 4), -0.3);
  assert.equal(isInsideMainBath(0, 4), true);

  // Myoyeongak tatami hall floor at (0, LANDMARKS.myoyeongak.z) is raised (+0.44m)
  assert.equal(groundHeightAt(0, LANDMARKS.myoyeongak.z), 0.44);
  assert.equal(detectZone(0, LANDMARKS.myoyeongak.z), 'tatami_hall');

  // Connecting stone walkway at (0, 28) is gently flattened (0.02m)
  assert.ok(distToWalkway(0, 28) <= 0);
  assert.equal(groundHeightAt(0, 28), 0.02);

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

  // Playable perimeter clamp around PLAYABLE_RADIUS
  const farOut = resolvePlayerCollisions(100, 10);
  assert.ok(Math.hypot(farOut.x, farOut.z - 10) <= PLAYABLE_RADIUS + 0.01);
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
  assert.equal(detectZone(LANDMARKS.firewoodYard.x, LANDMARKS.firewoodYard.z), 'firewood_yard');
  assert.equal(detectZone(LANDMARKS.footStream.x, LANDMARKS.footStream.z), 'foot_stream');
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
    assert.equal(groundHeightAt(stone.x, stone.z), 0.06);
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

test('MYOYEONGAK_CUSHION_SPOTS has 16 unobstructed seats inside tatami_hall and matches 0.50m cushion top height', () => {
  assert.equal(MYOYEONGAK_CUSHION_SPOTS.length, 16);
  for (const spot of MYOYEONGAK_CUSHION_SPOTS) {
    assert.equal(detectZone(spot.x, spot.z), 'tatami_hall');
    assert.equal(groundHeightAt(spot.x, spot.z), 0.5);
    const resolved = resolvePlayerCollisions(spot.x, spot.z);
    assert.ok(
      Math.hypot(resolved.x - spot.x, resolved.z - spot.z) < 0.01,
      `Cushion ${spot.id} collided under resolvePlayerCollisions`,
    );
  }

  // Spot 2 ([2.4, -2.4]) is closest to (2.4, LANDMARKS.myoyeongak.z - 2.3),
  // but when occupied by Cream NPC, findNearestEmptyCushion must pick a different free cushion.
  const targetRef = MYOYEONGAK_CUSHION_SPOTS[2];
  const emptySpot = findNearestEmptyCushion(
    targetRef.x,
    targetRef.z + 0.1,
    [{ x: targetRef.x, z: targetRef.z }],
  );
  assert.notEqual(emptySpot.id, targetRef.id);
});

test('groundHeightAt matches milk booth bench, red cloth, and stone patio bounds without edge hovering', () => {
  // Red cloth top on bench
  assert.equal(groundHeightAt(LANDMARKS.milkBooth.x - 1.9, LANDMARKS.milkBooth.z + 0.8), 0.345);
  // Bare wooden bench surface (e.g. 우유냥 spot)
  assert.equal(groundHeightAt(LANDMARKS.milkBooth.x - 2.65, LANDMARKS.milkBooth.z + 0.85), 0.34);
  // Stone patio outside bench edge (former hovering corner must now be patio height 0.08)
  assert.equal(groundHeightAt(LANDMARKS.milkBooth.x - 3.2, LANDMARKS.milkBooth.z + 2.2), 0.08);
  assert.equal(groundHeightAt(LANDMARKS.milkBooth.x + 0.5, LANDMARKS.milkBooth.z + 1.5), 0.08);
});

test('resolvePlayerCollisions pushes away from cedar tree trunks, bridge railings, and Myoyeongak irori hearth', () => {
  assert.equal(CEDAR_TREES.length, 130);

  const tree = CEDAR_TREES[0];
  const pushedTree = resolvePlayerCollisions(tree.x, tree.z);
  const treeDist = Math.hypot(pushedTree.x - tree.x, pushedTree.z - tree.z);
  assert.ok(
    treeDist >= tree.trunkRadius + 0.42 - 1e-4,
    `Cat remained inside cedar trunk collider (${treeDist.toFixed(3)} < ${(tree.trunkRadius + 0.42).toFixed(3)})`,
  );

  const hearth = resolvePlayerCollisions(LANDMARKS.myoyeongak.x, LANDMARKS.myoyeongak.z - 0.4);
  const outsideHearth =
    hearth.x <= LANDMARKS.myoyeongak.x - 1.05 - 0.41 ||
    hearth.x >= LANDMARKS.myoyeongak.x + 1.05 + 0.41 ||
    hearth.z <= LANDMARKS.myoyeongak.z - 1.45 - 0.41 ||
    hearth.z >= LANDMARKS.myoyeongak.z + 0.65 + 0.41;
  assert.ok(outsideHearth, `Cat remained inside irori hearth (${hearth.x.toFixed(2)}, ${hearth.z.toFixed(2)})`);

  const leftRail = resolvePlayerCollisions(-2.02, LANDMARKS.entranceBridge.z);
  assert.ok(
    leftRail.x <= -2.25 - 0.41 || leftRail.x >= -1.85 + 0.41,
    `Cat remained inside left bridge railing (${leftRail.x.toFixed(2)})`,
  );

  const rightRail = resolvePlayerCollisions(2.02, LANDMARKS.entranceBridge.z);
  assert.ok(
    rightRail.x <= 1.85 - 0.41 || rightRail.x >= 2.25 + 0.41,
    `Cat remained inside right bridge railing (${rightRail.x.toFixed(2)})`,
  );
});

test('FOOTBATH_SEAT_SPOTS provides 12 unobstructed hinoki seats at 0.18m height, steps at 0.10m, and rocks clear decks/waterwheel', () => {
  assert.equal(FOOTBATH_DECK_HEIGHT, 0.18);
  assert.equal(FOOTBATH_SEAT_SPOTS.length, 12);
  for (const seat of FOOTBATH_SEAT_SPOTS) {
    assert.equal(isOnFootbathDeck(seat.x, seat.z), true);
    assert.equal(groundHeightAt(seat.x, seat.z), FOOTBATH_DECK_HEIGHT);
    const resolved = resolvePlayerCollisions(seat.x, seat.z);
    assert.ok(
      Math.hypot(resolved.x - seat.x, resolved.z - seat.z) < 0.01,
      `Footbath seat ${seat.id} collided under resolvePlayerCollisions`,
    );
  }

  // Side access steps sit at intermediate height 0.10m and stepping stones sit above water level
  const sideStep = footbathLocalToWorld(-5.15, -1.92);
  assert.equal(groundHeightAt(sideStep.x, sideStep.z), 0.1);
  assert.ok(groundHeightAt(FOOT_STREAM_STEPSTONES[3].x, FOOT_STREAM_STEPSTONES[3].z) > FOOTBATH_WATER_Y);

  const busySeat = FOOTBATH_SEAT_SPOTS[4];
  const nextSeat = findNearestEmptyFootbathSeat(busySeat.x, busySeat.z, [
    { x: busySeat.x, z: busySeat.z },
  ]);
  assert.notEqual(nextSeat.id, busySeat.id);

  for (const rock of FOOT_STREAM_BORDER_ROCKS) {
    assert.equal(isOnFootbathDeck(rock.x, rock.z, 0.45), false);
    assert.ok(
      Math.hypot(rock.x - FOOTBATH_WATERWHEEL_POS.x, rock.z - FOOTBATH_WATERWHEEL_POS.z) >= 1.45,
    );
  }

  const pushedWheel = resolvePlayerCollisions(FOOTBATH_WATERWHEEL_POS.x, FOOTBATH_WATERWHEEL_POS.z);
  assert.ok(
    Math.hypot(pushedWheel.x - FOOTBATH_WATERWHEEL_POS.x, pushedWheel.z - FOOTBATH_WATERWHEEL_POS.z) >=
      1.05 + 0.42 - 1e-4,
  );
});


