export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type WorldZoneId =
  | 'entrance'
  | 'main_bath'
  | 'tatami_hall'
  | 'yuzu_pond'
  | 'milk_booth'
  | 'bamboo_shishi'
  | 'firewood_yard'
  | 'foot_stream'
  | 'courtyard';

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const WORLD_CENTER_Z = 10;
export const PLAYABLE_RADIUS = 44.5;

export const LANDMARKS = {
  mainBath: { x: 0, z: 4, radius: 9.0, innerRadius: 7.55, waterLevel: 0.22 },
  myoyeongak: { x: 0, z: -12, halfW: 6.2, minZ: -16.4, maxZ: -6.4 },
  yuzuPond: { x: -18, z: 10, radius: 4.1, waterLevel: 0.08 },
  milkBooth: { x: 16, z: 8 },
  bambooShishi: { x: -24, z: 33 },
  entranceBridge: { x: 0, z: 38, halfW: 2.1, halfL: 4.2 },
  firewoodYard: { x: -3, z: -28 },
  footStream: { x: 22, z: 28 },
  eggBasket: { x: 3.7, z: 11.7 },
} as const;

export function footStreamCenterZ(x: number): number {
  const dx = x - LANDMARKS.footStream.x;
  return LANDMARKS.footStream.z - dx * 0.42 + Math.sin(dx * 0.42) * 0.85;
}

export const FOOT_STREAM_STEPSTONES: readonly { x: number; z: number; r: number }[] = [
  { x: 18.4, z: footStreamCenterZ(18.4) + 0.55, r: 0.55 },
  { x: 19.6, z: footStreamCenterZ(19.6) - 0.35, r: 0.52 },
  { x: 20.8, z: footStreamCenterZ(20.8) + 0.35, r: 0.58 },
  { x: 22.0, z: footStreamCenterZ(22.0) - 0.15, r: 0.62 },
  { x: 23.2, z: footStreamCenterZ(23.2) + 0.4, r: 0.54 },
  { x: 24.4, z: footStreamCenterZ(24.4) - 0.35, r: 0.56 },
  { x: 25.6, z: footStreamCenterZ(25.6) + 0.25, r: 0.52 },
];

export const SOLID_BOX_COLLIDERS: readonly BoxCollider[] = [
  // Milk vending machine body at (17.5, 6.2)
  { minX: 16.4, maxX: 18.6, minZ: 5.2, maxZ: 7.2 },
  // Myoyeongak back wall & left/right walls (open front facing +Z toward bath)
  { minX: -6.4, maxX: 6.4, minZ: -16.8, maxZ: -15.6 },
  { minX: -6.4, maxX: -5.4, minZ: -16.0, maxZ: -7.8 },
  { minX: 5.4, maxX: 6.4, minZ: -16.0, maxZ: -7.8 },
  // Shishi-odoshi stone basin
  { minX: -23.4, maxX: -21.6, minZ: 30.6, maxZ: 32.4 },
];

export interface TeleportSpot {
  zoneId: WorldZoneId;
  label: string;
  x: number;
  z: number;
  heading: number;
  mode: 'idle' | 'soak' | 'loaf' | 'sitBench';
}

export const TELEPORT_SPOTS: readonly TeleportSpot[] = [
  {
    zoneId: 'entrance',
    label: '온천 입구 다리',
    x: 0,
    z: 38,
    heading: Math.PI,
    mode: 'idle',
  },
  {
    zoneId: 'main_bath',
    label: '노천 편백탕',
    x: 0,
    z: 5.0,
    heading: Math.PI,
    mode: 'soak',
  },
  {
    zoneId: 'tatami_hall',
    label: '고양이 난로방',
    x: 0,
    z: -10.5,
    heading: 0,
    mode: 'loaf',
  },
  {
    zoneId: 'yuzu_pond',
    label: '따뜻한 유자 연못',
    x: -12.3,
    z: 9.6,
    heading: -Math.PI / 2,
    mode: 'idle',
  },
  {
    zoneId: 'milk_booth',
    label: '우유 자판기 & 평상',
    x: 14.1,
    z: 8.8,
    heading: -0.75,
    mode: 'sitBench',
  },
  {
    zoneId: 'bamboo_shishi',
    label: '대나무 숲 물통',
    x: -20.2,
    z: 30.8,
    heading: -0.65,
    mode: 'idle',
  },
  {
    zoneId: 'firewood_yard',
    label: '아궁이 장작터',
    x: -3.0,
    z: -24.2,
    heading: Math.PI,
    mode: 'idle',
  },
  {
    zoneId: 'foot_stream',
    label: '족욕 개울',
    x: 20.4,
    z: 26.5,
    heading: 0.65,
    mode: 'idle',
  },
] as const;

