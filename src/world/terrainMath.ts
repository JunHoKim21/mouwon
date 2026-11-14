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
export const PLAYABLE_RADIUS = 72.0;

export const LANDMARKS = {
  mainBath: { x: 0, z: 4, radius: 9.0, innerRadius: 7.55, waterLevel: 0.22 },
  myoyeongak: { x: 0, z: -36, halfW: 9.6, minZ: -43.2, maxZ: -28.8 },
  yuzuPond: { x: -28, z: 10, radius: 4.1, waterLevel: 0.08 },
  milkBooth: { x: 26, z: 8 },
  bambooShishi: { x: -34, z: 40 },
  entranceBridge: { x: 0, z: 50, halfW: 2.1, halfL: 4.2 },
  firewoodYard: { x: -16, z: -50 },
  footStream: { x: 32, z: 34 },
  eggBasket: { x: 3.7, z: 11.7 },
} as const;

export interface WalkwaySegment {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
}

export const WALKWAY_SEGMENTS: readonly WalkwaySegment[] = [
  // 1. 입구 다리 북단 -> 중앙 노천탕 남쪽 계단 앞 광장
  { id: 'south-main', ax: 0, az: 45.6, bx: 0, bz: 15.2, width: 2.2 },
  // 2. 중앙 노천탕 북쪽 계단 -> 묘연각 정자 앞 디딤계단
  { id: 'north-courtyard', ax: 0, az: -7.0, bx: 0, bz: -26.8, width: 2.4 },
  // 3. 중앙 광장 -> 서쪽 유자 연못
  { id: 'west-yuzu', ax: -1.6, az: 18.0, bx: -22.2, bz: 10.2, width: 1.8 },
  // 4. 중앙 광장 -> 동쪽 우유 자판기 평상 마당
  { id: 'east-milk', ax: 1.6, az: 18.0, bx: 22.4, bz: 8.8, width: 1.8 },
  // 5. 입구 산책로 -> 남서쪽 대나무 숲 물통
  { id: 'southwest-bamboo', ax: -1.4, az: 34.0, bx: -29.8, bz: 37.8, width: 1.7 },
  // 6. 입구 산책로 -> 남동쪽 족욕 개울
  { id: 'southeast-stream', ax: 1.4, az: 30.5, bx: 27.6, bz: 33.8, width: 1.7 },
  // 7. 북쪽 산책로 -> 묘연각 서쪽 정원을 감싸 돌며 아궁이 장작터로 이어지는 숲길
  { id: 'northwest-firewood-entry', ax: -1.4, az: -18.0, bx: -12.8, bz: -24.0, width: 1.8 },
  { id: 'northwest-firewood-mid', ax: -12.8, az: -24.0, bx: -15.2, bz: -38.0, width: 1.8 },
  { id: 'northwest-firewood-yard', ax: -15.2, az: -38.0, bx: -16.0, bz: -46.2, width: 1.8 },
];

export const WALKWAY_BOARDWALK_IDS: ReadonlySet<string> = new Set([
  'south-main',
  'north-courtyard',
  'west-yuzu',
  'east-milk',
]);

