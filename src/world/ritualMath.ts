import {
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  footStreamCenterZ,
  groundHeightAt,
} from './terrainMath';

export type CatActionMode =
  | 'idle'
  | 'walk'
  | 'greet'
  | 'knead'
  | 'loaf'
  | 'soak'
  | 'sitBench'
  | 'carrying';

export type FootstepSurface = 'snow' | 'wood' | 'water';

export interface WishYuzuColor {
  id: string;
  label: string;
  hex: string;
}

export interface WishYuzuItem {
  id: string;
  colorHex: string;
  message: string;
  localX: number;
  localZ: number;
  phase: number;
}

export const YUZU_WISH_COLORS: readonly WishYuzuColor[] = [
  { id: 'gold', label: '황금 유자', hex: '#f4be2b' },
  { id: 'honey', label: '꿀 유자', hex: '#f28b30' },
  { id: 'green', label: '청유자', hex: '#94c456' },
  { id: 'coral', label: '홍유자', hex: '#ea7259' },
  { id: 'ivory', label: '백유자', hex: '#f5e8bc' },
] as const;

export const INITIAL_WISH_YUZUS: readonly WishYuzuItem[] = [
  {
    id: 'seed-1',
    colorHex: '#f4be2b',
    message: '오늘도 수고한 당신에게 따뜻한 쉼과 평안이 있기를',
    localX: -1.1,
    localZ: 0.7,
    phase: 0.4,
  },
  {
    id: 'seed-2',
    colorHex: '#94c456',
    message: '작은 일에도 감사하며 포근한 하루 보내세요',
    localX: 1.35,
    localZ: -0.6,
    phase: 2.1,
  },
  {
    id: 'seed-3',
    colorHex: '#f28b30',
    message: '함께 쉬어가는 모든 이웃에게 따뜻한 온기를 나눠요',
    localX: 0.25,
    localZ: 1.45,
    phase: 4.0,
  },
];

// Pentatonic C major scale (C5, D5, E5, G5, A5) — never dissonant on any key sequence
export const PENTATONIC_BAMBOO_NOTES = [
  { key: '1', label: '도', freq: 523.25 },
  { key: '2', label: '레', freq: 587.33 },
  { key: '3', label: '미', freq: 659.25 },
  { key: '4', label: '솔', freq: 783.99 },
  { key: '5', label: '라', freq: 880.0 },
] as const;

export const YARN_MAX_COUNT = 100;
export const MILK_VENDING_UNLOCK_KNEADS = 25;

export interface MilkDrinkOption {
  id: 'banana' | 'strawberry' | 'white' | 'matatabi';
  label: string;
  desc: string;
  bottleColor: string;
  capColor: string;
}

export const MILK_DRINK_OPTIONS: readonly MilkDrinkOption[] = [
  {
    id: 'banana',
    label: '바나나우유',
    desc: '달콤하고 노란 온천 목욕 뒤 대표 병우유',
    bottleColor: '#f7df7c',
    capColor: '#d9842b',
  },
  {
    id: 'strawberry',
    label: '딸기우유',
    desc: '포근한 분홍빛 과일향 따뜻한 병우유',
    bottleColor: '#f4a8ba',
    capColor: '#c95972',
  },
  {
    id: 'white',
    label: '흰우유',
    desc: '김이 모락모락 나는 고소한 목장 흰우유',
    bottleColor: '#faf8f2',
    capColor: '#5c7c9e',
  },
  {
    id: 'matatabi',
    label: '녹차우유',
    desc: '은은하고 달콤쌉싸름한 따뜻한 녹차 병우유',
    bottleColor: '#a8cf97',
    capColor: '#4c753d',
  },
] as const;

export const ACTION_SPOTS = {
  bathSoakSpot: { x: 0, z: 5.0 },
  benchSitSpot: { x: 14.1, z: 8.8, heading: -0.75 },
  benchBirdTarget: { x: 14.85, y: 0.46, z: 8.35 },
  benchBirdPerchHigh: { x: 18.2, y: 5.4, z: 4.5 },
  firewoodPickupSpot: { x: -4.2, z: -26.5, heading: -0.6 },
  firewoodFurnaceSpot: { x: -1.4, z: -26.5, heading: 0.45 },
  eggBasketSpot: { x: 3.6, z: 14.05, heading: 0.08 },
} as const;

