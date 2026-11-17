import {
  AIR,
  BED,
  BLOCK_COLOR,
  CHEST,
  CHUNK,
  CHUNKS_X,
  CHUNKS_Z,
  DIRT,
  FARM,
  GEM,
  GRASS,
  LEAF,
  LOG,
  MAGMA,
  ORE,
  ROOM,
  STILL,
  STONE,
  SX,
  SY,
  SZ,
  TORCH,
  WALK,
  WALL,
  WATER,
  blocksLight,
  chunkIndex,
  diggable,
  goodStand,
  idx,
  inb,
  isCube,
  passable,
  solidFloor,
  unidx,
} from "./constants";

export type Anchors = {
  gate: [number, number, number];
  hall: [number, number, number];
  deep: [number, number, number];
  farms: [number, number, number][];
  stocks: [number, number, number][];
};

const FACES: { d: [number, number, number]; shade: number; c: [number, number, number][] }[] = [
  {
    d: [-1, 0, 0],
    shade: 0.72,
    c: [
      [0, 1, 0],
      [0, 0, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    d: [1, 0, 0],
    shade: 0.78,
    c: [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    d: [0, -1, 0],
    shade: 0.5,
    c: [
      [1, 0, 1],
      [0, 0, 1],
      [1, 0, 0],
      [0, 0, 0],
    ],
  },
  {
    d: [0, 1, 0],
    shade: 1,
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    d: [0, 0, -1],
    shade: 0.66,
    c: [
      [1, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    d: [0, 0, 1],
    shade: 0.84,
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
  },
];

function hash(x: number, z: number, seed: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise2(x: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const v00 = hash(x0, z0, seed);
  const v10 = hash(x0 + 1, z0, seed);
  const v01 = hash(x0, z0 + 1, seed);
  const v11 = hash(x0 + 1, z0 + 1, seed);
  return v00 + (v10 - v00) * sx + (v01 + (v11 - v01) * sx - (v00 + (v10 - v00) * sx)) * sz;
}

function set(grid: Uint8Array, x: number, y: number, z: number, t: number) {
  if (inb(x, y, z)) grid[idx(x, y, z)] = t;
}

function columnHeight(x: number, z: number, seed: number) {
  const n = noise2(x * 0.07, z * 0.07, seed) * 2 + noise2(x * 0.025, z * 0.025, seed + 3);
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2 + 6;
  const dx = (x - cx) / 36;
  const dz = (z - cz) / 42;
  const ridge = Math.max(0, 1 - (dx * dx + dz * dz));
  let h = 4 + Math.floor(ridge * 11 + (n - 1) * 2.2);
  if (x >= ROOM.x0 - 1 && x <= ROOM.x1 + 1 && z >= ROOM.z0 - 1 && z <= ROOM.z1 + 2) {
    h = Math.max(h, WALK + 6);
  }
  return Math.max(3, Math.min(SY - 3, h));
}

function fillColumn(grid: Uint8Array, x: number, z: number, seed: number) {
  const h = columnHeight(x, z, seed);
  for (let y = 0; y <= h; y++) {
    let t = STONE;
    if (y === h && h >= 6) t = GRASS;
    else if (y >= h - 2 && h >= 6) t = DIRT;
    if (t === STONE && y > 1 && y < h - 3 && hash(x, y + z * 17, seed + 11) > 0.82) t = ORE;
    if (t === STONE && y > 1 && y < 6 && hash(x + 40, y + z * 9, seed + 19) > 0.94) t = GEM;
    grid[idx(x, y, z)] = t;
  }
  for (let y = h + 1; y < SY; y++) grid[idx(x, y, z)] = AIR;
  if (hash(x, z, seed + 7) > 0.9 && h >= 7 && h < SY - 4) {
    const overFort = x >= ROOM.x0 - 1 && x <= ROOM.x1 + 1 && z >= ROOM.z0 - 8 && z <= ROOM.z1 + 1;
    if (!overFort) {
      set(grid, x, h + 1, z, LOG);
      set(grid, x, h + 2, z, LOG);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) set(grid, x + dx, h + 3, z + dz, LEAF);
      }
      set(grid, x, h + 4, z, LEAF);
    }
  }
}

export function fillChunk(grid: Uint8Array, cx: number, cz: number, seed: number) {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  for (let z = z0; z < z0 + CHUNK && z < SZ; z++) {
    for (let x = x0; x < x0 + CHUNK && x < SX; x++) fillColumn(grid, x, z, seed);
  }
  const pocket = noise2((x0 + 8) * 0.22, (z0 + 8) * 0.22, seed + 5);
  if (pocket > 0.72) {
    for (let z = z0 + 2; z < z0 + CHUNK - 2 && z < SZ - 1; z++) {
      for (let x = x0 + 2; x < x0 + CHUNK - 2 && x < SX - 1; x++) {
        if (noise2(x * 0.22, z * 0.22, seed + 5) < 0.66) continue;
        const inFort = x >= ROOM.x0 - 2 && x <= ROOM.x1 + 2 && z >= ROOM.z0 - 18 && z <= ROOM.z1 + 2;
        if (inFort) continue;
        for (let y = 2; y <= 4; y++) {
          if (grid[idx(x, y, z)] === GEM) continue;
          grid[idx(x, y, z)] = y === 2 && pocket > 0.84 ? WATER : AIR;
        }
      }
    }
  }
}

export function ensureChunks(grid: Uint8Array, ready: Uint8Array, seed: number, x: number, z: number, rad: number) {
  const ccx = Math.floor(x / CHUNK);
  const ccz = Math.floor(z / CHUNK);
  const born: number[] = [];
  for (let dz = -rad; dz <= rad; dz++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const cx = ccx + dx;
      const cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= CHUNKS_X || cz >= CHUNKS_Z) continue;
      const i = chunkIndex(cx, cz);
      if (ready[i]) continue;
      fillChunk(grid, cx, cz, seed);
      ready[i] = 1;
      born.push(i);
    }
  }
  return born;
}

export function markChunks(dirty: Set<number>, x: number, z: number) {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x2 = cx + dx;
      const z2 = cz + dz;
      if (x2 < 0 || z2 < 0 || x2 >= CHUNKS_X || z2 >= CHUNKS_Z) continue;
      dirty.add(chunkIndex(x2, z2));
    }
  }
}

