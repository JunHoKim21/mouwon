import type { CatCoatId } from '../world/catCoats.ts';
import {
  clampWishMessage,
  type CatActionMode,
  type MilkDrinkId,
  type WishYuzuItem,
} from '../world/ritualMath.ts';

export const ROOM_MAX_PLAYERS = 16;
export const MAX_ROOM_YUZUS = 30;
export const WS_STATE_SEND_INTERVAL_MS = 100;
export const REMOTE_PEER_STALE_MS = 12_000;

export const VALID_COAT_IDS: readonly CatCoatId[] = [
  'cheese',
  'calico',
  'tuxedo',
  'mackerel',
  'black',
  'creamsicle',
] as const;

export const VALID_ACTION_MODES: readonly CatActionMode[] = [
  'idle',
  'walk',
  'greet',
  'groom',
  'knead',
  'loaf',
  'soak',
  'sitBench',
  'footSoak',
  'carrying',
] as const;

export const VALID_MILK_IDS: readonly MilkDrinkId[] = [
  'banana',
  'strawberry',
  'white',
  'matatabi',
] as const;

const COAT_SET = new Set<string>(VALID_COAT_IDS);
const ACTION_SET = new Set<string>(VALID_ACTION_MODES);
const MILK_SET = new Set<string>(VALID_MILK_IDS);

export type MultiplayerConnectionState = 'offline' | 'connecting' | 'connected';

export interface MultiplayerRoomStatus {
  state: MultiplayerConnectionState;
  roomId: string | null;
  roomNumber: number | null;
  peerCount: number;
  maxPeers: number;
  selfId: string | null;
}

export interface RemotePeerState {
  id: string;
  coatId: CatCoatId;
  x: number;
  y: number;
  z: number;
  heading: number;
  actionMode: CatActionMode;
  moveSpeed: number;
  hasHeadYuzu: boolean;
  carryingFirewood: boolean;
  heldMilkId?: MilkDrinkId | null;
}

export type ClientPlayerPayload = Omit<RemotePeerState, 'id'>;

export type ClientToServerMessage =
  | { type: 'hello'; state: ClientPlayerPayload }
  | { type: 'state'; state: ClientPlayerPayload }
  | { type: 'yuzu_add'; wish: WishYuzuItem }
  | { type: 'fire_stoke' }
  | { type: 'bamboo_ring' }
  | { type: 'milk_gift'; targetPeerId?: string }
  | { type: 'milk_offer'; targetPeerId: string; drinkId: MilkDrinkId }
  | { type: 'milk_respond'; toPeerId: string; drinkId: MilkDrinkId; accepted: boolean }
  | { type: 'milk_request'; targetPeerId: string; drinkId: MilkDrinkId }
  | { type: 'milk_request_decline'; toPeerId: string; drinkId: MilkDrinkId };

export type ServerToClientMessage =
  | {
      type: 'room_snapshot';
      selfId: string;
      roomId: string;
      roomNumber: number;
      maxPeers: number;
      peers: RemotePeerState[];
      wishes: WishYuzuItem[];
      fireCount: number;
    }
  | { type: 'peer_update'; peer: RemotePeerState }
  | { type: 'peer_leave'; peerId: string }
  | { type: 'yuzu_add'; wish: WishYuzuItem; fromPeerId: string }
  | { type: 'fire_stoke'; fromPeerId: string; fireCount: number }
  | { type: 'bamboo_ring'; fromPeerId: string }
  | { type: 'milk_gift'; fromPeerId: string; targetPeerId?: string }
  | {
      type: 'milk_offer';
      fromPeerId: string;
      fromCoatId: CatCoatId;
      targetPeerId: string;
      drinkId: MilkDrinkId;
    }
  | {
      type: 'milk_respond';
      fromPeerId: string;
      fromCoatId: CatCoatId;
      toPeerId: string;
      drinkId: MilkDrinkId;
      accepted: boolean;
    }
  | {
      type: 'milk_request';
      fromPeerId: string;
      fromCoatId: CatCoatId;
      targetPeerId: string;
      drinkId: MilkDrinkId;
    }
  | {
      type: 'milk_request_decline';
      fromPeerId: string;
      fromCoatId: CatCoatId;
      toPeerId: string;
      drinkId: MilkDrinkId;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampFinite(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeColorHex(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return '#f4be2b';
}

function normalizeMilkId(value: unknown): MilkDrinkId | null {
  return typeof value === 'string' && MILK_SET.has(value)
    ? (value as MilkDrinkId)
    : null;
}

function normalizeCoatId(value: unknown): CatCoatId {
  return typeof value === 'string' && COAT_SET.has(value)
    ? (value as CatCoatId)
    : 'cheese';
}

function sanitizePeerId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 64);
  return trimmed ? trimmed : null;
}