export function distToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function distToWalkway(x: number, z: number): number {
  let best = Infinity;
  for (const seg of WALKWAY_SEGMENTS) {
    const d = distToSegment2D(x, z, seg.ax, seg.az, seg.bx, seg.bz) - seg.width * 0.5;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Returns whether `(x, z)` lies on one of the raised hinoki boardwalk trails
 * vs forest stone stepping trails.
 */
export function isOnBoardwalkWalkway(x: number, z: number, margin = 0.15): boolean {
  for (const seg of WALKWAY_SEGMENTS) {
    if (!WALKWAY_BOARDWALK_IDS.has(seg.id)) continue;
    if (distToSegment2D(x, z, seg.ax, seg.az, seg.bx, seg.bz) - seg.width * 0.5 <= margin) {
      return true;
    }
  }
  return false;
}

export const FOOTBATH_DECK_YAW = 0.192;
export const FOOTBATH_DECK_HEIGHT = 0.18;
export const FOOTBATH_WATER_Y = 0.015;
export const FOOTBATH_DECK_LENGTH = 9.6;
export const FOOTBATH_DECK_DEPTH = 1.4;

const FOOTBATH_COS = Math.cos(FOOTBATH_DECK_YAW);
const FOOTBATH_SIN = Math.sin(FOOTBATH_DECK_YAW);
const FOOTBATH_TAN = Math.tan(FOOTBATH_DECK_YAW);

export function footStreamCenterZ(x: number): number {
  const dx = x - LANDMARKS.footStream.x;
  const bend =
    Math.abs(dx) > 5.35
      ? Math.sin((dx - Math.sign(dx) * 5.35) * 0.45) * 0.42
      : 0;
  return LANDMARKS.footStream.z - dx * FOOTBATH_TAN + bend;
}

export function footbathLocalToWorld(u: number, v: number): Vec2 {
  return {
    x: LANDMARKS.footStream.x + u * FOOTBATH_COS + v * FOOTBATH_SIN,
    z: LANDMARKS.footStream.z - u * FOOTBATH_SIN + v * FOOTBATH_COS,
  };
}

export function worldToFootbathLocal(x: number, z: number): { u: number; v: number } {
  const dx = x - LANDMARKS.footStream.x;
  const dz = z - LANDMARKS.footStream.z;
  return {
    u: dx * FOOTBATH_COS - dz * FOOTBATH_SIN,
    v: dx * FOOTBATH_SIN + dz * FOOTBATH_COS,
  };
}

export interface FootbathDeckSpec {
  id: 'nw' | 'se';
  centerV: number;
  x: number;
  z: number;
  length: number;
  depth: number;
  hasEave: boolean;
}

export const FOOTBATH_DECK_SPECS: readonly FootbathDeckSpec[] = (['nw', 'se'] as const).map(
  (id) => {
    const centerV = id === 'nw' ? -1.92 : 1.92;
    const world = footbathLocalToWorld(0, centerV);
    return {
      id,
      centerV,
      x: world.x,
      z: world.z,
      length: FOOTBATH_DECK_LENGTH,
      depth: FOOTBATH_DECK_DEPTH,
      hasEave: id === 'nw',
    };
  },
);

export function isOnFootbathDeck(x: number, z: number, margin = 0): boolean {
  const { u, v } = worldToFootbathLocal(x, z);
  if (Math.abs(u) > FOOTBATH_DECK_LENGTH * 0.5 + margin) return false;
  const halfD = FOOTBATH_DECK_DEPTH * 0.5 + margin;
  return Math.abs(v + 1.92) <= halfD || Math.abs(v - 1.92) <= halfD;
}

export function isOnFootbathStep(x: number, z: number): boolean {
  const { u, v } = worldToFootbathLocal(x, z);
  const absU = Math.abs(u);
  if (absU < FOOTBATH_DECK_LENGTH * 0.5 || absU > FOOTBATH_DECK_LENGTH * 0.5 + 0.72) {
    return false;
  }
  const halfStepD = FOOTBATH_DECK_DEPTH * 0.43;
  return Math.abs(v + 1.92) <= halfStepD || Math.abs(v - 1.92) <= halfStepD;
}

export interface FootbathSeatSpot {
  id: number;
  row: 'nw' | 'se';
  col: number;
  u: number;
  v: number;
  x: number;
  z: number;
  heading: number;
}

export const FOOTBATH_SEAT_SPOTS: readonly FootbathSeatSpot[] = (() => {
  const spots: FootbathSeatSpot[] = [];
  let id = 0;
  for (const row of ['nw', 'se'] as const) {
    const v = row === 'nw' ? -1.32 : 1.32;
    // NW faces SE (+v direction), SE faces NW (-v direction)
    const heading =
      row === 'nw'
        ? Math.atan2(FOOTBATH_SIN, FOOTBATH_COS)
        : Math.atan2(-FOOTBATH_SIN, -FOOTBATH_COS);
    for (let col = 0; col < 6; col++) {
      const u = (col - 2.5) * 1.54;
      const world = footbathLocalToWorld(u, v);
      spots.push({
        id: id++,
        row,
        col,
        u,
        v,
        x: world.x,
        z: world.z,
        heading,
      });
    }
  }
  return spots;
})();

export const FOOTBATH_EAVE_POST_SPOTS: readonly Vec2[] = [-4.3, 0, 4.3].map((u) =>
  footbathLocalToWorld(u, -2.52),
);

export const FOOTBATH_WATERWHEEL_POS: Vec2 = {
  x: LANDMARKS.footStream.x + 5.75,
  z: footStreamCenterZ(LANDMARKS.footStream.x + 5.75) - 0.08,
};

export const FOOT_STREAM_STEPSTONES: readonly { x: number; z: number; r: number }[] = [
  { x: LANDMARKS.footStream.x - 3.6, z: footStreamCenterZ(LANDMARKS.footStream.x - 3.6) + 0.55, r: 0.55 },
  { x: LANDMARKS.footStream.x - 2.4, z: footStreamCenterZ(LANDMARKS.footStream.x - 2.4) - 0.35, r: 0.52 },
  { x: LANDMARKS.footStream.x - 1.2, z: footStreamCenterZ(LANDMARKS.footStream.x - 1.2) + 0.35, r: 0.58 },
  { x: LANDMARKS.footStream.x, z: footStreamCenterZ(LANDMARKS.footStream.x) - 0.15, r: 0.62 },
  { x: LANDMARKS.footStream.x + 1.2, z: footStreamCenterZ(LANDMARKS.footStream.x + 1.2) + 0.4, r: 0.54 },
  { x: LANDMARKS.footStream.x + 2.4, z: footStreamCenterZ(LANDMARKS.footStream.x + 2.4) - 0.35, r: 0.56 },
  { x: LANDMARKS.footStream.x + 3.6, z: footStreamCenterZ(LANDMARKS.footStream.x + 3.6) + 0.25, r: 0.52 },
];

export const SOLID_BOX_COLLIDERS: readonly BoxCollider[] = [
  // Milk vending machine body
  {
    minX: LANDMARKS.milkBooth.x + 0.4,
    maxX: LANDMARKS.milkBooth.x + 2.6,
    minZ: LANDMARKS.milkBooth.z - 2.8,
    maxZ: LANDMARKS.milkBooth.z - 0.8,
  },
  // Entrance bridge left & right timber railings
  {
    minX: -2.25,
    maxX: -1.85,
    minZ: LANDMARKS.entranceBridge.z - 3.8,
    maxZ: LANDMARKS.entranceBridge.z + 3.8,
  },
  {
    minX: 1.85,
    maxX: 2.25,
    minZ: LANDMARKS.entranceBridge.z - 3.8,
    maxZ: LANDMARKS.entranceBridge.z + 3.8,
  },
  // Myoyeongak back wall & left/right walls (open front facing +Z toward bath)
  {
    minX: -LANDMARKS.myoyeongak.halfW - 0.2,
    maxX: LANDMARKS.myoyeongak.halfW + 0.2,
    minZ: LANDMARKS.myoyeongak.minZ - 0.6,
    maxZ: LANDMARKS.myoyeongak.minZ + 0.6,
  },
  {
    minX: -LANDMARKS.myoyeongak.halfW - 0.2,
    maxX: -LANDMARKS.myoyeongak.halfW + 0.8,
    minZ: LANDMARKS.myoyeongak.minZ,
    maxZ: LANDMARKS.myoyeongak.maxZ + 0.6,
  },
  {
    minX: LANDMARKS.myoyeongak.halfW - 0.8,
    maxX: LANDMARKS.myoyeongak.halfW + 0.2,
    minZ: LANDMARKS.myoyeongak.minZ,
    maxZ: LANDMARKS.myoyeongak.maxZ + 0.6,
  },
  // Myoyeongak central sunken irori hearth
  {
    minX: LANDMARKS.myoyeongak.x - 1.05,
    maxX: LANDMARKS.myoyeongak.x + 1.05,
    minZ: LANDMARKS.myoyeongak.z - 1.45,
    maxZ: LANDMARKS.myoyeongak.z + 0.65,
  },
  // Shishi-odoshi stone basin
  {
    minX: LANDMARKS.bambooShishi.x + 0.6,
    maxX: LANDMARKS.bambooShishi.x + 2.4,
    minZ: LANDMARKS.bambooShishi.z - 2.4,
    maxZ: LANDMARKS.bambooShishi.z - 0.6,
  },
];

export const MYOYEONGAK_CUSHION_LOCAL_COORDS: readonly [number, number][] = [
  // 8 inner hearth-circle cushions
  [-2.4, -2.4],
  [0, -2.6],
  [2.4, -2.4],
  [-2.8, -0.4],
  [2.8, -0.4],
  [-2.4, 1.6],
  [0, 1.8],
  [2.4, 1.6],
  // 8 outer left/right tatami lounge cushions
  [-6.0, -3.6],
  [-6.0, -1.2],
  [-6.0, 1.2],
  [-6.0, 3.6],
  [6.0, -3.6],
  [6.0, -1.2],
  [6.0, 1.2],
  [6.0, 3.6],
];

export interface CushionSpot {
  id: number;
  localX: number;
  localZ: number;
  x: number;
  z: number;
  heading: number;
}

export const MYOYEONGAK_CUSHION_SPOTS: readonly CushionSpot[] =
  MYOYEONGAK_CUSHION_LOCAL_COORDS.map(([localX, localZ], id) => {
    const x = LANDMARKS.myoyeongak.x + localX;
    const z = LANDMARKS.myoyeongak.z + localZ;
    const hearthX = LANDMARKS.myoyeongak.x;
    const hearthZ = LANDMARKS.myoyeongak.z - 0.4;
    const heading = Math.atan2(hearthX - x, hearthZ - z);
    return { id, localX, localZ, x, z, heading };
  });

function findNearestEmptySpot<T extends Vec2>(
  spots: readonly T[],
  x: number,
  z: number,
  occupiedPositions: readonly Vec2[],
  occupyRadius = 0.75,
): T {
  let bestEmpty: T | null = null;
  let bestEmptyDist = Infinity;
  let bestAny = spots[0];
  let bestAnyDist = Infinity;

  for (const spot of spots) {
    const dPlayer = Math.hypot(spot.x - x, spot.z - z);
    if (dPlayer < bestAnyDist) {
      bestAnyDist = dPlayer;
      bestAny = spot;
    }

    const isOccupied = occupiedPositions.some(
      (occ) => Math.hypot(spot.x - occ.x, spot.z - occ.z) <= occupyRadius,
    );
    if (!isOccupied && dPlayer < bestEmptyDist) {
      bestEmptyDist = dPlayer;
      bestEmpty = spot;
    }
  }

  return bestEmpty ?? bestAny;
}

export function findNearestEmptyCushion(
  x: number,
  z: number,
  occupiedPositions: readonly Vec2[],
  occupyRadius = 0.75,
): CushionSpot {
  return findNearestEmptySpot(
    MYOYEONGAK_CUSHION_SPOTS,
    x,
    z,
    occupiedPositions,
    occupyRadius,
  );
}

export function findNearestEmptyFootbathSeat(
  x: number,
  z: number,
  occupiedPositions: readonly Vec2[],
  occupyRadius = 0.75,
): FootbathSeatSpot {
  return findNearestEmptySpot(
    FOOTBATH_SEAT_SPOTS,
    x,
    z,
    occupiedPositions,
    occupyRadius,
  );
}

export interface TeleportSpot {
  zoneId: WorldZoneId;
  label: string;
  x: number;
  z: number;
  heading: number;
  mode: 'idle' | 'soak' | 'loaf' | 'sitBench' | 'footSoak';
}

export const TELEPORT_SPOTS: readonly TeleportSpot[] = [
  {
    zoneId: 'entrance',
    label: '온천 입구 다리',
    x: LANDMARKS.entranceBridge.x,
    z: LANDMARKS.entranceBridge.z,
    heading: Math.PI,
    mode: 'idle',
  },
  {
    zoneId: 'main_bath',
    label: '노천 편백탕',
    x: 0,
    z: 5.0,
    heading: 0,
    mode: 'soak',
  },
  {
    zoneId: 'tatami_hall',
    label: '고양이 난로방',
    x: LANDMARKS.myoyeongak.x,
    z: LANDMARKS.myoyeongak.z + 1.5,
    heading: 0,
    mode: 'loaf',
  },
  {
    zoneId: 'yuzu_pond',
    label: '따뜻한 유자 연못',
    x: LANDMARKS.yuzuPond.x + 5.7,
    z: LANDMARKS.yuzuPond.z - 0.4,
    heading: -Math.PI / 2,
    mode: 'idle',
  },
  {
    zoneId: 'milk_booth',
    label: '우유 자판기 & 평상',
    x: LANDMARKS.milkBooth.x - 1.9,
    z: LANDMARKS.milkBooth.z + 0.8,
    heading: -0.75,
    mode: 'sitBench',
  },
  {
    zoneId: 'bamboo_shishi',
    label: '대나무 숲 물통',
    x: LANDMARKS.bambooShishi.x + 3.8,
    z: LANDMARKS.bambooShishi.z - 2.2,
    heading: -0.65,
    mode: 'idle',
  },
  {
    zoneId: 'firewood_yard',
    label: '아궁이 장작터',
    x: LANDMARKS.firewoodYard.x,
    z: LANDMARKS.firewoodYard.z + 3.8,
    heading: Math.PI,
    mode: 'idle',
  },
  {
    zoneId: 'foot_stream',
    label: '족욕 개울',
    x: FOOTBATH_SEAT_SPOTS[2].x,
    z: FOOTBATH_SEAT_SPOTS[2].z,
    heading: FOOTBATH_SEAT_SPOTS[2].heading,
    mode: 'footSoak',
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

function createSeededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const PATH_LANTERN_SPOTS: readonly [number, number][] = [
  [-2.1, 36.5],
  [2.1, 25.0],
  [-2.2, 16.5],
  [-2.0, -8.5],
  [2.0, -14.5],
  [-2.0, -21.5],
  [-12.2, 12.6],
  [12.2, 11.4],
  [-15.5, 34.4],
  [14.5, 30.6],
  [-10.4, -22.2],
  [-13.8, -31.5],
  [-14.2, -42.5],
];

export const BATH_LANTERN_SPOTS: readonly [number, number][] = [
  [-5.4, 8.2],
  [5.4, 8.2],
  [-6.6, -6.8],
  [6.6, -6.8],
];

export interface CedarTreeSpec {
  x: number;
  z: number;
  scale: number;
  trunkRadius: number;
  treeYaw: number;
  tiltX: number;
  tiltZ: number;
  hue: number;
  lightness: number;
  rockX: number;
  rockZ: number;
  rockScale: number;
  rockRotX: number;
  rockRotY: number;
  rockRotZ: number;
  rockRadius: number;
}

export interface BambooCulmSpec {
  lx: number;
  lz: number;
  x: number;
  z: number;
  radiusScale: number;
  heightScale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  leafRotY: number;
  leafScale: number;
  colliderRadius: number;
}

export interface FootStreamRockSpec {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  colliderRadius: number;
}

function createCedarTrees(): readonly CedarTreeSpec[] {
  const rand = createSeededRandom(91823);
  const trees: CedarTreeSpec[] = [];
  let attempts = 0;
  while (trees.length < 130 && attempts < 1500) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const rad = 26 + rand() * 48;
    const tx = Math.cos(angle) * rad;
    const tz = WORLD_CENTER_Z + Math.sin(angle) * rad;

    // Keep central corridor, connecting trails, creek & landmarks completely open
    if (distToWalkway(tx, tz) < 3.4) continue;
    if (Math.abs(tz - LANDMARKS.entranceBridge.z) < 4.5 && Math.abs(tx) < 58) continue;
    if (Math.hypot(tx - LANDMARKS.mainBath.x, tz - LANDMARKS.mainBath.z) < 15.5) continue;
    if (Math.hypot(tx - LANDMARKS.myoyeongak.x, tz - LANDMARKS.myoyeongak.z) < 15.5) continue;
    if (Math.hypot(tx - LANDMARKS.yuzuPond.x, tz - LANDMARKS.yuzuPond.z) < 9.5) continue;
    if (Math.hypot(tx - LANDMARKS.milkBooth.x, tz - LANDMARKS.milkBooth.z) < 9.5) continue;
    if (Math.hypot(tx - LANDMARKS.bambooShishi.x, tz - LANDMARKS.bambooShishi.z) < 11) continue;
    if (Math.hypot(tx - LANDMARKS.firewoodYard.x, tz - LANDMARKS.firewoodYard.z) < 10) continue;
    if (Math.hypot(tx - LANDMARKS.footStream.x, tz - LANDMARKS.footStream.z) < 10.5) continue;
    if (PATH_LANTERN_SPOTS.some(([lx, lz]) => Math.hypot(tx - lx, tz - lz) < 2.4)) continue;

    const scale = 0.85 + rand() * 0.45;
    const treeYaw = rand() * Math.PI * 2;
    const tiltX = (rand() - 0.5) * 0.055;
    const tiltZ = (rand() - 0.5) * 0.055;
    const rAng = treeYaw + 1.6;
    const rDist = (0.72 + rand() * 0.45) * scale;
    const rockX = tx + Math.cos(rAng) * rDist;
    const rockZ = tz + Math.sin(rAng) * rDist;
    const rockScale = (0.55 + rand() * 0.65) * scale;
    const rockRotX = rand() * 0.5;
    const rockRotY = rand() * Math.PI * 2;
    const rockRotZ = rand() * 0.5;
    const lightness = 0.17 + rand() * 0.08;
    const hue = 0.39 + (rand() - 0.5) * 0.045;

    trees.push({
      x: tx,
      z: tz,
      scale,
      trunkRadius: 0.52 * scale,
      treeYaw,
      tiltX,
      tiltZ,
      hue,
      lightness,
      rockX,
      rockZ,
      rockScale,
      rockRotX,
      rockRotY,
      rockRotZ,
      rockRadius: 0.45 * rockScale,
    });
  }
  return trees;
}

export const CEDAR_TREES: readonly CedarTreeSpec[] = createCedarTrees();

function createBambooCulms(): readonly BambooCulmSpec[] {
  const rand = createSeededRandom(55213);
  const culms: BambooCulmSpec[] = [];
  const bambooCount = 42;
  for (let i = 0; i < bambooCount; i++) {
    let bx = -2.8;
    let bz = 2.8;
    let placed = false;

    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = rand() * Math.PI * 2;
      const rad = 2.2 + rand() * 5.6;
      const candX = Math.cos(angle) * rad;
      const candZ = Math.sin(angle) * rad;
      const worldX = LANDMARKS.bambooShishi.x + candX;
      const worldZ = LANDMARKS.bambooShishi.z + candZ;

      const tooCloseToBasin = Math.hypot(candX - 1.5, candZ + 1.5) < 1.55;
      // Leave the SE arrival clearing & camera orbit corridor open around bambooShishi landmark
      const inCameraCorridor =
        Math.hypot(
          worldX - (LANDMARKS.bambooShishi.x + 2.8),
          worldZ - (LANDMARKS.bambooShishi.z - 0.5),
        ) < 4.5 ||
        (candX > 1.2 && candZ < 0.8);
      const onWalkway = distToWalkway(worldX, worldZ) < 1.2;

      if (!tooCloseToBasin && !inCameraCorridor && !onWalkway) {
        bx = candX;
        bz = candZ;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const fallbackAngle = Math.PI * 0.55 + (i / bambooCount) * Math.PI * 1.1;
      const fallbackRad = 3.2 + (i % 4) * 1.1;
      bx = Math.cos(fallbackAngle) * fallbackRad;
      bz = Math.sin(fallbackAngle) * fallbackRad;
    }

    const radiusScale = 0.85 + rand() * 0.3;
    const heightScale = 0.72 + rand() * 0.55;
    const rotX = (rand() - 0.5) * 0.1;
    const rotY = rand() * Math.PI;
    const rotZ = (rand() - 0.5) * 0.1;
    const leafRotY = rand() * Math.PI;
    const leafScale = 0.85 + rand() * 0.35;

    culms.push({
      lx: bx,
      lz: bz,
      x: LANDMARKS.bambooShishi.x + bx,
      z: LANDMARKS.bambooShishi.z + bz,
      radiusScale,
      heightScale,
      rotX,
      rotY,
      rotZ,
      leafRotY,
      leafScale,
      colliderRadius: 0.16 * radiusScale + 0.04,
    });
  }
  return culms;
}

export const BAMBOO_CULMS: readonly BambooCulmSpec[] = createBambooCulms();

function createFootStreamBorderRocks(): readonly FootStreamRockSpec[] {
  const rand = createSeededRandom(64109);
  const rocks: FootStreamRockSpec[] = [];
  const arrivalX = LANDMARKS.footStream.x - 1.6;
  const arrivalZ = LANDMARKS.footStream.z - 1.5;

  for (let i = 0; i < 16; i++) {
    const sx = LANDMARKS.footStream.x - 6.2 + (i / 15) * 13.0;
    const side = i % 2 === 0 ? 1 : -1;
    const sz = footStreamCenterZ(sx) + side * (1.75 + rand() * 0.35);
    const sxScale = 0.45 + rand() * 0.25;
    const syScale = 0.28 + rand() * 0.16;
    const szScale = 0.45 + rand() * 0.25;
    const rotY = rand() * Math.PI;

    // Keep decks, seats, waterwheel, landing zone & trail mouth unobstructed
    if (isOnFootbathDeck(sx, sz, 0.55)) continue;
    if (Math.hypot(sx - FOOTBATH_WATERWHEEL_POS.x, sz - FOOTBATH_WATERWHEEL_POS.z) < 1.55) {
      continue;
    }
    if (Math.hypot(sx - arrivalX, sz - arrivalZ) < 1.5) continue;
    if (distToWalkway(sx, sz) < 1.15) continue;

    rocks.push({
      x: sx,
      z: sz,
      sx: sxScale,
      sy: syScale,
      sz: szScale,
      rotY,
      colliderRadius: Math.max(sxScale, szScale) * 0.65,
    });
  }
  return rocks;
}

export const FOOT_STREAM_BORDER_ROCKS: readonly FootStreamRockSpec[] =
  createFootStreamBorderRocks();

function createYuzuPondRimRocks(): readonly YuzuPondRockSpec[] {
  const nextRand = createSeededRandom(73519);
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
  { x: LANDMARKS.yuzuPond.x + 4.0, z: LANDMARKS.yuzuPond.z + 2.6, radius: 0.85 },
  // Yuzu pond 18 rim rocks
  ...YUZU_POND_RIM_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.colliderRadius })),
  // Bridge lantern posts (4 corners)
  { x: -2.05, z: LANDMARKS.entranceBridge.z - 3.6, radius: 0.45 },
  { x: 2.05, z: LANDMARKS.entranceBridge.z - 3.6, radius: 0.45 },
  { x: -2.05, z: LANDMARKS.entranceBridge.z + 3.6, radius: 0.45 },
  { x: 2.05, z: LANDMARKS.entranceBridge.z + 3.6, radius: 0.45 },
  // Path guide lanterns along walkways
  ...PATH_LANTERN_SPOTS.map(([x, z]) => ({ x, z, radius: 0.26 })),
  // Main bath perimeter stone lanterns
  ...BATH_LANTERN_SPOTS.map(([lx, lz]) => ({
    x: LANDMARKS.mainBath.x + lx,
    z: LANDMARKS.mainBath.z + lz,
    radius: 0.28,
  })),
  // Firewood yard log rack (-2.2, 0), agungi furnace (+2.2, -0.4), & yard lantern (-2.6, 2.2)
  { x: LANDMARKS.firewoodYard.x - 2.2, z: LANDMARKS.firewoodYard.z, radius: 0.95 },
  { x: LANDMARKS.firewoodYard.x + 2.2, z: LANDMARKS.firewoodYard.z - 0.4, radius: 1.2 },
  { x: LANDMARKS.firewoodYard.x - 2.6, z: LANDMARKS.firewoodYard.z + 2.2, radius: 0.3 },
  // SE onsen egg dipping well (3.7, 11.7)
  { x: LANDMARKS.eggBasket.x, z: LANDMARKS.eggBasket.z, radius: 0.65 },
  // Outer hinoki bath decorative rim rocks
  ...BATH_RIM_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.colliderRadius })),
  // Bamboo grove 42 culms
  ...BAMBOO_CULMS.map((b) => ({ x: b.x, z: b.z, radius: b.colliderRadius })),
  // Eastern footbath stream border rocks, NW eave posts & 2-tier rock waterfall
  ...FOOT_STREAM_BORDER_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.colliderRadius })),
  ...FOOTBATH_EAVE_POST_SPOTS.map((p) => ({ x: p.x, z: p.z, radius: 0.22 })),
  { x: FOOTBATH_WATERWHEEL_POS.x, z: FOOTBATH_WATERWHEEL_POS.z, radius: 1.05 },
  { x: FOOTBATH_WATERWHEEL_POS.x + 1.45, z: FOOTBATH_WATERWHEEL_POS.z, radius: 1.35 },
  // 130 snowy cedar trunks & mossy base boulders
  ...CEDAR_TREES.map((t) => ({ x: t.x, z: t.z, radius: t.trunkRadius })),
  ...CEDAR_TREES.map((t) => ({ x: t.rockX, z: t.rockZ, radius: t.rockRadius })),
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function localHillockElevation(x: number, z: number, inStreamChannel: boolean): number {
  let bonus = 0;
  const bambooDist = Math.hypot(
    x - (LANDMARKS.bambooShishi.x - 1),
    z - (LANDMARKS.bambooShishi.z + 1),
  );
  if (bambooDist < 7.5) {
    bonus += 0.35 * (1 - smoothstep(2.0, 7.5, bambooDist));
  }
  if (!inStreamChannel) {
    const waterfallHillDist = Math.hypot(
      x - (FOOTBATH_WATERWHEEL_POS.x + 1.85),
      z - FOOTBATH_WATERWHEEL_POS.z,
    );
    if (waterfallHillDist < 4.0) {
      bonus += 0.68 * (1 - smoothstep(1.1, 4.0, waterfallHillDist));
    }
  }
  return bonus;
}