function carveRoom(grid: Uint8Array) {
  for (let z = ROOM.z0; z <= ROOM.z1; z++) {
    for (let x = ROOM.x0; x <= ROOM.x1; x++) {
      set(grid, x, WALK - 1, z, STONE);
      for (let y = WALK; y <= WALK + 2; y++) set(grid, x, y, z, AIR);
      if (!blocksLight(grid[idx(x, WALK + 3, z)])) set(grid, x, WALK + 3, z, STONE);
    }
  }
}

function carveStairs(grid: Uint8Array): [number, number, number] {
  const xMid = ROOM.x0 + 5;
  let gate: [number, number, number] = [xMid, WALK, ROOM.z0];
  for (let i = 0; i <= 14; i++) {
    const z = ROOM.z0 - i;
    const floorY = WALK - 1 - Math.floor(i / 2);
    const walk = floorY + 1;
    for (let x = xMid - 2; x <= xMid + 1; x++) {
      set(grid, x, floorY, z, i > 10 ? DIRT : STONE);
      for (let y = walk; y <= walk + 2; y++) set(grid, x, y, z, AIR);
      if (yHeadroom(grid, x, walk, z)) set(grid, x, walk + 3, z, AIR);
    }
    gate = [xMid, walk, z];
  }
  for (let z = gate[2] - 1; z >= gate[2] - 3; z--) {
    for (let x = xMid - 3; x <= xMid + 2; x++) {
      const top = surfaceY(grid, x, z);
      if (top > 0) {
        set(grid, x, top, z, GRASS);
        for (let y = top + 1; y < SY; y++) {
          const t = grid[idx(x, y, z)];
          if (t === STONE || t === DIRT) set(grid, x, y, z, AIR);
        }
      }
    }
  }
  return gate;
}

