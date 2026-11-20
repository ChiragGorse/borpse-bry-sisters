/**
 * Finding a way around trees, rocks, fences, buildings and water: a grid laid over a map's colliders,
 * searched with A*, and the result pulled taut so walkers don't zigzag from cell to cell. Used by Herb
 * on the Hog Hunt and by bot pigs. No THREE or DOM: runs in the browser and on the server alike.
 */
import { isOnLakeDock, type Collider } from '../layout';

const CELL = 1.25;
/** Room kept between a walker's centre and an obstacle. */
const CLEARANCE = 0.85;

export interface Pt {
  x: number;
  z: number;
}

class NavGrid {
  readonly n: number;
  private blocked: Uint8Array;

  constructor(
    private colliders: Collider[],
    readonly bound: number,
  ) {
    this.n = Math.ceil((bound * 2) / CELL);
    this.blocked = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const p = this.centre(i, j);
        this.blocked[j * this.n + i] = this.solid(p.x, p.z, CLEARANCE) ? 1 : 0;
      }
  }

  centre(i: number, j: number): Pt {
    return { x: -this.bound + (i + 0.5) * CELL, z: -this.bound + (j + 0.5) * CELL };
  }

  cellOf(x: number, z: number): [number, number] {
    const clampI = (v: number) => Math.max(0, Math.min(this.n - 1, v));
    return [clampI(Math.floor((x + this.bound) / CELL)), clampI(Math.floor((z + this.bound) / CELL))];
  }

  /** Whether a circle of radius `rad` at (x, z) overlaps a collider. */
  solid(x: number, z: number, rad: number): boolean {
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      // the pier over Trout Lake is walkable
      if (c.lakeWater && isOnLakeDock(x, z)) continue;
      if (c.kind === 'c') {
        const min = rad + c.r;
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < min * min) return true;
      } else {
        const px = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
        const pz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz < rad * rad) return true;
      }
    }
    return false;
  }

  isBlocked(i: number, j: number) {
    return this.blocked[j * this.n + i] === 1;
  }

  /** The nearest open cell to (i, j), searching outwards. */
  nearestOpen(i: number, j: number): [number, number] | null {
    if (!this.isBlocked(i, j)) return [i, j];
    for (let r = 1; r < 12; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && b >= 0 && a < this.n && b < this.n && !this.isBlocked(a, b)) return [a, b];
        }
    return null;
  }

  /** A straight walk from a to b stays clear of everything. */
  clearLine(a: Pt, b: Pt): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.solid(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, CLEARANCE * 0.9)) return false;
    }
    return true;
  }

  /** A* from a to b; the waypoints to walk (not including the start), or null if there's no way. */
  find(a: Pt, b: Pt): Pt[] | null {
    const n = this.n;
    const s0 = this.nearestOpen(...this.cellOf(a.x, a.z));
    const g0 = this.nearestOpen(...this.cellOf(b.x, b.z));
    if (!s0 || !g0) return null;
    const start = s0[1] * n + s0[0];
    const goal = g0[1] * n + g0[0];
    if (start === goal) return [b];
    const gScore = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    // a small binary heap of [f, cell]
    const heapF: number[] = [];
    const heapC: number[] = [];
    const push = (f: number, c: number) => {
      heapF.push(f);
      heapC.push(c);
      let k = heapF.length - 1;
      while (k > 0) {
        const up = (k - 1) >> 1;
        if (heapF[up] <= heapF[k]) break;
        [heapF[up], heapF[k]] = [heapF[k], heapF[up]];
        [heapC[up], heapC[k]] = [heapC[k], heapC[up]];
        k = up;
      }
    };
    const pop = (): number => {
      const top = heapC[0];
      const lastF = heapF.pop()!;
      const lastC = heapC.pop()!;
      if (heapF.length) {
        heapF[0] = lastF;
        heapC[0] = lastC;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heapF.length && heapF[l] < heapF[m]) m = l;
          if (r < heapF.length && heapF[r] < heapF[m]) m = r;
          if (m === k) break;
          [heapF[m], heapF[k]] = [heapF[k], heapF[m]];
          [heapC[m], heapC[k]] = [heapC[k], heapC[m]];
          k = m;
        }
      }
      return top;
    };
    const gi = g0[0];
    const gj = g0[1];
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[start] = 0;
    push(h(s0[0], s0[1]), start);
    let found = false;
    let expanded = 0;
    while (heapF.length && expanded < 40000) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) {
        found = true;
        break;
      }
      closed[cur] = 1;
      expanded++;
      const ci = cur % n;
      const cj = (cur / n) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n || this.isBlocked(ni, nj)) continue;
          // no squeezing diagonally between two blocked cells
          if (di && dj && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue;
          const nc = nj * n + ni;
          if (closed[nc]) continue;
          const g = gScore[cur] + (di && dj ? 1.414 : 1);
          if (g < gScore[nc]) {
            gScore[nc] = g;
            came[nc] = cur;
            push(g + h(ni, nj), nc);
          }
        }
    }
    if (!found) return null;
    const cells: Pt[] = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) cells.push(this.centre(c % n, (c / n) | 0));
    cells.reverse();
    // pull the path taut: skip every waypoint we can see past
    const out: Pt[] = [];
    let from = a;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let t = cells.length - 1; t > k; t--)
        if (this.clearLine(from, cells[t])) {
          far = t;
          break;
        }
      out.push(cells[far]);
      from = cells[far];
      k = far + 1;
    }
    if (!this.solid(b.x, b.z, CLEARANCE * 0.5)) out.push(b);
    return out;
  }
}

