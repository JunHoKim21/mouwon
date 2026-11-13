import {
  LANDMARKS,
  PLAYABLE_RADIUS,
  Vec2,
  WORLD_CENTER_Z,
  isInsideMainBath,
  resolvePlayerCollisions,
} from './terrainMath';

const GRID_MIN_X = -45;
const GRID_MAX_X = 45;
const GRID_MIN_Z = -35;
const GRID_MAX_Z = 55;
const CELL_SIZE = 0.85;
const COLS = Math.floor((GRID_MAX_X - GRID_MIN_X) / CELL_SIZE) + 1;
const ROWS = Math.floor((GRID_MAX_Z - GRID_MIN_Z) / CELL_SIZE) + 1;

const NAV_PLAYER_RADIUS = 0.45;

const SOUTH_BATH_INNER: Vec2 = { x: 0, z: 5.6 };
const SOUTH_BATH_OUTER: Vec2 = { x: 0, z: 12.2 };
const NORTH_BATH_INNER: Vec2 = { x: 0, z: 2.2 };
const NORTH_BATH_OUTER: Vec2 = { x: 0, z: -7.6 };
const MYOYEONGAK_VERANDA: Vec2 = { x: 0, z: -6.6 };

export function isInsideMyoyeongak(x: number, z: number): boolean {
  return Math.abs(x) <= 5.4 && z >= -16.0 && z <= -6.8;
}

/**
 * Checks whether world (x, z) is blocked for navigation.
 * When allowBathWater is false (default courtyard navigation), the sunken bath basin
 * is treated as non-walkable so courtyard routes walk around the hinoki bath instead of wading through it.
 */
export function isNavPointBlocked(
  x: number,
  z: number,
  allowBathWater = false,
): boolean {
  if (Math.hypot(x, z - WORLD_CENTER_Z) > PLAYABLE_RADIUS - 0.1) {
    return true;
  }

  // Never walk across the yuzu wish pond water surface
  if (
    Math.hypot(x - LANDMARKS.yuzuPond.x, z - LANDMARKS.yuzuPond.z) < 3.65
  ) {
    return true;
  }

  if (!allowBathWater && isInsideMainBath(x, z)) {
    return true;
  }

  const resolved = resolvePlayerCollisions(x, z, NAV_PLAYER_RADIUS);
  return Math.hypot(resolved.x - x, resolved.z - z) > 0.005;
}

function hasLineOfSight(
  a: Vec2,
  b: Vec2,
  allowBathWater = false,
): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  if (dist < 0.05) return true;
  const steps = Math.max(2, Math.ceil(dist / 0.22));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    if (isNavPointBlocked(px, pz, allowBathWater)) {
      return false;
    }
  }
  return true;
}

function cellToWorld(col: number, row: number): Vec2 {
  return {
    x: GRID_MIN_X + col * CELL_SIZE,
    z: GRID_MIN_Z + row * CELL_SIZE,
  };
}

function worldToCell(x: number, z: number): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.round((x - GRID_MIN_X) / CELL_SIZE))),
    row: Math.max(0, Math.min(ROWS - 1, Math.round((z - GRID_MIN_Z) / CELL_SIZE))),
  };
}

let cachedCourtyardGrid: Uint8Array | null = null;

function getCourtyardBlockedGrid(): Uint8Array {
  if (cachedCourtyardGrid) return cachedCourtyardGrid;
  const grid = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    const z = GRID_MIN_Z + r * CELL_SIZE;
    for (let c = 0; c < COLS; c++) {
      const x = GRID_MIN_X + c * CELL_SIZE;
      if (isNavPointBlocked(x, z, false)) {
        grid[r * COLS + c] = 1;
      }
    }
  }
  cachedCourtyardGrid = grid;
  return grid;
}