function yHeadroom(grid: Uint8Array, x: number, walk: number, z: number) {
  return inb(x, walk + 3, z) && grid[idx(x, walk + 3, z)] !== AIR;
}

function surfaceY(grid: Uint8Array, x: number, z: number) {
  for (let y = SY - 1; y >= 0; y--) {
    if (isCube(grid[idx(x, y, z)]) && grid[idx(x, y, z)] !== LEAF && grid[idx(x, y, z)] !== LOG) return y;
  }
  return 0;
}

export function generate(seed: number): { grid: Uint8Array; anchors: Anchors; ready: Uint8Array } {
  const grid = new Uint8Array(SX * SY * SZ);
  const ready = new Uint8Array(CHUNKS_X * CHUNKS_Z);
  const hx = ROOM.x0 + 5;
  const hz = ROOM.z0 + 4;
  ensureChunks(grid, ready, seed, hx, hz, 2);

  const mx = ROOM.x0 - 8 + (seed % 4);
  const mz = ROOM.z0 - 6 + ((seed >> 3) % 4);
  for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) set(grid, mx + dx, 1, mz + dz, MAGMA);

  carveRoom(grid);

  const tz = ROOM.z0 + 3;
  for (let x = ROOM.x1 + 1; x <= ROOM.x1 + 4; x++) {
    for (let z = tz; z <= tz + 2; z++) {
      set(grid, x, WALK - 1, z, STONE);
      set(grid, x, WALK, z, AIR);
      set(grid, x, WALK + 1, z, AIR);
      set(grid, x, WALK + 2, z, STONE);
    }
  }
  for (let x = ROOM.x1 + 5; x <= ROOM.x1 + 8; x++) {
    for (let z = tz; z <= tz + 2; z++) {
      set(grid, x, WALK - 1, z, STONE);
      const ore = x >= ROOM.x1 + 7 && z === tz + 1;
      set(grid, x, WALK, z, ore ? ORE : STONE);
      set(grid, x, WALK + 1, z, STONE);
    }
  }

  const gate = carveStairs(grid);

  const farms: [number, number, number][] = [];
  const gz = gate[2];
  const gy = gate[1] - 1;
  for (const fx of [ROOM.x0 + 1, ROOM.x0 + 2, ROOM.x1 - 1, ROOM.x1]) {
    if (gy >= 1 && gy < SY) {
      set(grid, fx, gy, gz, GRASS);
      for (let y = gy + 1; y <= gy + 3; y++) set(grid, fx, y, gz, AIR);
      if (farms.length < 2) {
        set(grid, fx, gy, gz, FARM);
        farms.push([fx, gy, gz]);
      }
    }
  }

  set(grid, ROOM.x0 + 1, WALK, ROOM.z0 + 2, BED);
  set(grid, ROOM.x0 + 2, WALK, ROOM.z0 + 2, BED);
  set(grid, ROOM.x0 + 3, WALK, ROOM.z0 + 2, BED);
  set(grid, ROOM.x1 - 1, WALK, ROOM.z1 - 1, STILL);
  set(grid, ROOM.x0 + 1, WALK, ROOM.z0 + 5, TORCH);
  set(grid, ROOM.x1 - 1, WALK, ROOM.z0 + 1, TORCH);
  set(grid, hx, WALK, ROOM.z1, TORCH);
  set(grid, ROOM.x1 + 4, WALK, tz + 1, TORCH);
  set(grid, hx - 2, WALK, ROOM.z0 + 1, CHEST);

  const stocks: [number, number, number][] = [];
  for (let z = ROOM.z0; z <= ROOM.z0 + 1; z++) {
    for (let x = hx; x <= hx + 2; x++) stocks.push([x, WALK, z]);
  }

  const anchors: Anchors = {
    gate,
    hall: [hx, WALK, hz],
    deep: [ROOM.x1 + 4, WALK, tz + 1],
    farms,
    stocks,
  };
  return { grid, anchors, ready };
}