export interface BathRimRockSpec {
  lx: number;
  lz: number;
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  colliderRadius: number;
}

function createBathRimRocks(): readonly BathRimRockSpec[] {
  let seed = 41927;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const rocks: BathRimRockSpec[] = [];
  for (let i = 0; i < 34; i++) {
    const angle = (i / 34) * Math.PI * 2 + (nextRand() - 0.5) * 0.08;
    const r = 9.2 + nextRand() * 1.1;
    const lx = Math.cos(angle) * r;
    const lz = Math.sin(angle) * r;
    const sx = 0.7 + nextRand() * 0.7;
    const sy = 0.45 + nextRand() * 0.45;
    const sz = 0.7 + nextRand() * 0.7;
    const rotX = nextRand() * 0.4;
    const rotY = nextRand() * Math.PI;
    const rotZ = nextRand() * 0.4;
    // Keep South (+Z) and North (-Z) stairways completely clear
    if (Math.abs(lx) < 2.85 && Math.abs(lz) > 6.5) continue;
    // Keep SE egg dipping basin spot clear at local (3.7, 7.7)
    if (Math.hypot(lx - 3.7, lz - 7.7) < 1.35) continue;
    rocks.push({
      lx,
      lz,
      x: LANDMARKS.mainBath.x + lx,
      z: LANDMARKS.mainBath.z + lz,
      sx,
      sy,
      sz,
      rotX,
      rotY,
      rotZ,
      colliderRadius: Math.max(sx, sz) * 0.72,
    });
  }
  return rocks;
}

export const BATH_RIM_ROCKS: readonly BathRimRockSpec[] = createBathRimRocks();

export interface YuzuPondRockSpec {
  lx: number;
  lz: number;
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  colliderRadius: number;
}

function createYuzuPondRimRocks(): readonly YuzuPondRockSpec[] {
  let seed = 73519;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const rocks: YuzuPondRockSpec[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 3.7 + (nextRand() - 0.5) * 0.35;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    const sx = 0.55 + nextRand() * 0.35;
    const sy = 0.35 + nextRand() * 0.25;
    const sz = 0.55 + nextRand() * 0.35;
    const rotY = nextRand() * Math.PI;
    rocks.push({
      lx,
      lz,
      x: LANDMARKS.yuzuPond.x + lx,
      z: LANDMARKS.yuzuPond.z + lz,
      sx,
      sy,
      sz,
      rotY,
      colliderRadius: Math.max(sx, sz) * 0.72,
    });
  }
  return rocks;
}

export const YUZU_POND_RIM_ROCKS: readonly YuzuPondRockSpec[] = createYuzuPondRimRocks();

export const SOLID_CIRCLE_COLLIDERS: readonly CircleCollider[] = [
  // Yuzu pond interior water basin (prevents stepping inside pond or wedging between adjacent rim rocks)
  { x: LANDMARKS.yuzuPond.x, z: LANDMARKS.yuzuPond.z, radius: 3.55 },
  // Yuzu pond stone lantern
  { x: -14.0, z: 12.6, radius: 0.85 },
  // Yuzu pond 18 rim rocks
  ...YUZU_POND_RIM_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.colliderRadius })),
  // Bridge lantern posts (4 corners)
  { x: -2.05, z: 34.4, radius: 0.45 },
  { x: 2.05, z: 34.4, radius: 0.45 },
  { x: -2.05, z: 41.6, radius: 0.45 },
  { x: 2.05, z: 41.6, radius: 0.45 },
  // Firewood yard log rack (-5.2, -28.0) & agungi furnace (-0.8, -28.4)
  { x: -5.2, z: -28.0, radius: 0.95 },
  { x: -0.8, z: -28.4, radius: 1.2 },
  // SE onsen egg dipping well (3.7, 11.7)
  { x: LANDMARKS.eggBasket.x, z: LANDMARKS.eggBasket.z, radius: 0.65 },
  // Outer hinoki bath decorative rim rocks
  ...BATH_RIM_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.colliderRadius })),
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic terrain + walkway + bath floor height at world (x, z).
 * Used both for displacing the terrain mesh and smoothly damping the cat's Y position.
 */