export const KNEAD_LOOP_DURATION = 4.8;
export const GREET_DURATION = 1.9;
export const SOAK_YUZU_DELAY = 2.4;

/**
 * Computes distance-attenuated water volume [0..0.22] within 9m of hot springs,
 * entrance creek, or the eastern footbath stream at (22, 28).
 */
export function computeWaterGain(x: number, z: number): number {
  const bathEdgeDist = Math.max(
    0,
    Math.hypot(x - LANDMARKS.mainBath.x, z - LANDMARKS.mainBath.z) - 7.6,
  );
  const yuzuEdgeDist = Math.max(
    0,
    Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z) - 3.6,
  );
  const creekCenterZ = 38 + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.max(0, Math.abs(z - creekCenterZ) - 2.2);

  // Eastern footbath stream ribbon x in [16.2, 27.8]
  const clampedStreamX = Math.max(16.2, Math.min(27.8, x));
  const streamZ = footStreamCenterZ(clampedStreamX);
  const footStreamDist = Math.max(
    0,
    Math.hypot(x - clampedStreamX, z - streamZ) - 1.5,
  );

  const minDist = Math.min(bathEdgeDist, yuzuEdgeDist, creekDist, footStreamDist);
  if (minDist >= 9.0) return 0;
  const ratio = 1 - minDist / 9.0;
  return 0.22 * ratio * ratio;
}

/**
 * Computes collective purring sound intensity [0..1] near the open-air bath,
 * Myoyeongak hearth room, or during cozy cat actions (knead/loaf/soak).
 */
export function computePurrProximity(
  x: number,
  z: number,
  actionMode: CatActionMode,
): number {
  const bathDist = Math.hypot(x - LANDMARKS.mainBath.x, z - LANDMARKS.mainBath.z);
  const bathFactor = Math.max(0, 1 - Math.max(0, bathDist - 5.5) / 11.0);

  const hallDist = Math.hypot(x - LANDMARKS.myoyeongak.x, z - LANDMARKS.myoyeongak.z);
  const hallFactor = Math.max(0, 1 - Math.max(0, hallDist - 3.5) / 9.5);

  const actionBoost =
    actionMode === 'knead' || actionMode === 'loaf' || actionMode === 'soak'
      ? 0.45
      : actionMode === 'sitBench'
        ? 0.25
        : 0;

  return Math.min(1, Math.max(bathFactor * 0.85, hallFactor * 0.8, actionBoost));
}

/**
 * Identifies the surface material beneath the cat for footstep audio synthesis.
 */
export function detectFootstepSurface(x: number, z: number): FootstepSurface {
  const bathDist = Math.hypot(x - LANDMARKS.mainBath.x, z - LANDMARKS.mainBath.z);
  if (bathDist < 7.55) return 'water';

  const yuzuDist = Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z);
  if (yuzuDist < 3.4) return 'water';

  // Bridge deck
  const bridge = LANDMARKS.entranceBridge;
  if (Math.abs(x) <= bridge.halfW && Math.abs(z - bridge.z) <= bridge.halfL) {
    return 'wood';
  }

  // Bath stairs & rim
  if (bathDist <= 11.5 && Math.abs(x) <= 2.4 && Math.abs(z - 4) >= 5.2) {
    return 'wood';
  }

  // Myoyeongak deck & tatami
  if (Math.abs(x) <= 6.4 && z >= -16.6 && z <= -4.4) {
    return 'wood';
  }

  // Milk booth wooden bench
  if (x >= 12.4 && x <= 15.8 && z >= 7.4 && z <= 10.2) {
    return 'wood';
  }

  // Eastern footbath stepping stones
  for (const stone of FOOT_STREAM_STEPSTONES) {
    if (Math.hypot(x - stone.x, z - stone.z) <= stone.r * 1.05) {
      return 'wood';
    }
  }

  const h = groundHeightAt(x, z);
  if (h < -0.09) return 'water';

  return 'snow';
}