export type LightMaps = { sky: Uint8Array; torch: Uint8Array };

export function computeLight(grid: Uint8Array): LightMaps {
  const n = SX * SY * SZ;
  const sky = new Uint8Array(n);
  const torch = new Uint8Array(n);
  const q: number[] = [];
  let qh = 0;

  const relax = (arr: Uint8Array, i: number, val: number, spread: boolean) => {
    if (val <= 0 || val <= arr[i]) return;
    arr[i] = val;
    if (spread) q.push(i);
  };

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      for (let y = SY - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        if (blocksLight(grid[i])) break;
        relax(sky, i, 15, true);
      }
    }
  }
  const spreadFrom = (arr: Uint8Array) => {
    while (qh < q.length) {
      const i = q[qh++];
      const v = arr[i] - 1;
      if (v <= 0) continue;
      const { x, y, z } = unidx(i);
      const neigh: [number, number, number][] = [
        [x + 1, y, z],
        [x - 1, y, z],
        [x, y + 1, z],
        [x, y - 1, z],
        [x, y, z + 1],
        [x, y, z - 1],
      ];
      for (const [nx, ny, nz] of neigh) {
        if (!inb(nx, ny, nz)) continue;
        const ni = idx(nx, ny, nz);
        if (blocksLight(grid[ni])) {
          if (arr[ni] < v) arr[ni] = v;
        } else relax(arr, ni, v, true);
      }
    }
  };
  spreadFrom(sky);

  q.length = 0;
  qh = 0;
  for (let i = 0; i < n; i++) {
    const t = grid[i];
    if (t === TORCH) relax(torch, i, 14, true);
    if (t === MAGMA) {
      const { x, y, z } = unidx(i);
      const neigh: [number, number, number][] = [
        [x + 1, y, z],
        [x - 1, y, z],
        [x, y + 1, z],
        [x, y - 1, z],
        [x, y, z + 1],
        [x, y, z - 1],
      ];
      for (const [nx, ny, nz] of neigh) {
        if (!inb(nx, ny, nz)) continue;
        const ni = idx(nx, ny, nz);
        if (!blocksLight(grid[ni])) relax(torch, ni, 12, true);
      }
    }
  }
  spreadFrom(torch);
  return { sky, torch };
}

function hideFace(self: number, nt: number) {
  if (nt === AIR || nt === BED || nt === STILL || nt === TORCH) return false;
  if (self === WATER && nt === WATER) return true;
  if (self === LEAF && nt === LEAF) return true;
  if (self === LOG && nt === LOG) return true;
  if (isCube(nt) && nt !== LEAF && nt !== LOG) return true;
  return false;
}

function rgb(hex: number, shade: number, salt: number) {
  const k = shade * (0.9 + salt * 0.16);
  return [(((hex >> 16) & 255) / 255) * k, (((hex >> 8) & 255) / 255) * k, ((hex & 255) / 255) * k];
}

export type MeshData = {
  positions: Float32Array;
  colors: Float32Array;
  sky: Float32Array;
  torch: Float32Array;
  indices: Uint32Array;
};

export type BuiltMeshes = { solid: MeshData; water: MeshData };