/**
 * Deterministic terrain + walkway + bath floor height at world (x, z).
 * Used both for displacing the terrain mesh and smoothly damping the cat's Y position.
 */
export function groundHeightAt(x: number, z: number): number {
  // 1. Entrance wooden bridge over creek
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

  // 3. Myoyeongak pavilion raised deck, tatami floor & raised zabuton cushions
  const pav = LANDMARKS.myoyeongak;
  if (Math.abs(x) <= pav.halfW && z >= pav.minZ && z <= pav.maxZ + 2.0) {
    if (z <= pav.maxZ) {
      for (const cushion of MYOYEONGAK_CUSHION_SPOTS) {
        if (Math.abs(x - cushion.x) <= 0.48 && Math.abs(z - cushion.z) <= 0.48) {
          return 0.5;
        }
      }
      return 0.44;
    }
    // Front wooden steps up to pavilion deck
    return 0.44 * smoothstep(pav.maxZ + 2.0, pav.maxZ, z);
  }

  // 4. Milk booth wooden platform bench (평상) & red cloth / stone patio
  if (
    x >= LANDMARKS.milkBooth.x - 2.4 &&
    x <= LANDMARKS.milkBooth.x - 0.7 &&
    z >= LANDMARKS.milkBooth.z - 0.1 &&
    z <= LANDMARKS.milkBooth.z + 1.7
  ) {
    return 0.345;
  }
  if (
    x >= LANDMARKS.milkBooth.x - 3.45 &&
    x <= LANDMARKS.milkBooth.x - 0.35 &&
    z >= LANDMARKS.milkBooth.z - 0.4 &&
    z <= LANDMARKS.milkBooth.z + 2.0
  ) {
    return 0.34;
  }
  if (
    x >= LANDMARKS.milkBooth.x - 3.4 &&
    x <= LANDMARKS.milkBooth.x + 3.4 &&
    z >= LANDMARKS.milkBooth.z - 2.7 &&
    z <= LANDMARKS.milkBooth.z + 2.7
  ) {
    return 0.08;
  }

  // 5. Yuzu wish pond basin
  const yuzuDist = Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z);
  if (yuzuDist < 3.6) {
    return -0.28 * (1 - smoothstep(2.4, 3.6, yuzuDist));
  }

  // 6. Creek bed passing beneath entrance bridge
  const creekCenterZ = LANDMARKS.entranceBridge.z + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.abs(z - creekCenterZ);
  let baseH = 0;
  if (creekDist < 3.4) {
    baseH -= 0.42 * (1 - smoothstep(1.2, 3.4, creekDist));
  }

  // 6b. Eastern footbath decks, side entry steps, stream bed & stepping stones
  if (isOnFootbathDeck(x, z)) {
    return FOOTBATH_DECK_HEIGHT;
  }
  if (isOnFootbathStep(x, z)) {
    return 0.1;
  }
  if (x >= LANDMARKS.footStream.x - 6.8 && x <= LANDMARKS.footStream.x + 8.6) {
    const fz = footStreamCenterZ(x);
    const fDist = Math.abs(z - fz);
    if (fDist < 2.25) {
      const endFade =
        smoothstep(LANDMARKS.footStream.x - 6.8, LANDMARKS.footStream.x - 5.2, x) *
        (1 - smoothstep(LANDMARKS.footStream.x + 6.8, LANDMARKS.footStream.x + 8.6, x));
      baseH = Math.min(baseH, -0.24 * (1 - smoothstep(1.15, 2.25, fDist)) * endFade);
    }
  }
  for (const stone of FOOT_STREAM_STEPSTONES) {
    if (Math.hypot(x - stone.x, z - stone.z) <= stone.r * 1.05) {
      return 0.06;
    }
  }

  // 7. Gentle snowdrifts & outer mountain slopes beyond playable radius
  const worldDist = Math.hypot(x, z - WORLD_CENTER_Z);
  const gentleRoll =
    Math.sin(x * 0.085) * Math.cos(z * 0.075) * 0.14 +
    Math.sin((x + z) * 0.045) * 0.08;

  // Keep central courtyard, firewood yard & connecting walkways flat and comfortable to walk
  const firewoodDist = Math.hypot(x - LANDMARKS.firewoodYard.x, z - LANDMARKS.firewoodYard.z);
  const flatMask =
    firewoodDist < 6.5 ? 0 : smoothstep(34, 70, worldDist);
  let h = baseH + gentleRoll * (0.25 + 0.75 * flatMask);
  h += localHillockElevation(x, z, baseH < -0.02);

  if (baseH >= -0.01 && worldDist <= PLAYABLE_RADIUS) {
    const walkDist = distToWalkway(x, z);
    if (walkDist <= 0) {
      return 0.02;
    }
    const walkFlatten = smoothstep(0.0, 1.2, walkDist);
    h = 0.02 + (h - 0.02) * walkFlatten;
  }

  // Outer snow mountain ring (73m -> 200m)
  if (worldDist > 73) {
    const rimT = smoothstep(73, 150, worldDist);
    const peakWave =
      0.65 +
      0.35 * Math.sin(Math.atan2(z - WORLD_CENTER_Z, x) * 5.0 + 0.8) +
      0.22 * Math.cos(Math.atan2(z - WORLD_CENTER_Z, x) * 9.0 - 0.4);
    const distantWave = smoothstep(105, 195, worldDist);
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

  const creekCenterZ = LANDMARKS.entranceBridge.z + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.abs(z - creekCenterZ);
  if (creekDist < 3.6) {
    h = Math.min(h, -0.45 * (1 - smoothstep(1.2, 3.6, creekDist)));
  }

  let inFootStreamChannel = false;
  if (x >= LANDMARKS.footStream.x - 6.8 && x <= LANDMARKS.footStream.x + 8.6) {
    const fz = footStreamCenterZ(x);
    const fDist = Math.abs(z - fz);
    if (fDist < 2.25) {
      inFootStreamChannel = true;
      const endFade =
        smoothstep(LANDMARKS.footStream.x - 6.8, LANDMARKS.footStream.x - 5.2, x) *
        (1 - smoothstep(LANDMARKS.footStream.x + 6.8, LANDMARKS.footStream.x + 8.6, x));
      h = Math.min(h, -0.25 * (1 - smoothstep(1.15, 2.25, fDist)) * endFade);
    }
  }

  const worldDist = Math.hypot(x, z - WORLD_CENTER_Z);
  const gentleRoll =
    Math.sin(x * 0.085) * Math.cos(z * 0.075) * 0.14 +
    Math.sin((x + z) * 0.045) * 0.08;
  const firewoodDist = Math.hypot(x - LANDMARKS.firewoodYard.x, z - LANDMARKS.firewoodYard.z);
  const flatMask =
    firewoodDist < 6.5 ? 0 : smoothstep(34, 70, worldDist);
  if (!inFootStreamChannel) {
    h += gentleRoll * (0.25 + 0.75 * flatMask);
  }
  h += localHillockElevation(x, z, inFootStreamChannel);

  if (h >= -0.01 && worldDist <= PLAYABLE_RADIUS) {
    const walkDist = distToWalkway(x, z);
    if (walkDist <= 0) {
      return 0.02;
    }
    const walkFlatten = smoothstep(0.0, 1.2, walkDist);
    h = 0.02 + (h - 0.02) * walkFlatten;
  }

  if (worldDist > 73) {
    const rimT = smoothstep(73, 150, worldDist);
    const peakWave =
      0.65 +
      0.35 * Math.sin(Math.atan2(z - WORLD_CENTER_Z, x) * 5.0 + 0.8) +
      0.22 * Math.cos(Math.atan2(z - WORLD_CENTER_Z, x) * 9.0 - 0.4);
    const distantWave = smoothstep(105, 195, worldDist);
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

  // 3. Circle colliders (2 passes to prevent wedging between adjacent stones/trees)
  for (let pass = 0; pass < 2; pass++) {
    for (const col of SOLID_CIRCLE_COLLIDERS) {
      const dx = rx - col.x;
      const dz = rz - col.z;
      const minDist = col.radius + playerRadius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 0.0001 ? dx / dist : 0;
        const nz = dist > 0.0001 ? dz / dist : 1;
        rx = col.x + nx * minDist;
        rz = col.z + nz * minDist;
      }
    }
  }

  // 4. Playable world boundary (64m from courtyard center)
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
  if (
    Math.abs(x) <= LANDMARKS.myoyeongak.halfW &&
    z >= LANDMARKS.myoyeongak.minZ &&
    z <= LANDMARKS.myoyeongak.maxZ + 1.0
  ) {
    return 'tatami_hall';
  }
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
  /** 모바일 손가락 드래그 감도 배율 — PC 마우스 대비 delta가 작아서 보정 */
  mobileSensitivityMultiplier: 25,
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
