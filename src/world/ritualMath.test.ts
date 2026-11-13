import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_SPOTS,
  INITIAL_WISH_YUZUS,
  MILK_DRINK_OPTIONS,
  MILK_VENDING_UNLOCK_KNEADS,
  PENTATONIC_BAMBOO_NOTES,
  YUZU_WISH_COLORS,
  clampWishMessage,
  computePurrProximity,
  computeWaterGain,
  detectFootstepSurface,
  findNearbyInteractPrompt,
} from './ritualMath';
import { FOOT_STREAM_STEPSTONES, TELEPORT_SPOTS } from './terrainMath';

test('PENTATONIC_BAMBOO_NOTES defines C-D-E-G-A 5-note scale', () => {
  assert.equal(PENTATONIC_BAMBOO_NOTES.length, 5);
  assert.deepEqual(
    PENTATONIC_BAMBOO_NOTES.map((n) => n.label),
    ['도', '레', '미', '솔', '라'],
  );
  assert.ok(PENTATONIC_BAMBOO_NOTES[0].freq < PENTATONIC_BAMBOO_NOTES[4].freq);
});

test('computeWaterGain attenuates smoothly and becomes 0 beyond 9m from water', () => {
  // Inside or at edge of central bath (0, 4)
  assert.ok(computeWaterGain(0, 4) > 0.2);
  // 5m outside bath rim (7.6 + 5 = 12.6m from center)
  const mid = computeWaterGain(12.6, 4);
  assert.ok(mid > 0 && mid < 0.2);
  // Eastern footbath stream at (22, 28) has active water gain and stepping stones register as solid wood/stone
  assert.ok(computeWaterGain(22, 28) > 0.2);
  // > 9m away from all water features (e.g., far courtyard at (25, 10))
  assert.equal(computeWaterGain(25, 10), 0);
});

test('computePurrProximity boosts near bath, Myoyeongak hearth, and during cozy actions', () => {
  const farIdle = computePurrProximity(30, 24, 'idle');
  const bathIdle = computePurrProximity(0, 4, 'idle');
  const hallIdle = computePurrProximity(0, -12, 'idle');
  const farKnead = computePurrProximity(30, 24, 'knead');

  assert.ok(bathIdle > farIdle);
  assert.ok(hallIdle > farIdle);
  assert.ok(farKnead > farIdle);
});

test('detectFootstepSurface distinguishes snow, wood, and water across landmarks', () => {
  assert.equal(detectFootstepSurface(0, 38), 'wood'); // Entrance wooden bridge
  assert.equal(detectFootstepSurface(0, -12), 'wood'); // Myoyeongak tatami/deck
  assert.equal(detectFootstepSurface(14.1, 8.8), 'wood'); // Milk booth bench
  assert.equal(
    detectFootstepSurface(
      FOOT_STREAM_STEPSTONES[3].x,
      FOOT_STREAM_STEPSTONES[3].z,
    ),
    'wood',
  ); // Footbath stepping stone
  assert.equal(detectFootstepSurface(0, 4), 'water'); // Central bath basin
  assert.equal(detectFootstepSurface(-18, 10), 'water'); // Yuzu wish pond
  assert.equal(detectFootstepSurface(0, 25), 'snow'); // Snowy courtyard path
});

test('milk vending constants define 25 knead threshold and 4 warm drinks', () => {
  assert.equal(MILK_VENDING_UNLOCK_KNEADS, 25);
  assert.equal(MILK_DRINK_OPTIONS.length, 4);
  assert.deepEqual(
    MILK_DRINK_OPTIONS.map((d) => d.id),
    ['banana', 'strawberry', 'white', 'matatabi'],
  );
});

test('wish yuzu helpers validate colors, initial wishes, and 40-char clamping', () => {
  assert.equal(YUZU_WISH_COLORS.length, 5);
  assert.ok(INITIAL_WISH_YUZUS.length >= 3);
  const longText = '가'.repeat(55);
  assert.equal(clampWishMessage(`  ${longText}  `).length, 40);
  assert.equal(clampWishMessage('   '), '');
});

test('findNearbyInteractPrompt guides firewood 2-step flow and landmark interactions', () => {
  const firewoodArrival = TELEPORT_SPOTS.find((s) => s.zoneId === 'firewood_yard')!;
  assert.equal(
    findNearbyInteractPrompt(firewoodArrival.x, firewoodArrival.z, false, 'idle')?.kind,
    'firewood_pile',
  );
  assert.equal(
    findNearbyInteractPrompt(firewoodArrival.x, firewoodArrival.z, true, 'carrying')?.kind,
    'firewood_furnace',
  );

  const milkBench = ACTION_SPOTS.benchSitSpot;
  assert.equal(
    findNearbyInteractPrompt(milkBench.x, milkBench.z, false, 'sitBench')?.kind,
    'milk_vending',
  );

  const bambooArrival = TELEPORT_SPOTS.find((s) => s.zoneId === 'bamboo_shishi')!;
  assert.equal(
    findNearbyInteractPrompt(bambooArrival.x, bambooArrival.z, false, 'idle')?.kind,
    'shishi_odoshi',
  );

  const yuzuArrival = TELEPORT_SPOTS.find((s) => s.zoneId === 'yuzu_pond')!;
  assert.equal(
    findNearbyInteractPrompt(yuzuArrival.x, yuzuArrival.z, false, 'idle')?.kind,
    'yuzu_pond',
  );

  assert.equal(
    findNearbyInteractPrompt(ACTION_SPOTS.eggBasketSpot.x, ACTION_SPOTS.eggBasketSpot.z, false, 'idle')?.kind,
    'egg_basket',
  );
  assert.equal(
    findNearbyInteractPrompt(ACTION_SPOTS.eggBasketSpot.x, ACTION_SPOTS.eggBasketSpot.z, false, 'soak'),
    null,
  );
  assert.equal(findNearbyInteractPrompt(0, 26, false, 'idle'), null);
});
