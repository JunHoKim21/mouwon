import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_SPOTS,
  GROOM_DURATION,
  INITIAL_WISH_YUZUS,
  MILK_DRINK_OPTIONS,
  MILK_VENDING_UNLOCK_KNEADS,
  PENTATONIC_BAMBOO_NOTES,
  YARN_MAX_COUNT,
  YUZU_WISH_COLORS,
  clampWishMessage,
  computeForestWindGain,
  computePurrProximity,
  computeWaterGain,
  detectFootstepSurface,
  findNearbyInteractPrompt,
  getMilkDrinkById,
  isNearMilkVending,
} from './ritualMath';
import {
  CEDAR_TREES,
  FOOTBATH_SEAT_SPOTS,
  FOOTBATH_WATERWHEEL_POS,
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  TELEPORT_SPOTS,
} from './terrainMath';

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
  // Eastern footbath stream at LANDMARKS.footStream has active water gain
  assert.ok(computeWaterGain(LANDMARKS.footStream.x, LANDMARKS.footStream.z) > 0.2);
  // > 9m away from all water features (e.g., far courtyard at (45, 10))
  assert.equal(computeWaterGain(45, 10), 0);
});

test('computePurrProximity boosts near bath, Myoyeongak hearth, and during cozy actions', () => {
  const farIdle = computePurrProximity(45, 24, 'idle');
  const bathIdle = computePurrProximity(0, 4, 'idle');
  const hallIdle = computePurrProximity(0, LANDMARKS.myoyeongak.z, 'idle');
  const farKnead = computePurrProximity(45, 24, 'knead');
  const farGroom = computePurrProximity(45, 24, 'groom');
  const farFootSoak = computePurrProximity(45, 24, 'footSoak');

  assert.ok(bathIdle > farIdle);
  assert.ok(hallIdle > farIdle);
  assert.ok(farKnead > farIdle);
  assert.ok(farGroom > farIdle);
  assert.ok(farFootSoak > farIdle);
  assert.equal(GROOM_DURATION, 3.2);
});

test('detectFootstepSurface distinguishes snow, wood, stone, and water across landmarks', () => {
  assert.equal(detectFootstepSurface(0, LANDMARKS.entranceBridge.z), 'wood'); // Entrance wooden bridge
  assert.equal(detectFootstepSurface(0, LANDMARKS.myoyeongak.z), 'wood'); // Myoyeongak tatami/deck
  assert.equal(
    detectFootstepSurface(ACTION_SPOTS.benchSitSpot.x, ACTION_SPOTS.benchSitSpot.z),
    'wood',
  ); // Milk booth bench
  assert.equal(
    detectFootstepSurface(FOOTBATH_SEAT_SPOTS[2].x, FOOTBATH_SEAT_SPOTS[2].z),
    'wood',
  ); // Hinoki footbath deck
  assert.equal(detectFootstepSurface(0, 25), 'wood'); // Central wooden boardwalk
  assert.equal(
    detectFootstepSurface(
      FOOT_STREAM_STEPSTONES[3].x,
      FOOT_STREAM_STEPSTONES[3].z,
    ),
    'stone',
  ); // Footbath stepping stone
  assert.equal(detectFootstepSurface(-14, -36), 'stone'); // Northwest forest stone trail
  assert.equal(detectFootstepSurface(0, 4), 'water'); // Central bath basin
  assert.equal(detectFootstepSurface(LANDMARKS.yuzuPond.x, LANDMARKS.yuzuPond.z), 'water'); // Yuzu wish pond
  assert.equal(
    detectFootstepSurface(LANDMARKS.footStream.x + 1.8, LANDMARKS.footStream.z - 0.8),
    'water',
  ); // Open footbath stream water channel
  assert.equal(detectFootstepSurface(8, 25), 'snow'); // Snowy off-path ground
});