function findNearestPassableCell(
  startCol: number,
  startRow: number,
  grid: Uint8Array,
): { col: number; row: number } | null {
  const startIdx = startRow * COLS + startCol;
  if (grid[startIdx] === 0) return { col: startCol, row: startRow };

  let bestCol = -1;
  let bestRow = -1;
  let bestDistSq = Infinity;

  for (let radius = 1; radius <= 10; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const c = startCol + dc;
        const r = startRow + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (grid[r * COLS + c] === 0) {
          const dSq = dc * dc + dr * dr;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestCol = c;
            bestRow = r;
          }
        }
      }
    }
    if (bestCol !== -1) {
      return { col: bestCol, row: bestRow };
    }
  }
  return null;
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function runAStarSegment(start: Vec2, goal: Vec2): Vec2[] {
  if (Math.hypot(goal.x - start.x, goal.z - start.z) < 0.15) {
    return [{ x: goal.x, z: goal.z }];
  }

  if (hasLineOfSight(start, goal, false)) {
    return [{ x: goal.x, z: goal.z }];
  }

  const grid = getCourtyardBlockedGrid();
  const rawStartCell = worldToCell(start.x, start.z);
  const rawGoalCell = worldToCell(goal.x, goal.z);

  const startCell = findNearestPassableCell(rawStartCell.col, rawStartCell.row, grid);
  const goalCell = findNearestPassableCell(rawGoalCell.col, rawGoalCell.row, grid);
  if (!startCell || !goalCell) {
    return [{ x: goal.x, z: goal.z }];
  }

  const totalCells = COLS * ROWS;
  const gScore = new Float32Array(totalCells);
  gScore.fill(Infinity);
  const fScore = new Float32Array(totalCells);
  fScore.fill(Infinity);
  const cameFrom = new Int32Array(totalCells);
  cameFrom.fill(-1);
  const closed = new Uint8Array(totalCells);

  const startIdx = startCell.row * COLS + startCell.col;
  const goalIdx = goalCell.row * COLS + goalCell.col;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(
    goalCell.col - startCell.col,
    goalCell.row - startCell.row,
  );

  // Binary min-heap keyed by fScore
  const heap: number[] = [startIdx];
  const pushHeap = (node: number) => {
    heap.push(node);
    let idx = heap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (fScore[heap[parent]] <= fScore[heap[idx]]) break;
      const tmp = heap[parent];
      heap[parent] = heap[idx];
      heap[idx] = tmp;
      idx = parent;
    }
  };
  const popHeap = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let idx = 0;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < heap.length && fScore[heap[left]] < fScore[heap[smallest]]) {
          smallest = left;
        }
        if (right < heap.length && fScore[heap[right]] < fScore[heap[smallest]]) {
          smallest = right;
        }
        if (smallest === idx) break;
        const tmp = heap[idx];
        heap[idx] = heap[smallest];
        heap[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  };

  let found = false;
  while (heap.length > 0) {
    const current = popHeap();
    if (current === goalIdx) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;

    const c = current % COLS;
    const r = Math.floor(current / COLS);
    const currG = gScore[current];

    for (const [dc, dr, stepCost] of NEIGHBORS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const nextIdx = nr * COLS + nc;
      if (closed[nextIdx] || grid[nextIdx] === 1) continue;

      // Prevent diagonal corner cutting across obstacles
      if (dc !== 0 && dr !== 0) {
        if (grid[r * COLS + nc] === 1 || grid[nr * COLS + c] === 1) {
          continue;
        }
      }

      const tentativeG = currG + stepCost;
      if (tentativeG < gScore[nextIdx]) {
        cameFrom[nextIdx] = current;
        gScore[nextIdx] = tentativeG;
        const h = Math.hypot(goalCell.col - nc, goalCell.row - nr);
        fScore[nextIdx] = tentativeG + h;
        pushHeap(nextIdx);
      }
    }
  }

  if (!found) {
    return [{ x: goal.x, z: goal.z }];
  }

  // Reconstruct cell centers + snap endpoints to exact start/goal
  const rawPath: Vec2[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    const tc = trace % COLS;
    const tr = Math.floor(trace / COLS);
    rawPath.push(cellToWorld(tc, tr));
    trace = cameFrom[trace];
  }
  rawPath.reverse();

  const fullPoints: Vec2[] = [start, ...rawPath, goal];
  const smoothed = smoothWaypoints(fullPoints, false);
  return smoothed.slice(1);
}

function smoothWaypoints(points: Vec2[], allowBathWater: boolean): Vec2[] {
  if (points.length <= 2) return [...points];
  const out: Vec2[] = [points[0]];
  let anchorIdx = 0;

  while (anchorIdx < points.length - 1) {
    let furthest = anchorIdx + 1;
    for (let j = points.length - 1; j > anchorIdx + 1; j--) {
      if (hasLineOfSight(points[anchorIdx], points[j], allowBathWater)) {
        furthest = j;
        break;
      }
    }
    out.push(points[furthest]);
    anchorIdx = furthest;
  }

  return out;
}

function appendUnique(queue: Vec2[], pt: Vec2): void {
  const prev = queue[queue.length - 1];
  if (!prev || Math.hypot(pt.x - prev.x, pt.z - prev.z) > 0.08) {
    queue.push({ x: pt.x, z: pt.z });
  }
}

/**
 * Computes an obstacle-avoiding waypoint path from `start` to `rawGoal`.
 * Enforces central hinoki bath stair entry/exit and Myoyeongak front veranda gates.
 */