export function buildMeshes(
  grid: Uint8Array,
  light: LightMaps,
  growth: Map<number, number>,
  layer: number | null,
  box?: { x0: number; x1: number; z0: number; z1: number },
  ready?: Uint8Array,
  clipZ = 0,
): BuiltMeshes {
  const sp: number[] = [];
  const sc: number[] = [];
  const ss: number[] = [];
  const st: number[] = [];
  const si: number[] = [];
  const wp: number[] = [];
  const wc: number[] = [];
  const ws: number[] = [];
  const wt: number[] = [];
  const wi: number[] = [];

  const sample = (x: number, y: number, z: number) => {
    if (!inb(x, y, z)) return { s: 1, t: 0, block: AIR };
    return { s: light.sky[idx(x, y, z)] / 15, t: light.torch[idx(x, y, z)] / 15, block: grid[idx(x, y, z)] };
  };

  const x0 = box?.x0 ?? 0;
  const x1 = box?.x1 ?? SX - 1;
  const z0 = box?.z0 ?? 0;
  const z1 = box?.z1 ?? SZ - 1;

  for (let z = z0; z <= z1; z++) {
    for (let y = 0; y < SY; y++) {
      if (layer !== null && (y > layer || y < layer - 1)) continue;
      for (let x = x0; x <= x1; x++) {
        if (clipZ > 0 && z < clipZ) continue;
        const t = grid[idx(x, y, z)];
        if (!isCube(t)) continue;
        const water = t === WATER;
        const pos = water ? wp : sp;
        const col = water ? wc : sc;
        const skyA = water ? ws : ss;
        const torA = water ? wt : st;
        const ind = water ? wi : si;
        for (const face of FACES) {
          const nx = x + face.d[0];
          const ny = y + face.d[1];
          const nz = z + face.d[2];
          let nt = AIR;
          if (inb(nx, ny, nz)) {
            if (clipZ > 0 && nz < clipZ) nt = AIR;
            else if (ready && !ready[chunkIndex(Math.floor(nx / CHUNK), Math.floor(nz / CHUNK))]) nt = STONE;
            else if (layer !== null && ny > layer) nt = AIR;
            else if (layer !== null && ny < layer - 1) nt = STONE;
            else nt = grid[idx(nx, ny, nz)];
          }
          if (hideFace(t, nt)) continue;
          const out = sample(nx, ny, nz);
          const baseI = pos.length / 3;
          let hex = BLOCK_COLOR[t] ?? 0x888888;
          if (t === GRASS && face.d[1] !== 1) hex = BLOCK_COLOR[DIRT];
          if (t === FARM) {
            const g = growth.get(idx(x, y, z)) ?? 0;
            hex = g >= 100 ? 0xc6a24a : 0x5d7a38;
          }
          const salt = hash(x + y, z, 99);
          const dim = layer !== null && y === layer - 1 ? 0.72 : 1;
          const [r, g, b] = rgb(hex, face.shade * dim, salt);
          for (const c of face.c) {
            pos.push(x + c[0], y + c[1], z + c[2]);
            col.push(r, g, b);
            skyA.push(out.s);
            torA.push(out.t);
          }
          ind.push(baseI, baseI + 1, baseI + 2, baseI + 2, baseI + 1, baseI + 3);
        }
      }
    }
  }

  const pack = (p: number[], c: number[], s: number[], t: number[], ix: number[]): MeshData => ({
    positions: Float32Array.from(p),
    colors: Float32Array.from(c),
    sky: Float32Array.from(s),
    torch: Float32Array.from(t),
    indices: Uint32Array.from(ix),
  });
  return { solid: pack(sp, sc, ss, st, si), water: pack(wp, wc, ws, wt, wi) };
}