export function groundHeightAt(x: number, z: number): number {
  // 1. Entrance wooden bridge over creek at (0, 38)
  const bridge = LANDMARKS.entranceBridge;
  if (Math.abs(x) <= bridge.halfW && Math.abs(z - bridge.z) <= bridge.halfL) {
    const t = Math.abs(z - bridge.z) / bridge.halfL;
    return 0.42 * Math.cos(t * Math.PI * 0.5);
  }

  // 2. Central open-air hinoki bath at (0, 4), radius 9m
  const bathDx = x - LANDMARKS.mainBath.x;
  const bathDz = z - LANDMARKS.mainBath.z;
  const bathDist = Math.hypot(bathDx, bathDz);
  if (bathDist <= LANDMARKS.mainBath.radius + 3.2) {
    // South entry stairs facing spawn bridge (+Z) and north entry stairs facing Myoyeongak (-Z)
    const onSouthStair = Math.abs(bathDx) <= 2.35 && bathDz >= 5.2 && bathDz <= 11.4;
    const onNorthStair = Math.abs(bathDx) <= 2.1 && bathDz <= -5.2 && bathDz >= -10.8;

    if (onSouthStair) {
      if (bathDz >= 9.0) {
        // Approach ramp 0 -> 0.44
        return 0.44 * (1 - smoothstep(9.0, 11.4, bathDz));
      }
      if (bathDz >= 7.3) {
        // Top wooden threshold
        return 0.44;
      }
      // Step down into water (-0.30)
      return 0.44 - 0.74 * (1 - smoothstep(5.4, 7.3, bathDz));
    }

    if (onNorthStair) {
      const adz = -bathDz;
      if (adz >= 9.0) {
        return 0.44 * (1 - smoothstep(9.0, 10.8, adz));
      }
      if (adz >= 7.3) {
        return 0.44;
      }
      return 0.44 - 0.74 * (1 - smoothstep(5.4, 7.3, adz));
    }

    if (bathDist < 7.55) {
      return -0.3;
    }
    if (bathDist <= 9.05) {
      // Hinoki rim wall top
      return 0.48;
    }
  }

  // 3. Myoyeongak pavilion raised deck & tatami floor at (0, -12)
  if (Math.abs(x) <= 6.2 && z >= -16.4 && z <= -4.4) {
    if (z <= -6.4) {
      return 0.44;
    }
    // Front wooden steps from z = -4.4 (0m) up to z = -6.4 (0.44m)
    return 0.44 * smoothstep(-4.4, -6.4, z);
  }

  // 4. Milk booth wooden platform bench (평상) at (14.1, 8.8)
  if (x >= 12.4 && x <= 15.8 && z >= 7.4 && z <= 10.2) {
    return 0.32;
  }

  // 5. Yuzu wish pond basin at (-18, 10)
  const yuzuDist = Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z);
  if (yuzuDist < 3.6) {
    return -0.28 * (1 - smoothstep(2.4, 3.6, yuzuDist));
  }

  // 6. Creek bed passing beneath entrance bridge at z ~ 38
  const creekCenterZ = 38 + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.abs(z - creekCenterZ);
  let baseH = 0;
  if (creekDist < 3.4) {
    baseH -= 0.42 * (1 - smoothstep(1.2, 3.4, creekDist));
  }

  // 6b. Eastern footbath stream & stepping stones around (22, 28)
  if (x >= 15.2 && x <= 28.8) {
    const fz = footStreamCenterZ(x);
    const fDist = Math.abs(z - fz);
    if (fDist < 2.3) {
      const endFade = smoothstep(15.2, 17.0, x) * (1 - smoothstep(27.0, 28.8, x));
      baseH = Math.min(baseH, -0.22 * (1 - smoothstep(0.95, 2.3, fDist)) * endFade);
    }
  }
  for (const stone of FOOT_STREAM_STEPSTONES) {
    if (Math.hypot(x - stone.x, z - stone.z) <= stone.r * 1.05) {
      return 0.05;
    }
  }

  // 7. Gentle snowdrifts & outer mountain slopes beyond r > 44m
  const worldDist = Math.hypot(x, z - WORLD_CENTER_Z);
  const gentleRoll =
    Math.sin(x * 0.085) * Math.cos(z * 0.075) * 0.14 +
    Math.sin((x + z) * 0.045) * 0.08;

  // Keep central courtyard, firewood yard & paths relatively flat
  const firewoodDist = Math.hypot(x - LANDMARKS.firewoodYard.x, z - LANDMARKS.firewoodYard.z);
  const flatMask =
    firewoodDist < 6.5 ? 0 : smoothstep(24, 46, worldDist);
  let h = baseH + gentleRoll * (0.25 + 0.75 * flatMask);

  // Bamboo grove gentle hillock at (-24, 33)
  const bambooDist = Math.hypot(x + 25, z - 34);
  if (bambooDist < 7.5) {
    h += 0.35 * (1 - smoothstep(2.0, 7.5, bambooDist));
  }

  // Outer snow mountain ring (45m -> 190m)
  if (worldDist > 45) {
    const rimT = smoothstep(45, 130, worldDist);
    const peakWave =
      0.65 +
      0.35 * Math.sin(Math.atan2(z - WORLD_CENTER_Z, x) * 5.0 + 0.8) +
      0.22 * Math.cos(Math.atan2(z - WORLD_CENTER_Z, x) * 9.0 - 0.4);
    const distantWave = smoothstep(95, 185, worldDist);
    h += rimT * 18.0 * peakWave + distantWave * 28.0 * (0.7 + 0.3 * Math.sin(x * 0.04));
  }

  return h;
}

