import {
  CEDAR_TREES,
  FOOTBATH_WATERWHEEL_POS,
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  distToWalkway,
  footStreamCenterZ,
  groundHeightAt,
  isOnBoardwalkWalkway,
  isOnFootbathDeck,
} from './terrainMath';

export type CatActionMode =
  | 'idle'
  | 'walk'
  | 'greet'
  | 'groom'
  | 'knead'
  | 'loaf'
  | 'soak'
  | 'sitBench'
  | 'footSoak'
  | 'carrying';

export type FootstepSurface = 'snow' | 'wood' | 'stone' | 'water';

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

export type MilkDrinkId = MilkDrinkOption['id'];

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

export function getMilkDrinkById(
  id: string | null | undefined,
): MilkDrinkOption | null {
  if (!id) return null;
  return MILK_DRINK_OPTIONS.find((d) => d.id === id) ?? null;
}

export function isNearMilkVending(
  x: number,
  z: number,
  maxDist = 8.5,
): boolean {
  return (
    Math.hypot(x - (LANDMARKS.milkBooth.x + 1.0), z - LANDMARKS.milkBooth.z) <=
    maxDist
  );
}

export const MILK_SOCIAL_MESSAGES = {
  offerPrompt: (senderName: string, drinkLabel: string) =>
    `${senderName}가 김이 모락모락 나는 ${drinkLabel}를 두 앞발로 내밀며 눈을 반짝이고 있어요. 받으실래요?`,
  acceptReceiverToast: (senderName: string, drinkLabel: string) =>
    `${senderName}에게서 받은 ${drinkLabel}를 꿀꺽! 온천처럼 따끈하다냥 🥛💕`,
  acceptSenderToast: (receiverName: string, drinkLabel: string) =>
    `${receiverName}가 ${drinkLabel} 선물을 기쁘게 받았어요! "고맙다냥! 온몸이 노곤해져~" ✨`,
  declineReplyText:
    '방금 온천수를 많이 마셔서 배가 볼록하다냥... 마음만 고맙게 받을게! 🐾',
  declineReceiverToast:
    '정중하게 마음만 받았어요. (배가 볼록하다냥~ 🐾)',
  declineSenderToast: (receiverName: string) =>
    `${receiverName}: "배가 부르다냥... 아껴 마실게, 마음만 고마워!" 🐾`,
  requestPrompt: (requesterName: string, drinkLabel: string) =>
    `${requesterName}가 우유 자판기 앞에서 두 앞발을 모으고 "${drinkLabel} 한 병만 사달라냥~ 🥺" 하며 애교 부리고 있어요!`,
  requestDeclineText:
    '어라... 주머니에 도토리만 들어있고 동전이 없다냥! 다음에 꼭 뽑아줄게~ 🌰🐾',
  requestDeclineSenderToast: (targetName: string) =>
    `${targetName}: "주머니에 도토리뿐이라 미안하다냥~ 다음에 꼭 뽑아줄게!" 🌰🐾`,
} as const;

export const ACTION_SPOTS = {
  bathSoakSpot: { x: 0, z: 5.0 },
  benchSitSpot: {
    x: LANDMARKS.milkBooth.x - 1.9,
    z: LANDMARKS.milkBooth.z + 0.8,
    heading: -0.75,
  },
  milkVendingSpot: {
    x: LANDMARKS.milkBooth.x + 0.85,
    z: LANDMARKS.milkBooth.z - 0.55,
    heading: -0.35,
  },
  benchBirdTarget: {
    x: LANDMARKS.milkBooth.x - 1.15,
    y: 0.46,
    z: LANDMARKS.milkBooth.z + 0.35,
  },
  benchBirdPerchHigh: {
    x: LANDMARKS.milkBooth.x + 2.2,
    y: 5.4,
    z: LANDMARKS.milkBooth.z - 3.5,
  },
  firewoodPickupSpot: {
    x: LANDMARKS.firewoodYard.x - 1.2,
    z: LANDMARKS.firewoodYard.z + 1.5,
    heading: -0.6,
  },
  firewoodFurnaceSpot: {
    x: LANDMARKS.firewoodYard.x + 1.6,
    z: LANDMARKS.firewoodYard.z + 1.5,
    heading: 0.45,
  },
  eggBasketSpot: {
    x: LANDMARKS.eggBasket.x - 0.1,
    z: LANDMARKS.eggBasket.z + 2.35,
    heading: 0.08,
  },
} as const;

export const KNEAD_LOOP_DURATION = 4.8;
export const GREET_DURATION = 1.9;
export const GROOM_DURATION = 3.2;
export const SOAK_YUZU_DELAY = 2.4;