export function clampWishMessage(raw: string): string {
  return raw.trim().slice(0, 40);
}

export type NearbyInteractKind =
  | 'firewood_pile'
  | 'firewood_furnace'
  | 'milk_vending'
  | 'yuzu_pond'
  | 'shishi_odoshi'
  | 'egg_basket';

export interface NearbyInteractPrompt {
  kind: NearbyInteractKind;
  label: string;
  hint: string;
}

interface InteractSpotDescriptor {
  kind: NearbyInteractKind;
  x: number;
  z: number;
  maxDist: number;
  label: string;
  hint: string;
  condition?: (carryingFirewood: boolean, actionMode: CatActionMode) => boolean;
}

const INTERACT_SPOT_DESCRIPTORS: readonly InteractSpotDescriptor[] = [
  {
    kind: 'firewood_furnace',
    x: LANDMARKS.firewoodYard.x + 2.2,
    z: LANDMARKS.firewoodYard.z - 0.4,
    maxDist: 5.4,
    label: '🔥 아궁이에 장작 넣기',
    hint: 'F 또는 클릭 · 온천 온도 +1°C',
    condition: (carryingFirewood) => carryingFirewood,
  },
  {
    kind: 'firewood_pile',
    x: LANDMARKS.firewoodYard.x - 2.2,
    z: LANDMARKS.firewoodYard.z,
    maxDist: 5.2,
    label: '🪵 장작 1개비 집기',
    hint: 'F 또는 클릭 · 옆 아궁이로 옮기기',
    condition: (carryingFirewood) => !carryingFirewood,
  },
  {
    kind: 'milk_vending',
    x: LANDMARKS.milkBooth.x + 1.5,
    z: LANDMARKS.milkBooth.z - 1.8,
    maxDist: 4.6,
    label: '🥛 우유 자판기 열기',
    hint: 'F 또는 클릭 · 꾹꾹이 병우유 뽑기',
  },
  {
    kind: 'shishi_odoshi',
    x: LANDMARKS.bambooShishi.x + 1.5,
    z: LANDMARKS.bambooShishi.z - 1.5,
    maxDist: 4.2,
    label: '🎋 대나무 물통 울리기',
    hint: 'F 또는 클릭 · 맑은 대나무 물소리',
  },
  {
    kind: 'yuzu_pond',
    x: LANDMARKS.yuzuPond.x,
    z: LANDMARKS.yuzuPond.z,
    maxDist: 6.5,
    label: '🍊 감사·응원 유자 띄우기',
    hint: 'F 또는 클릭 · 따뜻한 쪽지 띄우기',
  },
  {
    kind: 'egg_basket',
    x: LANDMARKS.eggBasket.x,
    z: LANDMARKS.eggBasket.z,
    maxDist: 3.6,
    label: '🥚 온천 달걀 삶기',
    hint: 'F 또는 클릭 · 온천수 반숙 체험',
    condition: (_carrying, actionMode) => actionMode !== 'soak',
  },
];

/**
 * Returns the closest eligible landmark interaction prompt when the cat stands
 * inside an interactive station's proximity radius, or null when in open space.
 */
export function findNearbyInteractPrompt(
  x: number,
  z: number,
  carryingFirewood: boolean,
  actionMode: CatActionMode,
): NearbyInteractPrompt | null {
  let best: InteractSpotDescriptor | null = null;
  let bestDist = Infinity;

  for (const spot of INTERACT_SPOT_DESCRIPTORS) {
    if (spot.condition && !spot.condition(carryingFirewood, actionMode)) {
      continue;
    }
    const dist = Math.hypot(x - spot.x, z - spot.z);
    if (dist <= spot.maxDist && dist < bestDist) {
      bestDist = dist;
      best = spot;
    }
  }

  return best ? { kind: best.kind, label: best.label, hint: best.hint } : null;
}