/**
 * Pure terrain elevation used for the continuous ground mesh (excludes elevated bridge deck
 * and pavilion tatami floor so the creek flows under the bridge cleanly).
 */
export function terrainMeshHeightAt(x: number, z: number): number {
  const bathDx = x - LANDMARKS.mainBath.x;
  const bathDz = z - LANDMARKS.mainBath.z;
  const bathDist = Math.hypot(bathDx, bathDz);

  let h = 0;

  if (bathDist < 7.7) {
    h = -0.34;
  }

  const yuzuDist = Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z);
  if (yuzuDist < 3.8) {
    h = Math.min(h, -0.32 * (1 - smoothstep(2.4, 3.8, yuzuDist)));
  }

  const creekCenterZ = 38 + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.abs(z - creekCenterZ);
  if (creekDist < 3.6) {
    h = Math.min(h, -0.45 * (1 - smoothstep(1.2, 3.6, creekDist)));
  }

  if (x >= 15.2 && x <= 28.8) {
    const fz = footStreamCenterZ(x);
    const fDist = Math.abs(z - fz);
    if (fDist < 2.35) {
      const endFade = smoothstep(15.2, 17.0, x) * (1 - smoothstep(27.0, 28.8, x));
      h = Math.min(h, -0.25 * (1 - smoothstep(0.95, 2.35, fDist)) * endFade);
    }
  }

  const worldDist = Math.hypot(x, z - WORLD_CENTER_Z);
  const gentleRoll =
    Math.sin(x * 0.085) * Math.cos(z * 0.075) * 0.14 +
    Math.sin((x + z) * 0.045) * 0.08;
  const firewoodDist = Math.hypot(x - LANDMARKS.firewoodYard.x, z - LANDMARKS.firewoodYard.z);
  const flatMask =
    firewoodDist < 6.5 ? 0 : smoothstep(24, 46, worldDist);
  h += gentleRoll * (0.25 + 0.75 * flatMask);

  const bambooDist = Math.hypot(x + 25, z - 34);
  if (bambooDist < 7.5) {
    h += 0.35 * (1 - smoothstep(2.0, 7.5, bambooDist));
  }

  if (worldDist > 45) {
    const rimT = smoothstep(45, 130, worldDist);
    const peakWave =
      0.65 +
      0.35 * Math.sin(Math.atan2(z - WORLD_CENTER_Z, x) * 5.0 + 0.8) +
      0.22 * Math.cos(Math.atan2(z - WORLD_CENTER_Z, x) * 9.0 - 0.4);
    const distantWave = smoothstep(95, 185, worldDist);
    h += rimT * 18.0 * peakWave + distantWave * 28.0 * (0.7 + 0.3 * Math.sin(x * 0.04));
  }

  return h;
}

/**
 * Resolves solid colliders (bath wooden walls outside stairways, pavilion back/side walls,
 * vending machine, lanterns, and playable world boundary).
 */
