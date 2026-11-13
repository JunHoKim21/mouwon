import {
  REMOTE_PEER_STALE_MS,
  type RemotePeerState,
} from '../shared/multiplayerProtocol.ts';
import type { CatCoatId } from './catCoats.ts';
import { shortestAngleDelta } from './npcTrainMath.ts';
import type { CatActionMode } from './ritualMath.ts';

export interface RemoteCatSimState {
  id: string;
  coatId: CatCoatId;
  x: number;
  y: number;
  z: number;
  heading: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetHeading: number;
  actionMode: CatActionMode;
  moveSpeed: number;
  hasHeadYuzu: boolean;
  carryingFirewood: boolean;
  actionTime: number;
  lastUpdatedAt: number;
}

export interface MilkRecipientCandidate {
  kind: 'npc' | 'remote';
  id: string;
  x: number;
  z: number;
  distSq: number;
}

export function createRemoteCatSimState(
  peer: RemotePeerState,
  now: number,
): RemoteCatSimState {
  return {
    id: peer.id,
    coatId: peer.coatId,
    x: peer.x,
    y: peer.y,
    z: peer.z,
    heading: peer.heading,
    targetX: peer.x,
    targetY: peer.y,
    targetZ: peer.z,
    targetHeading: peer.heading,
    actionMode: peer.actionMode,
    moveSpeed: peer.moveSpeed,
    hasHeadYuzu: peer.hasHeadYuzu,
    carryingFirewood: peer.carryingFirewood,
    actionTime: 0,
    lastUpdatedAt: now,
  };
}

export function applyRemotePeerUpdate(
  state: RemoteCatSimState,
  peer: RemotePeerState,
  now: number,
): { coatChanged: boolean } {
  const coatChanged = state.coatId !== peer.coatId;
  state.coatId = peer.coatId;
  state.targetX = peer.x;
  state.targetY = peer.y;
  state.targetZ = peer.z;
  state.targetHeading = peer.heading;

  // Snap immediately on huge teleports so cats don't glide through walls.
  const dx = peer.x - state.x;
  const dz = peer.z - state.z;
  if (dx * dx + dz * dz > 144) {
    state.x = peer.x;
    state.y = peer.y;
    state.z = peer.z;
    state.heading = peer.heading;
  }

  if (state.actionMode !== peer.actionMode) {
    state.actionMode = peer.actionMode;
    state.actionTime = 0;
  }
  state.moveSpeed = peer.moveSpeed;
  state.hasHeadYuzu = peer.hasHeadYuzu;
  state.carryingFirewood = peer.carryingFirewood;
  state.lastUpdatedAt = now;

  return { coatChanged };
}

export function stepRemoteCatSim(
  state: RemoteCatSimState,
  dt: number,
): number {
  const clampedDt = Math.max(0, Math.min(0.1, dt));
  const posAlpha = 1 - Math.exp(-12 * clampedDt);
  const rotAlpha = 1 - Math.exp(-14 * clampedDt);

  const prevX = state.x;
  const prevZ = state.z;

  state.x += (state.targetX - state.x) * posAlpha;
  state.y += (state.targetY - state.y) * posAlpha;
  state.z += (state.targetZ - state.z) * posAlpha;
  state.heading +=
    shortestAngleDelta(state.heading, state.targetHeading) * rotAlpha;
  state.actionTime += clampedDt;

  const moved = Math.hypot(state.x - prevX, state.z - prevZ);
  const renderedSpeed =
    clampedDt > 0.0001
      ? Math.max(state.moveSpeed * 0.7, moved / clampedDt)
      : state.moveSpeed;

  return Math.min(12, renderedSpeed);
}

export function collectStaleRemoteIds(
  states: Iterable<RemoteCatSimState>,
  now: number,
  maxStaleMs: number = REMOTE_PEER_STALE_MS,
): string[] {
  const stale: string[] = [];
  for (const state of states) {
    if (now - state.lastUpdatedAt > maxStaleMs) {
      stale.push(state.id);
    }
  }
  return stale;
}

export function findNearestMilkRecipient(
  playerX: number,
  playerZ: number,
  npcs: ReadonlyArray<{ id: string; x: number; z: number }>,
  remoteCats: ReadonlyArray<{ id: string; x: number; z: number }>,
  maxRange: number = 4.6,
): MilkRecipientCandidate | null {
  let best: MilkRecipientCandidate | null = null;
  let bestDistSq = maxRange * maxRange;

  const scan = (
    kind: 'npc' | 'remote',
    list: ReadonlyArray<{ id: string; x: number; z: number }>,
  ) => {
    for (const item of list) {
      const dx = item.x - playerX;
      const dz = item.z - playerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestDistSq) {
        bestDistSq = d2;
        best = {
          kind,
          id: item.id,
          x: item.x,
          z: item.z,
          distSq: d2,
        };
      }
    }
  };

  scan('remote', remoteCats);
  scan('npc', npcs);
  return best;
}