export function findWorldPath(start: Vec2, rawGoal: Vec2): Vec2[] {
  const resolvedGoal = resolvePlayerCollisions(rawGoal.x, rawGoal.z, 0.42);
  let goal: Vec2 = { x: resolvedGoal.x, z: resolvedGoal.z };

  // If clicked inside yuzu pond water, snap goal outside toward start side
  const yuzuDx = goal.x - LANDMARKS.yuzuPond.x;
  const yuzuDz = goal.z - LANDMARKS.yuzuPond.z;
  const yuzuDist = Math.hypot(yuzuDx, yuzuDz);
  if (yuzuDist < 4.55) {
    const dirX = Math.abs(start.x - LANDMARKS.yuzuPond.x) + Math.abs(start.z - LANDMARKS.yuzuPond.z) > 0.01
      ? start.x - LANDMARKS.yuzuPond.x
      : 1;
    const dirZ = Math.abs(start.x - LANDMARKS.yuzuPond.x) + Math.abs(start.z - LANDMARKS.yuzuPond.z) > 0.01
      ? start.z - LANDMARKS.yuzuPond.z
      : 0;
    const len = Math.hypot(dirX, dirZ) || 1;
    const candidate = resolvePlayerCollisions(
      LANDMARKS.yuzuPond.x + (dirX / len) * 5.0,
      LANDMARKS.yuzuPond.z + (dirZ / len) * 5.0,
      0.42,
    );
    goal = { x: candidate.x, z: candidate.z };
  }

  const startInBath = isInsideMainBath(start.x, start.z);
  const goalInBath = isInsideMainBath(goal.x, goal.z);

  // Both inside main hinoki bath basin: direct walkable water path
  if (startInBath && goalInBath) {
    return [goal];
  }

  const waypoints: Vec2[] = [];
  let courtyardStart: Vec2 = start;
  let courtyardGoal: Vec2 = goal;
  const bathEntryPoints: Vec2[] = [];

  // 1. Exiting central bath through closest stair (North toward Myoyeongak/firewood, South toward courtyard)
  if (startInBath && !goalInBath) {
    const useNorth = goal.z < LANDMARKS.mainBath.z;
    const inner = useNorth ? NORTH_BATH_INNER : SOUTH_BATH_INNER;
    const outer = useNorth ? NORTH_BATH_OUTER : SOUTH_BATH_OUTER;
    appendUnique(waypoints, inner);
    appendUnique(waypoints, outer);
    courtyardStart = outer;
  }

  // 2. Entering central bath through closest stair to start
  if (!startInBath && goalInBath) {
    const distNorth = Math.hypot(
      start.x - NORTH_BATH_OUTER.x,
      start.z - NORTH_BATH_OUTER.z,
    );
    const distSouth = Math.hypot(
      start.x - SOUTH_BATH_OUTER.x,
      start.z - SOUTH_BATH_OUTER.z,
    );
    const useNorth = distNorth < distSouth;
    const outer = useNorth ? NORTH_BATH_OUTER : SOUTH_BATH_OUTER;
    const inner = useNorth ? NORTH_BATH_INNER : SOUTH_BATH_INNER;
    courtyardGoal = outer;
    bathEntryPoints.push(outer, inner, goal);
  }

  // 3. Plan courtyard path while respecting Myoyeongak front veranda gate
  const cStartInPav = isInsideMyoyeongak(courtyardStart.x, courtyardStart.z);
  const cGoalInPav = isInsideMyoyeongak(courtyardGoal.x, courtyardGoal.z);

  if (Math.hypot(courtyardGoal.x - courtyardStart.x, courtyardGoal.z - courtyardStart.z) >= 0.1) {
    if (cStartInPav && !cGoalInPav) {
      appendUnique(waypoints, MYOYEONGAK_VERANDA);
      for (const p of runAStarSegment(MYOYEONGAK_VERANDA, courtyardGoal)) {
        appendUnique(waypoints, p);
      }
    } else if (!cStartInPav && cGoalInPav) {
      for (const p of runAStarSegment(courtyardStart, MYOYEONGAK_VERANDA)) {
        appendUnique(waypoints, p);
      }
      appendUnique(waypoints, MYOYEONGAK_VERANDA);
      appendUnique(waypoints, courtyardGoal);
    } else {
      for (const p of runAStarSegment(courtyardStart, courtyardGoal)) {
        appendUnique(waypoints, p);
      }
    }
  }

  // 4. Append bath stair descent into final bath target if entering bath
  for (const p of bathEntryPoints) {
    appendUnique(waypoints, p);
  }

  if (waypoints.length === 0) {
    waypoints.push(goal);
  }

  return waypoints;
}