export function resolvePlayerCollisions(x: number, z: number, playerRadius = 0.42): Vec2 {
  let rx = x;
  let rz = z;

  // 1. Central hinoki bath circular rim wall + outer rock belt (except south & north stair openings)
  const bx = rx - LANDMARKS.mainBath.x;
  const bz = rz - LANDMARKS.mainBath.z;
  const bDist = Math.hypot(bx, bz);
  const inSouthEntry = Math.abs(bx) <= 2.1 && bz > 4.8 && bz < 11.2;
  const inNorthEntry = Math.abs(bx) <= 1.85 && bz < -4.8 && bz > -11.2;
  if (!inSouthEntry && !inNorthEntry && bDist > 7.1 && bDist < 10.55) {
    const nx = bx / (bDist || 1);
    const nz = bz / (bDist || 1);
    // Push inward if inside bath, outward past the rock ring if outside bath
    const targetR = bDist < 8.3 ? 7.1 : 10.55;
    rx = LANDMARKS.mainBath.x + nx * targetR;
    rz = LANDMARKS.mainBath.z + nz * targetR;
  }

  // 2. Box colliders (AABB push-out)
  for (const box of SOLID_BOX_COLLIDERS) {
    const minX = box.minX - playerRadius;
    const maxX = box.maxX + playerRadius;
    const minZ = box.minZ - playerRadius;
    const maxZ = box.maxZ + playerRadius;
    if (rx > minX && rx < maxX && rz > minZ && rz < maxZ) {
      const dLeft = rx - minX;
      const dRight = maxX - rx;
      const dTop = rz - minZ;
      const dBottom = maxZ - rz;
      const m = Math.min(dLeft, dRight, dTop, dBottom);
      if (m === dLeft) rx = minX;
      else if (m === dRight) rx = maxX;
      else if (m === dTop) rz = minZ;
      else rz = maxZ;
    }
  }

  // 3. Circle colliders (2 passes to prevent wedging between adjacent rim stones)
  for (let pass = 0; pass < 2; pass++) {
    for (const col of SOLID_CIRCLE_COLLIDERS) {
      const dx = rx - col.x;
      const dz = rz - col.z;
      const minDist = col.radius + playerRadius;
      const dist = Math.hypot(dx, dz);
      if (dist < minDist) {
        const nx = dist > 0.0001 ? dx / dist : 0;
        const nz = dist > 0.0001 ? dz / dist : 1;
        rx = col.x + nx * minDist;
        rz = col.z + nz * minDist;
      }
    }
  }

  // 4. Playable world boundary (~44.5m from courtyard center)
  const cz = rz - WORLD_CENTER_Z;
  const cDist = Math.hypot(rx, cz);
  if (cDist > PLAYABLE_RADIUS) {
    const scale = PLAYABLE_RADIUS / cDist;
    rx *= scale;
    rz = WORLD_CENTER_Z + cz * scale;
  }

  return { x: rx, z: rz };
}

export function isInsideMainBath(x: number, z: number): boolean {
  const dist = Math.hypot(x - LANDMARKS.mainBath.x, z - LANDMARKS.mainBath.z);
  return dist < 7.4;
}

export function detectZone(x: number, z: number): WorldZoneId {
  if (isInsideMainBath(x, z)) return 'main_bath';
  if (Math.abs(x) <= 6.2 && z >= -16.4 && z <= -5.4) return 'tatami_hall';
  if (Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z) <= 6.5) {
    return 'yuzu_pond';
  }
  if (Math.hypot(x - LANDMARKS.milkBooth.x, z - LANDMARKS.milkBooth.z) <= 6.0) {
    return 'milk_booth';
  }
  if (Math.hypot(x - LANDMARKS.bambooShishi.x, z - LANDMARKS.bambooShishi.z) <= 8.0) {
    return 'bamboo_shishi';
  }
  if (Math.hypot(x - LANDMARKS.firewoodYard.x, z - LANDMARKS.firewoodYard.z) <= 7.5) {
    return 'firewood_yard';
  }
  if (Math.hypot(x - LANDMARKS.footStream.x, z - LANDMARKS.footStream.z) <= 8.0) {
    return 'foot_stream';
  }
  if (Math.abs(x) <= 3.5 && Math.abs(z - LANDMARKS.entranceBridge.z) <= 5.2) {
    return 'entrance';
  }
  return 'courtyard';
}