/**
 * Computes distance-attenuated water volume [0..0.22] within 9m of hot springs,
 * entrance creek, or the eastern footbath stream.
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
  const creekCenterZ = LANDMARKS.entranceBridge.z + Math.sin(x * 0.11) * 1.4;
  const creekDist = Math.max(0, Math.abs(z - creekCenterZ) - 2.2);

  // Eastern footbath stream ribbon
  const clampedStreamX = Math.max(
    LANDMARKS.footStream.x - 5.8,
    Math.min(LANDMARKS.footStream.x + 5.8, x),
  );
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
 * Myoyeongak hearth room, or during cozy cat actions (knead/loaf/soak/groom).
 */
export interface SpatialNatureMix {
  cedarGain: number;
  bambooGain: number;
  waterwheelGain: number;
}

/**
 * Computes proximity-driven ambient gains [0..1] for the cedar forest canopy,
 * southwestern bamboo grove, and eastern footbath waterwheel.
 */
export function computeForestWindGain(x: number, z: number): SpatialNatureMix {
  let nearestCedarDist = Infinity;
  for (const tree of CEDAR_TREES) {
    const d = Math.hypot(x - tree.x, z - tree.z);
    if (d < nearestCedarDist) {
      nearestCedarDist = d;
    }
  }
  const cedarGain = Math.max(0, Math.min(1, 1 - Math.max(0, nearestCedarDist - 3.0) / 10.0));

  const bambooDist = Math.hypot(x - LANDMARKS.bambooShishi.x, z - LANDMARKS.bambooShishi.z);
  const bambooGain = Math.max(0, Math.min(1, 1 - Math.max(0, bambooDist - 2.5) / 11.5));

  const wheelDist = Math.hypot(x - FOOTBATH_WATERWHEEL_POS.x, z - FOOTBATH_WATERWHEEL_POS.z);
  const waterwheelGain = Math.max(0, Math.min(1, 1 - Math.max(0, wheelDist - 2.0) / 12.0));

  return { cedarGain, bambooGain, waterwheelGain };
}

/**
 * Computes distance-attenuated hearth fire crackling gain [0..1] near the
 * firewood yard furnace (within 12.5m, boosted by stokedCount 0..8) and the
 * Myoyeongak tatami hall central sunken hearth (within 9.5m).
 */
export function computeHearthFireGain(
  x: number,
  z: number,
  stokedCount = 0,
): number {
  const furnaceDist = Math.hypot(
    x - (LANDMARKS.firewoodYard.x + 2.2),
    z - (LANDMARKS.firewoodYard.z - 0.4),
  );
  const clampedStoke = Math.max(0, Math.min(8, stokedCount));
  const stokeBoost = 0.62 + (clampedStoke / 8) * 0.38;
  const furnaceGain =
    furnaceDist < 12.5 ? Math.pow(1 - furnaceDist / 12.5, 2) * stokeBoost : 0;

  const hallHearthDist = Math.hypot(
    x - LANDMARKS.myoyeongak.x,
    z - LANDMARKS.myoyeongak.z,
  );
  const hallHearthGain =
    hallHearthDist < 9.5
      ? 0.58 * Math.pow(1 - hallHearthDist / 9.5, 2)
      : 0;

  return Math.max(0, Math.min(1, Math.max(furnaceGain, hallHearthGain)));
}