test('computeForestWindGain responds spatially to cedar forest, bamboo grove, and footbath waterwheel', () => {
  const nearCedar = computeForestWindGain(CEDAR_TREES[0].x + 1.5, CEDAR_TREES[0].z);
  assert.ok(nearCedar.cedarGain > 0.7);

  const nearBamboo = computeForestWindGain(LANDMARKS.bambooShishi.x, LANDMARKS.bambooShishi.z);
  assert.equal(nearBamboo.bambooGain, 1);

  const nearWheel = computeForestWindGain(FOOTBATH_WATERWHEEL_POS.x, FOOTBATH_WATERWHEEL_POS.z);
  assert.equal(nearWheel.waterwheelGain, 1);

  const openBath = computeForestWindGain(0, 4);
  assert.equal(openBath.bambooGain, 0);
  assert.equal(openBath.waterwheelGain, 0);
});

test('milk vending & yarn constants define 25 kneads, 4 warm drinks, and 100 yarn max', () => {
  assert.equal(MILK_VENDING_UNLOCK_KNEADS, 25);
  assert.equal(YARN_MAX_COUNT, 100);
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
  const bambooPrompt = findNearbyInteractPrompt(bambooArrival.x, bambooArrival.z, false, 'idle');
  assert.equal(bambooPrompt?.kind, 'shishi_odoshi');
  assert.equal(bambooPrompt?.label, '🎋 대나무 물통 울리기');

  const yuzuArrival = TELEPORT_SPOTS.find((s) => s.zoneId === 'yuzu_pond')!;
  const yuzuPrompt = findNearbyInteractPrompt(yuzuArrival.x, yuzuArrival.z, false, 'idle');
  assert.equal(yuzuPrompt?.kind, 'yuzu_pond');
  assert.equal(yuzuPrompt?.label, '🍊 감사·응원 유자 띄우기');

  assert.equal(
    findNearbyInteractPrompt(ACTION_SPOTS.eggBasketSpot.x, ACTION_SPOTS.eggBasketSpot.z, false, 'idle')?.kind,
    'egg_basket',
  );
  assert.equal(
    findNearbyInteractPrompt(ACTION_SPOTS.eggBasketSpot.x, ACTION_SPOTS.eggBasketSpot.z, false, 'soak'),
    null,
  );
  assert.equal(
    findNearbyInteractPrompt(LANDMARKS.footStream.x, LANDMARKS.footStream.z, false, 'idle')?.kind,
    'footbath_seat',
  );
  assert.equal(
    findNearbyInteractPrompt(LANDMARKS.footStream.x, LANDMARKS.footStream.z, false, 'footSoak'),
    null,
  );
  assert.equal(findNearbyInteractPrompt(0, 26, false, 'idle'), null);
});

test('getMilkDrinkById and isNearMilkVending validate drink lookup and booth proximity', () => {
  assert.equal(getMilkDrinkById('banana')?.label, '바나나우유');
  assert.equal(getMilkDrinkById('matatabi')?.bottleColor, '#a8cf97');
  assert.equal(getMilkDrinkById('unknown'), null);
  assert.equal(getMilkDrinkById(null), null);

  assert.equal(isNearMilkVending(LANDMARKS.milkBooth.x, LANDMARKS.milkBooth.z), true);
  assert.equal(isNearMilkVending(0, 4), false);

  const milkVendingSpot = ACTION_SPOTS.milkVendingSpot;
  assert.equal(
    findNearbyInteractPrompt(milkVendingSpot.x, milkVendingSpot.z, false, 'idle')?.kind,
    'milk_vending',
  );
  assert.equal(
    findNearbyInteractPrompt(
      LANDMARKS.milkBooth.x - 3.2,
      LANDMARKS.milkBooth.z + 2.0,
      false,
      'idle',
    )?.kind,
    'milk_vending',
  );
  assert.equal(
    findNearbyInteractPrompt(
      ACTION_SPOTS.benchSitSpot.x,
      ACTION_SPOTS.benchSitSpot.z,
      false,
      'sitBench',
    )?.kind,
    'milk_vending',
  );
});
