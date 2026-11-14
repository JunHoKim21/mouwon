import { CatCoatId } from './catCoats';
import { CatActionMode } from './ritualMath';
import {
  FOOTBATH_SEAT_SPOTS,
  LANDMARKS,
  isInsideMainBath,
  isOnFootbathDeck,
  resolvePlayerCollisions,
} from './terrainMath';

export interface NpcCatSpec {
  id: string;
  name: string;
  coatId: CatCoatId;
  homeX: number;
  homeZ: number;
  homeHeading: number;
  homeAction: Extract<CatActionMode, 'soak' | 'loaf' | 'footSoak'>;
  hasTowel: boolean;
  hasYuzu: boolean;
  joinsTrain: boolean;
}

export interface NpcCatRuntimeState {
  spec: NpcCatSpec;
  x: number;
  y: number;
  z: number;
  heading: number;
  actionMode: CatActionMode;
  moveSpeed: number;
  /** 코인사 반응 잔여 시간 (초) */
  greetReactionTimer?: number;
  /** 코인사 반응 시 바라볼 플레이어 각도 */
  greetTargetHeading?: number;
}

export const TRAIN_FOLLOW_SPACING = 1.45;
export const TRAIN_MIN_SEPARATION = 0.95;
export const TRAIN_MOVE_SPEED = 2.45;
export const DEFAULT_MAX_TRAIN_FOLLOWERS = 2;

export interface StepNpcCatsOptions {
  /** Caps how many cats leave their spots to follow a single player to avoid visual clutter. */
  maxFollowers?: number;
}

/**
 * 7 distinct NPC cats placed with >= 1.8m spacing so none ever overlap:
 * - 4 soaking peacefully inside the central hinoki bath with towels/yuzus
 * - 3 loafing on Myoyeongak front tatami/deck & warm bath rim
 */
export const NPC_CAT_SPECS: readonly NpcCatSpec[] = [
  {
    id: 'npc-tux',
    name: '나비',
    coatId: 'tuxedo',
    homeX: -3.2,
    homeZ: 15.4,
    homeHeading: 0.35,
    homeAction: 'loaf',
    hasTowel: false,
    hasYuzu: false,
    joinsTrain: true,
  },
  {
    id: 'npc-dangam',
    name: '단감',
    coatId: 'cheese',
    homeX: 3.4,
    homeZ: 15.5,
    homeHeading: -0.45,
    homeAction: 'loaf',
    hasTowel: true,
    hasYuzu: false,
    joinsTrain: true,
  },
  {
    id: 'npc-mikan',
    name: '유자냥',
    coatId: 'cheese',
    homeX: -3.8,
    homeZ: 2.0,
    homeHeading: 0.95,
    homeAction: 'soak',
    hasTowel: true,
    hasYuzu: true,
    joinsTrain: true,
  },
  {
    id: 'npc-haru',
    name: '하루',
    coatId: 'calico',
    homeX: 3.7,
    homeZ: 2.3,
    homeHeading: -0.95,
    homeAction: 'soak',
    hasTowel: true,
    hasYuzu: false,
    joinsTrain: true,
  },
  {
    id: 'npc-cream',
    name: '크림이',
    coatId: 'creamsicle',
    homeX: LANDMARKS.myoyeongak.x + 2.4,
    homeZ: LANDMARKS.myoyeongak.z - 2.4,
    homeHeading: -0.78,
    homeAction: 'loaf',
    hasTowel: false,
    hasYuzu: false,
    joinsTrain: true,
  },
  {
    id: 'npc-kuro',
    name: '까망이',
    coatId: 'black',
    homeX: -3.2,
    homeZ: 6.1,
    homeHeading: 2.35,
    homeAction: 'soak',
    hasTowel: true,
    hasYuzu: true,
    joinsTrain: false,
  },
  {
    id: 'npc-saba',
    name: '고등어',
    coatId: 'mackerel',
    homeX: 3.9,
    homeZ: 5.9,
    homeHeading: -2.45,
    homeAction: 'soak',
    hasTowel: true,
    hasYuzu: false,
    joinsTrain: false,
  },
  {
    id: 'npc-milk',
    name: '우유냥',
    coatId: 'calico',
    homeX: LANDMARKS.milkBooth.x - 2.65,
    homeZ: LANDMARKS.milkBooth.z + 0.85,
    homeHeading: 0.45,
    homeAction: 'loaf',
    hasTowel: false,
    hasYuzu: false,
    joinsTrain: false,
  },
  {
    id: 'npc-footbath',
    name: '솔방울',
    coatId: 'mackerel',
    homeX: FOOTBATH_SEAT_SPOTS[4].x,
    homeZ: FOOTBATH_SEAT_SPOTS[4].z,
    homeHeading: FOOTBATH_SEAT_SPOTS[4].heading,
    homeAction: 'footSoak',
    hasTowel: true,
    hasYuzu: false,
    joinsTrain: false,
  },
] as const;