/**
 * Computes collective purring sound intensity [0..1] near the open-air bath,
 * Myoyeongak hearth room, or during cozy cat actions (knead/loaf/soak/groom).
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
    actionMode === 'knead' ||
    actionMode === 'loaf' ||
    actionMode === 'soak' ||
    actionMode === 'groom'
      ? 0.45
      : actionMode === 'footSoak'
        ? 0.35
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

  // Myoyeongak deck & tatami
  const pav = LANDMARKS.myoyeongak;
  if (Math.abs(x) <= pav.halfW + 0.2 && z >= pav.minZ - 0.2 && z <= pav.maxZ + 2.0) {
    return 'wood';
  }

  // Milk booth wooden bench
  if (
    x >= LANDMARKS.milkBooth.x - 3.6 &&
    x <= LANDMARKS.milkBooth.x - 0.2 &&
    z >= LANDMARKS.milkBooth.z - 0.6 &&
    z <= LANDMARKS.milkBooth.z + 2.2
  ) {
    return 'wood';
  }

  // Eastern 2x6 hinoki footbath decks
  if (isOnFootbathDeck(x, z)) {
    return 'wood';
  }

  // Central wooden boardwalk walkways
  if (isOnBoardwalkWalkway(x, z, 0.15)) {
    return 'wood';
  }

  // Eastern footbath stepping stones (checked before stream water)
  for (const stone of FOOT_STREAM_STEPSTONES) {
    if (Math.hypot(x - stone.x, z - stone.z) <= stone.r * 1.05) {
      return 'stone';
    }
  }

  // Main bath stone rim & stairs
  if (bathDist <= 11.5 && Math.abs(x) <= 2.4 && Math.abs(z - 4) >= 5.2) {
    return 'stone';
  }
  if (bathDist <= 10.6) {
    return 'stone';
  }

  // Milk booth flagstone apron
  if (
    x >= LANDMARKS.milkBooth.x - 4.0 &&
    x <= LANDMARKS.milkBooth.x + 2.2 &&
    z >= LANDMARKS.milkBooth.z - 2.6 &&
    z <= LANDMARKS.milkBooth.z + 3.2
  ) {
    return 'stone';
  }

  // Outer forest stone trails (bamboo, footbath stream, firewood)
  if (distToWalkway(x, z) <= 0.15) {
    return 'stone';
  }

  const h = groundHeightAt(x, z);
  if (h < -0.09) return 'water';

  return 'snow';
}

export function clampWishMessage(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export type WishValidationFailureReason = 'empty' | 'blocked_url' | 'blocked_word';

export type WishValidationResult =
  | { ok: true; message: string }
  | { ok: false; reason: WishValidationFailureReason };

const WISH_URL_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /ftp:\/\//i,
  /\bwww\./i,
  /\b(?:t\.me|open\.kakao\.com|bit\.ly|tinyurl\.com|discord\.gg|linktr\.ee|naver\.me|forms\.gle)\b/i,
  /\bdiscord\.com\/invite\b/i,
  /[a-z0-9-]+\.(?:com|net|org|kr|co\.kr|io|me|gg|xyz|shop|site|info|biz|tv|cc|ly|link)(?:[/?#:\s]|$)/i,
];

const BLOCKED_KO_WORDS: readonly string[] = [
  '씨발',
  '시발',
  'ㅅㅂ',
  'ㅆㅂ',
  '병신',
  'ㅂㅅ',
  '지랄',
  'ㅈㄹ',
  '개새끼',
  '미친놈',
  '미친년',
  '존나',
  'ㅈㄴ',
  '창녀',
  '창놈',
  '느금마',
  '썅',
  '꺼져',
  '죽어라',
  '성인방송',
  '야동',
  '섹스',
  '바카라',
  '카지노',
  '먹튀',
  '조건만남',
  '출장안마',
  '오피방',
  '오피걸',
];

const BLOCKED_EN_WORD_PATTERN =
  /\b(?:fuck|fucking|shit|bitch|asshole|bastard|dick|cock|pussy|whore|slut|cunt|nigger|faggot|porn|xxx|casino|baccarat|gambling)\b/i;

function hasBlockedWishUrl(text: string): boolean {
  return WISH_URL_PATTERNS.some((pattern) => pattern.test(text));
}

function hasBlockedWishWord(text: string): boolean {
  if (BLOCKED_EN_WORD_PATTERN.test(text)) {
    return true;
  }
  const normalized = text.replace(/시발점/g, '');
  return BLOCKED_KO_WORDS.some((word) => normalized.includes(word));
}

export function containsBlockedWishContent(text: string): boolean {
  const cleaned = clampWishMessage(text);
  if (!cleaned) return false;
  return hasBlockedWishUrl(cleaned) || hasBlockedWishWord(cleaned);
}

export function validateWishMessage(raw: string): WishValidationResult {
  const message = clampWishMessage(raw);
  if (!message) {
    return { ok: false, reason: 'empty' };
  }
  if (hasBlockedWishUrl(message)) {
    return { ok: false, reason: 'blocked_url' };
  }
  if (hasBlockedWishWord(message)) {
    return { ok: false, reason: 'blocked_word' };
  }
  return { ok: true, message };
}

export type NearbyInteractKind =
  | 'firewood_pile'
  | 'firewood_furnace'
  | 'milk_vending'
  | 'yuzu_pond'
  | 'shishi_odoshi'
  | 'footbath_seat'
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
    x: LANDMARKS.milkBooth.x + 0.4,
    z: LANDMARKS.milkBooth.z - 0.5,
    maxDist: 6.0,
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
    kind: 'footbath_seat',
    x: LANDMARKS.footStream.x,
    z: LANDMARKS.footStream.z,
    maxDist: 7.4,
    label: '🦶 따뜻한 족욕 데크 앉기',
    hint: 'F 또는 클릭 · 온천 폭포 쉼터에 발 담그기',
    condition: (_carrying, actionMode) => actionMode !== 'footSoak',
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