export function sanitizePeerPayload(raw: unknown): ClientPlayerPayload | null {
  if (!isRecord(raw)) return null;

  const coatId = normalizeCoatId(raw.coatId);

  const actionMode: CatActionMode =
    typeof raw.actionMode === 'string' && ACTION_SET.has(raw.actionMode)
      ? (raw.actionMode as CatActionMode)
      : 'idle';

  return {
    coatId,
    x: clampFinite(raw.x, -80, 80, 0),
    y: clampFinite(raw.y, -10, 30, 0),
    z: clampFinite(raw.z, -80, 80, 38),
    heading: clampFinite(raw.heading, -Math.PI * 4, Math.PI * 4, Math.PI),
    actionMode,
    moveSpeed: clampFinite(raw.moveSpeed, 0, 20, 0),
    hasHeadYuzu: Boolean(raw.hasHeadYuzu),
    carryingFirewood: Boolean(raw.carryingFirewood),
    heldMilkId: normalizeMilkId(raw.heldMilkId),
  };
}

export function sanitizeWishItem(
  raw: unknown,
  fallbackId?: string,
): WishYuzuItem | null {
  if (!isRecord(raw)) return null;

  const message = clampWishMessage(
    typeof raw.message === 'string' ? raw.message : '',
  );
  if (!message) return null;

  const rawId = typeof raw.id === 'string' ? raw.id.trim().slice(0, 48) : '';
  const id =
    rawId ||
    fallbackId ||
    `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    colorHex: normalizeColorHex(raw.colorHex),
    message,
    localX: clampFinite(raw.localX, -2.6, 2.6, 0),
    localZ: clampFinite(raw.localZ, -1.8, 1.8, 0),
    phase: clampFinite(raw.phase, 0, Math.PI * 2, 0),
  };
}

export function parseClientMessage(rawText: string): ClientToServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  switch (parsed.type) {
    case 'hello': {
      const state = sanitizePeerPayload(parsed.state);
      return state ? { type: 'hello', state } : null;
    }
    case 'state': {
      const state = sanitizePeerPayload(parsed.state);
      return state ? { type: 'state', state } : null;
    }
    case 'yuzu_add': {
      const wish = sanitizeWishItem(parsed.wish);
      return wish ? { type: 'yuzu_add', wish } : null;
    }
    case 'fire_stoke':
      return { type: 'fire_stoke' };
    case 'bamboo_ring':
      return { type: 'bamboo_ring' };
    case 'milk_gift': {
      const targetPeerId = sanitizePeerId(parsed.targetPeerId) ?? undefined;
      return { type: 'milk_gift', targetPeerId };
    }
    case 'milk_offer': {
      const targetPeerId = sanitizePeerId(parsed.targetPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return targetPeerId && drinkId
        ? { type: 'milk_offer', targetPeerId, drinkId }
        : null;
    }
    case 'milk_respond': {
      const toPeerId = sanitizePeerId(parsed.toPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return toPeerId && drinkId
        ? {
            type: 'milk_respond',
            toPeerId,
            drinkId,
            accepted: Boolean(parsed.accepted),
          }
        : null;
    }
    case 'milk_request': {
      const targetPeerId = sanitizePeerId(parsed.targetPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return targetPeerId && drinkId
        ? { type: 'milk_request', targetPeerId, drinkId }
        : null;
    }
    case 'milk_request_decline': {
      const toPeerId = sanitizePeerId(parsed.toPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return toPeerId && drinkId
        ? { type: 'milk_request_decline', toPeerId, drinkId }
        : null;
    }
    default:
      return null;
  }
}

export function parseServerMessage(rawText: string): ServerToClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  switch (parsed.type) {
    case 'room_snapshot': {
      if (
        typeof parsed.selfId !== 'string' ||
        typeof parsed.roomId !== 'string' ||
        typeof parsed.roomNumber !== 'number' ||
        typeof parsed.maxPeers !== 'number' ||
        !Array.isArray(parsed.peers) ||
        !Array.isArray(parsed.wishes)
      ) {
        return null;
      }
      const peers: RemotePeerState[] = [];
      for (const item of parsed.peers) {
        if (!isRecord(item) || typeof item.id !== 'string') continue;
        const payload = sanitizePeerPayload(item);
        if (payload) peers.push({ id: item.id, ...payload });
      }
      const wishes: WishYuzuItem[] = [];
      for (const item of parsed.wishes) {
        const wish = sanitizeWishItem(item);
        if (wish) wishes.push(wish);
      }
      return {
        type: 'room_snapshot',
        selfId: parsed.selfId,
        roomId: parsed.roomId,
        roomNumber: Math.max(1, Math.floor(parsed.roomNumber)),
        maxPeers: Math.max(1, Math.floor(parsed.maxPeers)),
        peers,
        wishes,
        fireCount:
          typeof parsed.fireCount === 'number' && Number.isFinite(parsed.fireCount)
            ? Math.max(0, Math.floor(parsed.fireCount))
            : 0,
      };
    }
    case 'peer_update': {
      if (!isRecord(parsed.peer) || typeof parsed.peer.id !== 'string') {
        return null;
      }
      const payload = sanitizePeerPayload(parsed.peer);
      return payload
        ? { type: 'peer_update', peer: { id: parsed.peer.id, ...payload } }
        : null;
    }
    case 'peer_leave': {
      if (typeof parsed.peerId !== 'string') return null;
      return { type: 'peer_leave', peerId: parsed.peerId };
    }
    case 'yuzu_add': {
      if (typeof parsed.fromPeerId !== 'string') return null;
      const wish = sanitizeWishItem(parsed.wish);
      return wish
        ? { type: 'yuzu_add', wish, fromPeerId: parsed.fromPeerId }
        : null;
    }
    case 'fire_stoke': {
      if (typeof parsed.fromPeerId !== 'string') return null;
      const fireCount =
        typeof parsed.fireCount === 'number' && Number.isFinite(parsed.fireCount)
          ? Math.max(0, Math.floor(parsed.fireCount))
          : 0;
      return { type: 'fire_stoke', fromPeerId: parsed.fromPeerId, fireCount };
    }
    case 'bamboo_ring': {
      if (typeof parsed.fromPeerId !== 'string') return null;
      return { type: 'bamboo_ring', fromPeerId: parsed.fromPeerId };
    }
    case 'milk_gift': {
      if (typeof parsed.fromPeerId !== 'string') return null;
      const targetPeerId =
        typeof parsed.targetPeerId === 'string' && parsed.targetPeerId.trim()
          ? parsed.targetPeerId
          : undefined;
      return {
        type: 'milk_gift',
        fromPeerId: parsed.fromPeerId,
        targetPeerId,
      };
    }
    case 'milk_offer': {
      const fromPeerId = sanitizePeerId(parsed.fromPeerId);
      const targetPeerId = sanitizePeerId(parsed.targetPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return fromPeerId && targetPeerId && drinkId
        ? {
            type: 'milk_offer',
            fromPeerId,
            fromCoatId: normalizeCoatId(parsed.fromCoatId),
            targetPeerId,
            drinkId,
          }
        : null;
    }
    case 'milk_respond': {
      const fromPeerId = sanitizePeerId(parsed.fromPeerId);
      const toPeerId = sanitizePeerId(parsed.toPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return fromPeerId && toPeerId && drinkId
        ? {
            type: 'milk_respond',
            fromPeerId,
            fromCoatId: normalizeCoatId(parsed.fromCoatId),
            toPeerId,
            drinkId,
            accepted: Boolean(parsed.accepted),
          }
        : null;
    }
    case 'milk_request': {
      const fromPeerId = sanitizePeerId(parsed.fromPeerId);
      const targetPeerId = sanitizePeerId(parsed.targetPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return fromPeerId && targetPeerId && drinkId
        ? {
            type: 'milk_request',
            fromPeerId,
            fromCoatId: normalizeCoatId(parsed.fromCoatId),
            targetPeerId,
            drinkId,
          }
        : null;
    }
    case 'milk_request_decline': {
      const fromPeerId = sanitizePeerId(parsed.fromPeerId);
      const toPeerId = sanitizePeerId(parsed.toPeerId);
      const drinkId = normalizeMilkId(parsed.drinkId);
      return fromPeerId && toPeerId && drinkId
        ? {
            type: 'milk_request_decline',
            fromPeerId,
            fromCoatId: normalizeCoatId(parsed.fromCoatId),
            toPeerId,
            drinkId,
          }
        : null;
    }
    default:
      return null;
  }
}