export const CAMERA_DEFAULTS = {
  fovLandscape: 60,
  fovPortrait: 65,
  defaultDistance: 2.85,
  minDistance: 1.8,
  maxDistance: 11.0,
  heightOffsetLandscape: 1.45,
  heightOffsetPortrait: 2.1,
  lookHeightLandscape: 0.55,
  lookHeightPortrait: 0.45,
  lookAheadDistance: 3.0,
  dampingRate: 6.5,
  yawSensitivity: 0.0034,
  pitchSensitivityRatio: 0.65,
  minPitch: -0.24,
  maxPitch: 0.34,
} as const;

export interface CameraRigResult {
  fov: number;
  position: Vec3;
  lookAt: Vec3;
}

/**
 * Computes target camera position and look-at point around the cat avatar.
 * At yaw = 0, camera sits at +Z behind the cat and looks toward -Z (the central bath).
 */
export function computeCameraRig(
  aspect: number,
  distance: number,
  yaw: number,
  pitch: number,
  playerPos: Vec3,
): CameraRigResult {
  const isPortrait = aspect < 0.85;
  const fov = isPortrait ? CAMERA_DEFAULTS.fovPortrait : CAMERA_DEFAULTS.fovLandscape;
  const clampedDist = Math.max(
    CAMERA_DEFAULTS.minDistance,
    Math.min(CAMERA_DEFAULTS.maxDistance, distance),
  );
  const clampedPitch = Math.max(
    CAMERA_DEFAULTS.minPitch,
    Math.min(CAMERA_DEFAULTS.maxPitch, pitch),
  );

  const baseHeight = isPortrait
    ? CAMERA_DEFAULTS.heightOffsetPortrait
    : CAMERA_DEFAULTS.heightOffsetLandscape;
  const lookHeight = isPortrait
    ? CAMERA_DEFAULTS.lookHeightPortrait
    : CAMERA_DEFAULTS.lookHeightLandscape;

  const zoomLift = Math.max(0, clampedDist - CAMERA_DEFAULTS.defaultDistance) * 0.24;
  const pitchLift = Math.sin(clampedPitch) * clampedDist * 0.85;
  const horizDist = clampedDist * Math.cos(clampedPitch * 0.6);

  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  const camX = playerPos.x + horizDist * sinYaw;
  const camY = Math.max(playerPos.y + 0.45, playerPos.y + baseHeight + zoomLift + pitchLift);
  const camZ = playerPos.z + horizDist * cosYaw;

  const lookX = playerPos.x - CAMERA_DEFAULTS.lookAheadDistance * sinYaw;
  const lookY = playerPos.y + lookHeight - clampedPitch * 0.65;
  const lookZ = playerPos.z - CAMERA_DEFAULTS.lookAheadDistance * cosYaw;

  return {
    fov,
    position: { x: camX, y: camY, z: camZ },
    lookAt: { x: lookX, y: lookY, z: lookZ },
  };
}

export function exponentialDampingAlpha(
  dt: number,
  rate: number = CAMERA_DEFAULTS.dampingRate,
): number {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  return 1 - Math.exp(-safeDt * rate);
}

/**
 * Computes world-space movement vector from camera-relative WASD/arrow axes
 * and returns the cat's forward heading matching local +Z = Math.atan2(dx, dz).
 */
export function computeWorldMoveFromInput(
  forwardAxis: number,
  rightAxis: number,
  cameraYaw: number,
): { dx: number; dz: number; heading: number } | null {
  if (Math.abs(forwardAxis) < 0.001 && Math.abs(rightAxis) < 0.001) {
    return null;
  }
  const sinYaw = Math.sin(cameraYaw);
  const cosYaw = Math.cos(cameraYaw);

  // Camera looks along (-sinYaw, -cosYaw); camera right is (cosYaw, -sinYaw)
  let dx = -sinYaw * forwardAxis + cosYaw * rightAxis;
  let dz = -cosYaw * forwardAxis - sinYaw * rightAxis;
  const len = Math.hypot(dx, dz);
  if (len < 0.0001) return null;
  dx /= len;
  dz /= len;

  // Local +Z rotated by heading around Y gives (sin(heading), 0, cos(heading)) = (dx, 0, dz)
  const heading = Math.atan2(dx, dz);
  return { dx, dz, heading };
}