const grids = new WeakMap<Collider[], NavGrid>();

/**
 * A walkable route from a to b around the given colliders (inside ±bound), or null if none is found.
 * Grids are built once per collider list and reused.
 */
export function findPath(colliders: Collider[], bound: number, a: Pt, b: Pt): Pt[] | null {
  let g = grids.get(colliders);
  if (!g || g.bound !== bound) {
    g = new NavGrid(colliders, bound);
    grids.set(colliders, g);
  }
  // nothing in the way: just go
  if (g.clearLine(a, b)) return [b];
  return g.find(a, b);
}

/**
 * Something that walks along found paths, re-planning when its goal moves or it stops making progress.
 * Keep one per walker.
 */
export class PathFollower {
  private path: Pt[] = [];
  private goal: Pt | null = null;
  private replanT = 0;
  private stuckT = 0;
  private lastX = 0;
  private lastZ = 0;
  /** True when the last plan found no route (the caller may want to give up on this goal). */
  failed = false;

  /** The point to head for right now on the way to (gx, gz). */
  next(colliders: Collider[], bound: number, x: number, z: number, gx: number, gz: number, dt: number): Pt {
    this.replanT -= dt;
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    this.stuckT = moved < 0.6 * dt ? this.stuckT + dt : Math.max(0, this.stuckT - dt * 2);
    this.lastX = x;
    this.lastZ = z;
    const goalMoved = !this.goal || Math.hypot(this.goal.x - gx, this.goal.z - gz) > 2.5;
    if (goalMoved || this.replanT <= 0 || this.stuckT > 0.8 || !this.path.length) {
      const p = findPath(colliders, bound, { x, z }, { x: gx, z: gz });
      this.failed = !p;
      this.path = p ?? [{ x: gx, z: gz }];
      this.goal = { x: gx, z: gz };
      this.replanT = 2.5;
      if (this.stuckT > 0.8) this.stuckT = 0;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - x, this.path[0].z - z) < 1.1) this.path.shift();
    return this.path[0];
  }

  /** Seconds the walker has been trying to move without getting anywhere. */
  get stuck() {
    return this.stuckT;
  }

  reset() {
    this.path = [];
    this.goal = null;
  }
}