class Heap {
  f: number[] = [];
  i: number[] = [];
  get size() {
    return this.i.length;
  }
  push(f: number, i: number) {
    const F = this.f;
    const I = this.i;
    F.push(f);
    I.push(i);
    let n = I.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (F[p] <= F[n]) break;
      [F[p], F[n]] = [F[n], F[p]];
      [I[p], I[n]] = [I[n], I[p]];
      n = p;
    }
  }
  pop() {
    const F = this.f;
    const I = this.i;
    const top = I[0];
    const lf = F.pop()!;
    const li = I.pop()!;
    if (I.length) {
      F[0] = lf;
      I[0] = li;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let s = n;
        if (l < I.length && F[l] < F[s]) s = l;
        if (r < I.length && F[r] < F[s]) s = r;
        if (s === n) break;
        [F[n], F[s]] = [F[s], F[n]];
        [I[n], I[s]] = [I[s], I[n]];
        n = s;
      }
    }
    return top;
  }
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function findPath(
  grid: Uint8Array,
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
): [number, number, number][] | null {
  if (!goodStand(grid, gx, gy, gz)) return null;
  if (sx === gx && sy === gy && sz === gz) return [];
  const n = SX * SY * SZ;
  const gScore = new Float32Array(n);
  gScore.fill(1e9);
  const prev = new Int32Array(n);
  prev.fill(-1);
  const seen = new Uint8Array(n);
  const open = new Heap();
  const start = idx(sx, sy, sz);
  const goal = idx(gx, gy, gz);
  gScore[start] = 0;
  open.push(Math.abs(gx - sx) + Math.abs(gy - sy) + Math.abs(gz - sz), start);
  let ops = 0;
  while (open.size && ops++ < 2800) {
    const cur = open.pop();
    if (seen[cur]) continue;
    seen[cur] = 1;
    if (cur === goal) {
      const out: [number, number, number][] = [];
      let c = goal;
      while (c !== start) {
        const p = unidx(c);
        out.push([p.x, p.y, p.z]);
        c = prev[c];
        if (c < 0) return null;
      }
      out.reverse();
      return out;
    }
    const { x, y, z } = unidx(cur);
    const base = gScore[cur];
    for (const [dx, dz] of DIRS) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!goodStand(grid, nx, ny, nz)) continue;
        if (dy === 1 && (!inb(x, y + 1, z) || !passable(grid[idx(x, y + 1, z)]))) continue;
        const ni = idx(nx, ny, nz);
        if (seen[ni]) continue;
        const ng = base + (dy === 0 ? 1 : 1.35);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          prev[ni] = cur;
          const h = Math.abs(gx - nx) + Math.abs(gy - ny) + Math.abs(gz - nz);
          open.push(ng + h, ni);
        }
      }
    }
  }
  return null;
}

export function workSpot(grid: Uint8Array, bx: number, by: number, bz: number, ax: number, az: number) {
  let best: [number, number, number] | null = null;
  let score = 1e9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (dx === 0 && dz === 0 && dy === 1) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > 1) continue;
        const x = bx + dx;
        const y = by + dy;
        const z = bz + dz;
        if (!goodStand(grid, x, y, z)) continue;
        const s = Math.abs(x + 0.5 - ax) + Math.abs(z + 0.5 - az) + Math.abs(dy) * 0.5;
        if (s < score) {
          score = s;
          best = [x, y, z];
        }
      }
    }
  }
  return best;
}

export function cellLight(light: LightMaps, x: number, y: number, z: number, sun: number) {
  if (!inb(x, y, z)) return 1;
  const i = idx(Math.floor(x), Math.floor(y), Math.floor(z));
  return Math.max(light.torch[i] / 15, (light.sky[i] / 15) * sun);
}

export function raycast(
  grid: Uint8Array,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  layer: number | null,
  clipZ: number,
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = stepX === 0 ? Infinity : (stepX > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = stepY === 0 ? Infinity : (stepY > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = stepZ === 0 ? Infinity : (stepZ > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  for (let i = 0; i < 220; i++) {
    const clipped = clipZ > 0 && z < clipZ;
    const onLayer = layer === null || y === layer || y === layer - 1;
    if (inb(x, y, z) && isCube(grid[idx(x, y, z)]) && !clipped && onLayer && (i > 0 || t > 0 || true)) {
      if (i > 0 || isCube(grid[idx(x, y, z)])) {
        if (!(i === 0 && t === 0)) return { x, y, z, nx, ny, nz };
        // Started inside a cube: still a valid hit, normal up.
        if (i === 0) return { x, y, z, nx: 0, ny: 1, nz: 0 };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}

export { diggable, goodStand };