export function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function isInBathPoolBasin(x: number, z: number): boolean {
  const bx = x - LANDMARKS.mainBath.x;
  const bz = z - LANDMARKS.mainBath.z;
  const dist = Math.hypot(bx, bz);
  if (dist >= 7.2) return false;
  if (Math.abs(bx) <= 1.85 && Math.abs(bz) >= 4.8) return false;
  return true;
}

function getBathCircleTangentWaypoint(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  blockRadius: number,
  tangentRadius: number,
): { x: number; z: number } | null {
  const cx = LANDMARKS.mainBath.x;
  const cz = LANDMARKS.mainBath.z;
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return null;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / lenSq));
  const closestX = ax + t * dx;
  const closestZ = az + t * dz;
  const rx = closestX - cx;
  const rz = closestZ - cz;
  const dist = Math.hypot(rx, rz);
  // South/North stair mouths have no rim rocks for |rx| < 2.6, |rz| >= 10.2
  if (Math.abs(rx) < 2.6 && Math.abs(rz) >= 10.2) return null;
  if (dist >= blockRadius) return null;
  if (dist > 0.25) {
    return {
      x: cx + (rx / dist) * tangentRadius,
      z: cz + (rz / dist) * tangentRadius,
    };
  }
  const side = ax + bx - 2 * cx >= 0 ? 1 : -1;
  return { x: cx + side * tangentRadius, z: cz };
}

function getBathWaypointIfBlocked(
  fromX: number,
  fromZ: number,
  destX: number,
  destZ: number,
): { x: number; z: number } {
  const fromBx = fromX - LANDMARKS.mainBath.x;
  const fromBz = fromZ - LANDMARKS.mainBath.z;

  const destBx = destX - LANDMARKS.mainBath.x;
  const destBz = destZ - LANDMARKS.mainBath.z;

  const fromInPool = isInBathPoolBasin(fromX, fromZ);
  const destInPool = isInBathPoolBasin(destX, destZ);

  const fromOnStair = !fromInPool && Math.abs(fromBz) < 10.35 && Math.abs(fromBx) <= 1.95;
  const destOnStair = !destInPool && Math.abs(destBz) < 10.35 && Math.abs(destBx) <= 1.95;

  // Outside-to-outside: steer smoothly around bath & rock-belt perimeter along the radial tangent
  if (!fromInPool && !fromOnStair && !destInPool && !destOnStair) {
    if (isOnFootbathDeck(destX, destZ) && fromX < 25.0) {
      return { x: 25.8, z: 26.6 };
    }
    const tangent = getBathCircleTangentWaypoint(fromX, fromZ, destX, destZ, 10.85, 11.9);
    if (tangent) {
      return tangent;
    }
    return { x: destX, z: destZ };
  }
  if (fromInPool && destInPool) {
    return { x: destX, z: destZ };
  }

  // Exiting pool -> stair or courtyard
  if (fromInPool && !destInPool) {
    const useSouth = fromBz >= 0 || destBz >= 0;
    const insideAxisZ = useSouth ? 5.6 : 2.2;
    const outsideAxisZ = useSouth ? 15.0 : -7.0;
    if (Math.abs(fromBx) > 1.35) {
      return { x: LANDMARKS.mainBath.x, z: insideAxisZ };
    }
    if (destOnStair && ((useSouth && destBz >= 4.5) || (!useSouth && destBz <= -4.5))) {
      return { x: destX, z: destZ };
    }
    return { x: LANDMARKS.mainBath.x, z: outsideAxisZ };
  }

  // Leaving stair corridor -> courtyard
  if (fromOnStair && !destInPool && !destOnStair) {
    const useSouth = fromBz >= 0;
    return { x: LANDMARKS.mainBath.x, z: useSouth ? 15.0 : -7.0 };
  }

  // Entering courtyard -> stair corridor or bath pool: align to stair mouth first
  if (!fromInPool && (destInPool || destOnStair)) {
    const useSouth = fromBz >= 0;
    const insideAxisZ = useSouth ? 5.6 : 2.2;
    const outsideAxisZ = useSouth ? 15.0 : -7.0;
    if (!fromOnStair && Math.abs(fromBx) > 1.45) {
      return { x: LANDMARKS.mainBath.x, z: outsideAxisZ };
    }
    if (destInPool && (Math.abs(fromBx) > 1.75 || Math.abs(fromBz) > 4.6)) {
      return { x: LANDMARKS.mainBath.x, z: insideAxisZ };
    }
  }

  return { x: destX, z: destZ };
}

/**
 * Advances an NPC cat one step toward `(dx, dz)` while resolving collisions and
 * sliding tangentially around small obstacles when blocked head-on.
 */
function moveCatWithObstacleSlide(
  curX: number,
  curZ: number,
  dx: number,
  dz: number,
  len: number,
  step: number,
): { x: number; z: number } {
  const nx = dx / len;
  const nz = dz / len;
  const candX = curX + nx * step;
  const candZ = curZ + nz * step;
  const primary = resolvePlayerCollisions(candX, candZ);
  const forwardProgress = (primary.x - curX) * nx + (primary.z - curZ) * nz;
  if (forwardProgress >= step * 0.45) {
    return primary;
  }

  // Blocked radially by a tree/lantern/post: slide along tangent away from push normal
  const pushX = primary.x - candX;
  const pushZ = primary.z - candZ;
  const t1x = -nz;
  const t1z = nx;
  const preferFirst = pushX * t1x + pushZ * t1z >= 0;
  const prefX = preferFirst ? t1x : nz;
  const prefZ = preferFirst ? t1z : -nx;

  const tryTangent = (tx: number, tz: number) => {
    const angled = resolvePlayerCollisions(
      curX + (tx * 0.85 + nx * 0.52) * step,
      curZ + (tz * 0.85 + nz * 0.52) * step,
    );
    if (Math.hypot(angled.x - curX, angled.z - curZ) >= step * 0.35) {
      return angled;
    }
    return resolvePlayerCollisions(curX + tx * step, curZ + tz * step);
  };

  const prefRes = tryTangent(prefX, prefZ);
  const prefDist = Math.hypot(prefRes.x - curX, prefRes.z - curZ);
  if (prefDist >= step * 0.35) {
    return prefRes;
  }

  const altRes = tryTangent(-prefX, -prefZ);
  const altDist = Math.hypot(altRes.x - curX, altRes.z - curZ);
  const primaryDist = Math.hypot(primary.x - curX, primary.z - curZ);
  if (altDist > prefDist && altDist > primaryDist) {
    return altRes;
  }
  return prefDist > primaryDist ? prefRes : primary;
}

/**
 * Updates NPC cats either forming a single-file train behind the player (facing forward
 * via Math.atan2(dx, dz) and preserving spacing without backward walking) or returning
 * to their scenic bath/tatami spots when trainActive is off.
 */
export function stepNpcCats(
  cats: NpcCatRuntimeState[],
  player: { x: number; z: number; heading: number },
  trainActive: boolean,
  dt: number,
  heightAt: (x: number, z: number) => number,
  options: StepNpcCatsOptions = {},
  elapsed?: number,
): void {
  const safeDt = Math.min(Math.max(dt, 0.001), 0.08);
  const turnAlpha = 1 - Math.exp(-safeDt * 11);
  const yAlpha = 1 - Math.exp(-safeDt * 12);
  const maxFollowers = Math.max(0, options.maxFollowers ?? cats.length);

  let prevLeaderX = player.x;
  let prevLeaderZ = player.z;
  let prevLeaderHeading = player.heading;
  let activeFollowers = 0;

  let catIndex = -1;
  for (const cat of cats) {
    catIndex++;
    const canJoin = trainActive && cat.spec.joinsTrain && activeFollowers < maxFollowers;

    // 코인사(Nose greeting) 반응 중인 경우: 플레이어를 바라보며 코인사 모션 수행
    if ((cat.greetReactionTimer ?? 0) > 0) {
      cat.greetReactionTimer = Math.max(0, (cat.greetReactionTimer ?? 0) - safeDt);
      if (cat.greetTargetHeading !== undefined) {
        cat.heading += shortestAngleDelta(cat.heading, cat.greetTargetHeading) * turnAlpha;
      }
      cat.moveSpeed = 0;
      cat.actionMode = 'greet';

      if (canJoin) {
        activeFollowers += 1;
        prevLeaderX = cat.x;
        prevLeaderZ = cat.z;
        prevLeaderHeading = cat.heading;
      }
      continue;
    }

    if (canJoin) {
      activeFollowers += 1;
      const desiredX = prevLeaderX - Math.sin(prevLeaderHeading) * TRAIN_FOLLOW_SPACING;
      const desiredZ = prevLeaderZ - Math.cos(prevLeaderHeading) * TRAIN_FOLLOW_SPACING;

      const toLeaderX = prevLeaderX - cat.x;
      const toLeaderZ = prevLeaderZ - cat.z;
      const distToLeader = Math.hypot(toLeaderX, toLeaderZ);

      const waypoint = getBathWaypointIfBlocked(cat.x, cat.z, desiredX, desiredZ);
      const toWayX = waypoint.x - cat.x;
      const toWayZ = waypoint.z - cat.z;
      const distToWay = Math.hypot(toWayX, toWayZ);

      const usingStairDetour = waypoint.x !== desiredX || waypoint.z !== desiredZ;

      if (usingStairDetour && distToWay > 0.15) {
        const targetHeading = Math.atan2(toWayX, toWayZ);
        cat.heading += shortestAngleDelta(cat.heading, targetHeading) * turnAlpha;
        const speed = TRAIN_MOVE_SPEED * 1.15;
        const step = Math.min(distToWay, speed * safeDt);
        const resolved = moveCatWithObstacleSlide(cat.x, cat.z, toWayX, toWayZ, distToWay, step);
        cat.x = resolved.x;
        cat.z = resolved.z;
        cat.moveSpeed = speed;
        cat.actionMode = 'walk';
      } else if (distToLeader > TRAIN_FOLLOW_SPACING + 0.15 && distToWay > 0.18) {
        // Look at the cat directly ahead while walking forward
        const targetHeading = Math.atan2(toWayX, toWayZ);
        cat.heading += shortestAngleDelta(cat.heading, targetHeading) * turnAlpha;
        const speed = Math.min(TRAIN_MOVE_SPEED * 1.25, Math.max(1.0, distToWay * 2.4));
        const step = Math.min(distToWay, speed * safeDt);
        const resolved = moveCatWithObstacleSlide(cat.x, cat.z, toWayX, toWayZ, distToWay, step);
        cat.x = resolved.x;
        cat.z = resolved.z;
        cat.moveSpeed = speed;
        cat.actionMode = 'walk';
      } else {
        // In position: face the leader smoothly and wait peacefully
        if (distToLeader > 0.05) {
          const targetHeading = Math.atan2(toLeaderX, toLeaderZ);
          cat.heading += shortestAngleDelta(cat.heading, targetHeading) * turnAlpha;
        }
        cat.moveSpeed = 0;
        cat.actionMode = isInsideMainBath(cat.x, cat.z) ? 'soak' : 'idle';
      }

      prevLeaderX = cat.x;
      prevLeaderZ = cat.z;
      prevLeaderHeading = cat.heading;
    } else {
      const dxHome = cat.spec.homeX - cat.x;
      const dzHome = cat.spec.homeZ - cat.z;
      const distHome = Math.hypot(dxHome, dzHome);

      if (distHome > 0.18) {
        const waypoint = getBathWaypointIfBlocked(
          cat.x,
          cat.z,
          cat.spec.homeX,
          cat.spec.homeZ,
        );
        const wx = waypoint.x - cat.x;
        const wz = waypoint.z - cat.z;
        const wDist = Math.hypot(wx, wz);

        if (wDist > 0.05) {
          const targetHeading = Math.atan2(wx, wz);
          cat.heading += shortestAngleDelta(cat.heading, targetHeading) * turnAlpha;
          const speed = Math.min(TRAIN_MOVE_SPEED, Math.max(0.9, wDist * 2.2));
          const step = Math.min(wDist, speed * safeDt);
          const resolved = moveCatWithObstacleSlide(cat.x, cat.z, wx, wz, wDist, step);
          cat.x = resolved.x;
          cat.z = resolved.z;
          cat.moveSpeed = speed;
          cat.actionMode = 'walk';
        }
      } else {
        cat.x = cat.spec.homeX;
        cat.z = cat.spec.homeZ;
        cat.heading += shortestAngleDelta(cat.heading, cat.spec.homeHeading) * turnAlpha;
        cat.moveSpeed = 0;
        let homeAction: CatActionMode = cat.spec.homeAction;
        if (elapsed !== undefined && cat.spec.homeAction === 'soak') {
          const cycle = (elapsed + catIndex * 3.7) % 14.0;
          if (cycle >= 10.8 && cycle < 13.8) {
            homeAction = 'groom';
          }
        }
        cat.actionMode = homeAction;
      }
    }
  }

  // Pairwise anti-overlap separation among active train followers & player
  if (trainActive && maxFollowers > 0) {
    const trainCats = cats.filter((c) => c.spec.joinsTrain).slice(0, maxFollowers);
    for (let i = 0; i < trainCats.length; i++) {
      const a = trainCats[i];
      const pdx = a.x - player.x;
      const pdz = a.z - player.z;
      const pDist = Math.hypot(pdx, pdz);
      if (pDist > 0.001 && pDist < TRAIN_MIN_SEPARATION) {
        const push = (TRAIN_MIN_SEPARATION - pDist) * 0.65;
        const res = resolvePlayerCollisions(a.x + (pdx / pDist) * push, a.z + (pdz / pDist) * push);
        a.x = res.x;
        a.z = res.z;
      }

      for (let j = i + 1; j < trainCats.length; j++) {
        const b = trainCats[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001 && dist < TRAIN_MIN_SEPARATION) {
          const push = (TRAIN_MIN_SEPARATION - dist) * 0.55;
          const nx = dx / dist;
          const nz = dz / dist;
          const resB = resolvePlayerCollisions(b.x + nx * push, b.z + nz * push);
          b.x = resB.x;
          b.z = resB.z;
        }
      }
    }
  }

  for (const cat of cats) {
    const targetY = heightAt(cat.x, cat.z);
    cat.y += (targetY - cat.y) * yAlpha;
  }
}
