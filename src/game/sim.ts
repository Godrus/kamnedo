import type { Mat, Role, Tool } from "./constants";
import {
  AIR,
  BED,
  DIRT,
  FARM,
  GEM,
  GRASS,
  LEAF,
  LOG,
  MAGMA,
  ORE,
  ROLE_LABEL,
  ROOM,
  STILL,
  STONE,
  TORCH,
  WALK,
  WALL,
  diggable,
  goodStand,
  idx,
  inb,
  passable,
  seasonOf,
  solidFloor,
  unidx,
} from "./constants";
import { findPath, generate, workSpot, type Anchors } from "./world";

export type Task =
  | { kind: "dig"; x: number; y: number; z: number; work: number; phase: "go" | "work" }
  | { kind: "build"; x: number; y: number; z: number; what: "wall" | "bed" | "still"; work: number; phase: "go" | "work" }
  | { kind: "haul"; pile: number; to: [number, number, number]; mat: Mat; n: number; phase: "go" | "back" }
  | { kind: "harvest"; x: number; y: number; z: number; work: number; phase: "go" | "work" }
  | { kind: "brew"; x: number; y: number; z: number; work: number; phase: "go" | "work" }
  | { kind: "eat"; work: number }
  | { kind: "drink"; work: number }
  | { kind: "sleep"; x: number; y: number; z: number; work: number; phase: "go" | "work"; floor: boolean }
  | { kind: "fight"; id: number }
  | { kind: "wander"; x: number; y: number; z: number };

export type Dwarf = {
  id: number;
  name: string;
  female: boolean;
  role: Role;
  x: number;
  y: number;
  z: number;
  facing: number;
  path: [number, number, number][];
  hunger: number;
  thirst: number;
  sleep: number;
  hp: number;
  maxHp: number;
  thought: string;
  task: Task | null;
  alive: boolean;
  color: number;
  attackCd: number;
  floorSleep: boolean;
  moving: boolean;
};

export type Enemy = {
  id: number;
  kind: "crawler" | "goblin";
  name: string;
  x: number;
  y: number;
  z: number;
  facing: number;
  hp: number;
  maxHp: number;
  path: [number, number, number][];
  attackCd: number;
  alive: boolean;
  speed: number;
  repath: number;
};

export type Pile = { id: number; x: number; y: number; z: number; mat: Mat; n: number; claim: number };

export type LogLine = { id: number; text: string; tone: "info" | "good" | "bad" };

export type GameState = {
  seed: number;
  name: string;
  grid: Uint8Array;
  anchors: Anchors;
  digs: Map<number, { claim: number }>;
  builds: Map<number, { claim: number; what: "wall" | "bed" | "still" }>;
  stocksCells: Set<number>;
  growth: Map<number, number>;
  piles: Pile[];
  stocks: Record<Mat, number>;
  dwarves: Dwarf[];
  enemies: Enemy[];
  day: number;
  hour: number;
  time: number;
  log: LogLine[];
  logId: number;
  nextId: number;
  pileId: number;
  enemyId: number;
  fail: Map<number, number>;
  assignAt: number;
  cursor: number;
  invaded: Set<number>;
  migrants: Set<number>;
  banner: string;
  bannerT: number;
  fallen: boolean;
  lost: number;
  mined: number;
  oreStruck: boolean;
  dirty: boolean;
  propsDirty: boolean;
  events: { s: "dig" | "build" | "alert" | "good" | "hit" | "death"; x?: number; y?: number; z?: number; rgb?: number }[];
  hourMark: number;
  tutorialSeen: boolean;
};

const FIRST_M = ["Брам", "Кремень", "Оскол", "Жила", "Уголь", "Сланец", "Базальт", "Гвоздь", "Обруч", "Кирка", "Пласт", "Долом", "Кварц", "Шпат"];
const FIRST_F = ["Яшма", "Глина", "Слюда", "Охра", "Искра", "Медь", "Галька", "Россыпь"];
const LAST = ["Горный", "Камнерез", "Жильный", "Печной", "Колодезный", "Скалолом", "Тихий", "Рудовый", "Глубинный"];
const COLORS = [0xb5523a, 0x3d6f8c, 0xd0893c, 0x6e8b4f, 0x8d5a78, 0x4e6d88, 0xa3453b, 0x7d6548];

function mulberry(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(s: GameState, text: string, tone: LogLine["tone"] = "info") {
  s.log.push({ id: s.logId++, text, tone });
  if (s.log.length > 28) s.log.shift();
}

function banner(s: GameState, text: string) {
  s.banner = text;
  s.bannerT = 7;
}

export function createGame(name: string, seed: number): GameState {
  const { grid, anchors } = generate(seed);
  const rng = mulberry(seed);
  const s: GameState = {
    seed,
    name: name.trim().slice(0, 28) || "Горн-на-Жиле",
    grid,
    anchors,
    digs: new Map(),
    builds: new Map(),
    stocksCells: new Set(anchors.stocks.map(([x, y, z]) => idx(x, y, z))),
    growth: new Map(),
    piles: [],
    stocks: { stone: 18, ore: 0, gem: 0, wood: 16, food: 42, drink: 34 },
    dwarves: [],
    enemies: [],
    day: 1,
    hour: 8,
    time: 8,
    log: [],
    logId: 1,
    nextId: 1,
    pileId: 1,
    enemyId: 1,
    fail: new Map(),
    assignAt: 0,
    cursor: 0,
    invaded: new Set(),
    migrants: new Set(),
    banner: "",
    bannerT: 0,
    fallen: false,
    lost: 0,
    mined: 0,
    oreStruck: false,
    dirty: true,
    propsDirty: true,
    events: [],
    hourMark: 8,
    tutorialSeen: false,
  };
  for (const [x, y, z] of anchors.farms) s.growth.set(idx(x, y, z), 55);
  const roles: Role[] = ["miner", "mason", "farmer", "brewer", "hauler", "guard"];
  roles.forEach((role, i) => {
    const female = i === 2 || i === 3;
    const first = female ? FIRST_F[i % FIRST_F.length] : FIRST_M[i % FIRST_M.length];
    const d = makeDwarf(s, `${first} ${LAST[i % LAST.length]}`, female, role, COLORS[i % COLORS.length]);
    d.x = 18 + (i % 3) + 0.5;
    d.y = WALK;
    d.z = 26 + Math.floor(i / 3) + (i % 2) * 0.15;
    d.hunger = 12 + rng() * 28;
    d.thirst = 10 + rng() * 24;
    d.sleep = 8 + rng() * 20;
    s.dwarves.push(d);
  });
  // The first face of the tunnel is already marked, so a pick starts singing.
  for (let x = ROOM.x1 + 5; x <= ROOM.x1 + 6; x++) {
    for (let z = 25; z <= 27; z++) s.digs.set(idx(x, WALK, z), { claim: 0 });
  }
  s.digs.set(idx(ROOM.x1 + 7, WALK, 26), { claim: 0 });
  pushLog(s, "Телега у ворот. В бочках еда и пиво — гора уже помечена киркой.", "info");
  return s;
}

function makeDwarf(s: GameState, name: string, female: boolean, role: Role, color: number): Dwarf {
  return {
    id: s.nextId++,
    name,
    female,
    role,
    x: 20.5,
    y: WALK,
    z: 26.5,
    facing: 0,
    path: [],
    hunger: 20,
    thirst: 20,
    sleep: 10,
    hp: role === "guard" ? 70 : 36,
    maxHp: role === "guard" ? 70 : 36,
    thought: "Осматривает жилу",
    task: null,
    alive: true,
    color,
    attackCd: 0,
    floorSleep: false,
    moving: false,
  };
}

function standOf(d: { x: number; y: number; z: number }) {
  return [Math.floor(d.x), d.y | 0, Math.floor(d.z)] as [number, number, number];
}

function moveAlong(
  _s: GameState,
  d: { x: number; y: number; z: number; facing: number; path: [number, number, number][]; moving?: boolean },
  dt: number,
  speed: number,
) {
  if (!d.path.length) {
    d.moving = false;
    return true;
  }
  const [cx, cy, cz] = d.path[0];
  const tx = cx + 0.5;
  const tz = cz + 0.5;
  const dx = tx - d.x;
  const dz = tz - d.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * dt;
  if (dist <= step || dist < 0.06) {
    d.x = tx;
    d.z = tz;
    d.y = cy;
    d.path.shift();
    d.moving = d.path.length > 0;
    return d.path.length === 0;
  }
  d.x += (dx / dist) * step;
  d.z += (dz / dist) * step;
  if (dist < 0.45) d.y = cy;
  d.facing = Math.atan2(dx, dz);
  d.moving = true;
  return false;
}

function pathTo(s: GameState, d: Dwarf, x: number, y: number, z: number) {
  const [sx, sy, sz] = standOf(d);
  let start: [number, number, number] = [sx, sy, sz];
  if (!goodStand(s.grid, sx, sy, sz)) {
    const spot = workSpot(s.grid, sx, sy, sz, d.x, d.z) ?? ([sx, sy, sz] as [number, number, number]);
    start = spot;
  }
  const path = findPath(s.grid, start[0], start[1], start[2], x, y, z);
  if (!path) return false;
  d.path = path;
  return true;
}

function nearestStock(s: GameState, x: number, z: number): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let score = 1e9;
  for (const i of s.stocksCells) {
    const p = unidx(i);
    if (!goodStand(s.grid, p.x, p.y, p.z)) continue;
    const sc = Math.abs(p.x - x) + Math.abs(p.z - z);
    if (sc < score) {
      score = sc;
      best = [p.x, p.y, p.z];
    }
  }
  return best;
}

function findBed(s: GameState, d: Dwarf) {
  let best: [number, number, number] | null = null;
  let score = 1e9;
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== BED) continue;
    const p = unidx(i);
    if (s.dwarves.some((o) => o.alive && o.id !== d.id && o.task?.kind === "sleep" && o.task.x === p.x && o.task.z === p.z)) continue;
    const sc = Math.abs(p.x + 0.5 - d.x) + Math.abs(p.z + 0.5 - d.z);
    if (sc < score) {
      score = sc;
      best = [p.x, p.y, p.z];
    }
  }
  return best;
}

function findStill(s: GameState) {
  for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === STILL) return unidx(i);
  return null;
}

function addPile(s: GameState, x: number, y: number, z: number, mat: Mat, n: number) {
  const pileCell = goodStand(s.grid, x, y, z) ? [x, y, z] : goodStand(s.grid, x, y + 1, z) ? [x, y + 1, z] : null;
  if (!pileCell) {
    s.stocks[mat] += n;
    return;
  }
  const [px, py, pz] = pileCell;
  const existing = s.piles.find((p) => p.x === px && p.y === py && p.z === pz && p.mat === mat && !p.claim);
  if (existing) existing.n += n;
  else s.piles.push({ id: s.pileId++, x: px, y: py, z: pz, mat, n, claim: 0 });
  s.propsDirty = true;
}

function dropOf(t: number): { mat: Mat; n: number } | null {
  if (t === STONE || t === WALL) return { mat: "stone", n: 1 };
  if (t === ORE) return { mat: "ore", n: 1 };
  if (t === GEM) return { mat: "gem", n: 1 };
  if (t === LOG) return { mat: "wood", n: 2 };
  return null;
}

function finishDig(s: GameState, x: number, y: number, z: number) {
  const i = idx(x, y, z);
  const t = s.grid[i];
  if (!diggable(t)) {
    s.digs.delete(i);
    return;
  }
  s.grid[i] = AIR;
  s.digs.delete(i);
  s.mined++;
  const drop = dropOf(t);
  if (drop) addPile(s, x, y, z, drop.mat, drop.n);
  if (t === ORE && !s.oreStruck) {
    s.oreStruck = true;
    pushLog(s, "В стене блеснула руда. Кто-то довольно крякнул.", "good");
    s.events.push({ s: "good" });
  }
  if (t === GEM) {
    pushLog(s, "Самоцвет. Его уберут в угол и будут на него смотреть.", "good");
    s.events.push({ s: "good" });
  }
  s.events.push({ s: "dig", x, y, z, rgb: t === ORE ? 0xc47a3a : t === GEM ? 0x3cafa6 : 0x8b8176 });
  s.dirty = true;
  s.propsDirty = true;
  s.fail.clear();
}

function costOf(what: "wall" | "bed" | "still"): Partial<Record<Mat, number>> {
  if (what === "wall") return { stone: 1 };
  if (what === "bed") return { wood: 1 };
  return { wood: 2 };
}

function canPay(s: GameState, cost: Partial<Record<Mat, number>>) {
  for (const k of Object.keys(cost) as Mat[]) if (s.stocks[k] < (cost[k] ?? 0)) return false;
  return true;
}

function pay(s: GameState, cost: Partial<Record<Mat, number>>) {
  for (const k of Object.keys(cost) as Mat[]) s.stocks[k] -= cost[k] ?? 0;
}

function finishBuild(s: GameState, x: number, y: number, z: number, what: "wall" | "bed" | "still") {
  const i = idx(x, y, z);
  const cost = costOf(what);
  if (!canPay(s, cost) || !passable(s.grid[i]) || !solidFloor(s.grid[idx(x, y - 1, z)])) {
    s.builds.delete(i);
    return;
  }
  pay(s, cost);
  s.grid[i] = what === "wall" ? WALL : what === "bed" ? BED : STILL;
  s.builds.delete(i);
  s.events.push({ s: "build", x, y, z });
  s.dirty = true;
  s.propsDirty = true;
  pushLog(s, what === "wall" ? "Стена села на место." : what === "bed" ? "Кровать готова. Кто-то уже зевает." : "Пивоварня пахнет суслом.", "good");
}

function releaseClaim(s: GameState, d: Dwarf) {
  const task = d.task;
  if (!task) return;
  if (task.kind === "dig") {
    const job = s.digs.get(idx(task.x, task.y, task.z));
    if (job && job.claim === d.id) job.claim = 0;
  }
  if (task.kind === "build") {
    const job = s.builds.get(idx(task.x, task.y, task.z));
    if (job && job.claim === d.id) job.claim = 0;
  }
  if (task.kind === "haul") {
    const p = s.piles.find((p) => p.id === task.pile);
    if (p && p.claim === d.id) p.claim = 0;
  }
}

function moodOf(d: Dwarf) {
  let m = 100 - d.hunger * 0.28 - d.thirst * 0.32 - d.sleep * 0.22;
  if (d.floorSleep) m -= 14;
  if (d.hp < d.maxHp * 0.6) m -= 12;
  return Math.max(0, Math.min(100, m));
}

export function moodLabel(m: number) {
  if (m > 80) return "ликует";
  if (m > 60) return "спокоен";
  if (m > 40) return "ворчит";
  if (m > 22) return "тоскует";
  return "на грани";
}

function thoughtFor(d: Dwarf) {
  if (!d.alive) return "тишина";
  if (d.hp < d.maxHp * 0.45) return "Держится за бок";
  if (d.hunger > 80) return "Живот сводит от пустоты";
  if (d.thirst > 80) return "Мечтает о кружке";
  if (d.sleep > 82) return d.floorSleep ? "Спит на голом камне" : "Клюёт носом";
  if (d.task?.kind === "dig") return "Считает удары кирки";
  if (d.task?.kind === "build") return "Прикидывает шов";
  if (d.task?.kind === "brew") return "Нюхает сусло";
  if (d.task?.kind === "harvest") return "Щиплет ботву";
  if (d.task?.kind === "haul") return "Кряхтит, но несёт";
  if (d.task?.kind === "fight") return "Не отступает";
  if (moodOf(d) > 75) return "Доволен толщиной стен";
  return "Слушает, как оседает порода";
}

function killDwarf(s: GameState, d: Dwarf, why: string) {
  if (!d.alive) return;
  d.alive = false;
  d.hp = 0;
  d.task = null;
  d.path = [];
  s.lost++;
  pushLog(s, `${d.name} ${why}`, "bad");
  s.events.push({ s: "death", x: d.x, y: d.y, z: d.z });
  banner(s, `${d.name.split(" ")[0]} погиб`);
  if (!s.dwarves.some((o) => o.alive)) {
    s.fallen = true;
    s.banner = "";
    pushLog(s, "В залах больше никто не ходит.", "bad");
  }
}

function spawnEnemy(s: GameState, kind: "crawler" | "goblin", x: number, y: number, z: number) {
  const crawler = kind === "crawler";
  s.enemies.push({
    id: s.enemyId++,
    kind,
    name: crawler ? "Пещерный скользящ" : "Гоблин",
    x: x + 0.5,
    y,
    z: z + 0.5,
    facing: 0,
    hp: crawler ? 48 : 34,
    maxHp: crawler ? 48 : 34,
    path: [],
    attackCd: 0.4,
    alive: true,
    speed: crawler ? 1.35 : 2.15,
    repath: 0,
  });
}

function onDay(s: GameState) {
  if (!s.invaded.has(s.day) && s.day === 3) {
    s.invaded.add(s.day);
    const [x, y, z] = s.anchors.deep;
    spawnEnemy(s, "crawler", x, y, z);
    pushLog(s, "Из непройденной жилы выполз пещерный скользящ.", "bad");
    banner(s, "В глубине кто-то есть");
    s.events.push({ s: "alert" });
  }
  if (!s.invaded.has(s.day) && (s.day === 6 || (s.day > 6 && (s.day - 6) % 4 === 0))) {
    s.invaded.add(s.day);
    const n = s.day >= 10 ? 3 : 2;
    const [gx, gy, gz] = s.anchors.gate;
    for (let i = 0; i < n; i++) spawnEnemy(s, "goblin", gx - 1 + i, gy, gz);
    pushLog(s, "Гоблины у входа. Стража — к воротам.", "bad");
    banner(s, "Гоблины у ворот");
    s.events.push({ s: "alert" });
  }
  if (!s.migrants.has(s.day) && s.day > 2 && s.day % 4 === 1) {
    const alive = s.dwarves.filter((d) => d.alive);
    const mood = alive.reduce((a, d) => a + moodOf(d), 0) / Math.max(1, alive.length);
    if (alive.length < 12 && alive.length > 0 && s.stocks.food > alive.length * 3 && s.stocks.drink > alive.length * 2 && mood > 42) {
      s.migrants.add(s.day);
      const female = s.day % 2 === 0;
      const pool = female ? FIRST_F : FIRST_M;
      const role: Role = (["hauler", "miner", "farmer", "mason"] as Role[])[s.day % 4];
      const d = makeDwarf(s, `${pool[(s.day + 3) % pool.length]} ${LAST[(s.day + 1) % LAST.length]}`, female, role, COLORS[alive.length % COLORS.length]);
      const [gx, gy, gz] = s.anchors.gate;
      d.x = gx + 0.5;
      d.y = gy;
      d.z = gz + 0.5;
      d.thought = "Только что от пыльной дороги";
      s.dwarves.push(d);
      pushLog(s, `У ворот новый дворф: ${d.name}, ${ROLE_LABEL[role].toLowerCase()}.`, "good");
      banner(s, "Пришли новые руки");
      s.events.push({ s: "good" });
    }
  }
}

const ROLE_ORDER: Record<Role, ("dig" | "build" | "haul" | "harvest" | "brew")[]> = {
  miner: ["dig", "haul", "build", "harvest", "brew"],
  mason: ["build", "haul", "dig", "harvest", "brew"],
  farmer: ["harvest", "haul", "dig", "build", "brew"],
  brewer: ["brew", "haul", "harvest", "dig", "build"],
  hauler: ["haul", "dig", "build", "harvest", "brew"],
  guard: ["haul", "dig", "build", "harvest", "brew"],
};

function tryAssign(s: GameState, d: Dwarf, kind: "dig" | "build" | "haul" | "harvest" | "brew") {
  if (kind === "dig") {
    let best: { i: number; x: number; y: number; z: number; spot: [number, number, number] } | null = null;
    let score = 1e9;
    for (const [i, job] of s.digs) {
      if (job.claim && job.claim !== d.id) continue;
      if ((s.fail.get(i) ?? 0) > s.time) continue;
      const p = unidx(i);
      if (!diggable(s.grid[i])) {
        s.digs.delete(i);
        continue;
      }
      const spot = workSpot(s.grid, p.x, p.y, p.z, d.x, d.z);
      if (!spot) continue;
      const sc = Math.abs(spot[0] + 0.5 - d.x) + Math.abs(spot[2] + 0.5 - d.z);
      if (sc < score) {
        score = sc;
        best = { i, x: p.x, y: p.y, z: p.z, spot };
      }
    }
    if (!best) return false;
    if (!pathTo(s, d, best.spot[0], best.spot[1], best.spot[2])) {
      s.fail.set(best.i, s.time + 8);
      return false;
    }
    s.digs.get(best.i)!.claim = d.id;
    const t = s.grid[best.i];
    const work = t === DIRT || t === GRASS || t === LEAF ? 0.7 : t === ORE || t === GEM ? 2.4 : 1.7;
    d.task = { kind: "dig", x: best.x, y: best.y, z: best.z, work, phase: "go" };
    return true;
  }
  if (kind === "build") {
    let best: { i: number; x: number; y: number; z: number; what: "wall" | "bed" | "still"; spot: [number, number, number] } | null = null;
    let score = 1e9;
    for (const [i, job] of s.builds) {
      if (job.claim && job.claim !== d.id) continue;
      if (!canPay(s, costOf(job.what))) continue;
      const p = unidx(i);
      const spot = workSpot(s.grid, p.x, p.y, p.z, d.x, d.z);
      if (!spot) continue;
      const sc = Math.abs(spot[0] - d.x) + Math.abs(spot[2] - d.z);
      if (sc < score) {
        score = sc;
        best = { i, x: p.x, y: p.y, z: p.z, what: job.what, spot };
      }
    }
    if (!best) return false;
    if (!pathTo(s, d, best.spot[0], best.spot[1], best.spot[2])) return false;
    s.builds.get(best.i)!.claim = d.id;
    d.task = { kind: "build", x: best.x, y: best.y, z: best.z, what: best.what, work: best.what === "still" ? 3.2 : 2.2, phase: "go" };
    return true;
  }
  if (kind === "haul") {
    const pile = s.piles.find((p) => p.n > 0 && !p.claim);
    if (!pile) return false;
    const to = nearestStock(s, pile.x, pile.z);
    if (!to) return false;
    if (!pathTo(s, d, pile.x, pile.y, pile.z)) return false;
    pile.claim = d.id;
    d.task = { kind: "haul", pile: pile.id, to, mat: pile.mat, n: pile.n, phase: "go" };
    return true;
  }
  if (kind === "harvest") {
    let best: { x: number; y: number; z: number; spot: [number, number, number] } | null = null;
    let score = 1e9;
    for (const [i, g] of s.growth) {
      if (g < 100) continue;
      if (s.dwarves.some((o) => o.alive && o.task?.kind === "harvest" && idx(o.task.x, o.task.y, o.task.z) === i)) continue;
      const p = unidx(i);
      const spot = workSpot(s.grid, p.x, p.y, p.z, d.x, d.z);
      if (!spot) continue;
      const sc = Math.abs(spot[0] - d.x) + Math.abs(spot[2] - d.z);
      if (sc < score) {
        score = sc;
        best = { x: p.x, y: p.y, z: p.z, spot };
      }
    }
    if (!best) return false;
    if (!pathTo(s, d, best.spot[0], best.spot[1], best.spot[2])) return false;
    d.task = { kind: "harvest", x: best.x, y: best.y, z: best.z, work: 1.3, phase: "go" };
    return true;
  }
  if (kind === "brew") {
    const alive = s.dwarves.filter((o) => o.alive).length;
    if (s.stocks.drink > alive * 4 || s.stocks.food < 6) return false;
    if (s.dwarves.some((o) => o.alive && o.task?.kind === "brew")) return false;
    const still = findStill(s);
    if (!still) return false;
    const spot = workSpot(s.grid, still.x, still.y, still.z, d.x, d.z);
    if (!spot) return false;
    if (!pathTo(s, d, spot[0], spot[1], spot[2])) return false;
    d.task = { kind: "brew", x: still.x, y: still.y, z: still.z, work: 3.4, phase: "go" };
    return true;
  }
  return false;
}

function assignOne(s: GameState, d: Dwarf) {
  if (!d.alive || d.task) return;
  const foe = nearestEnemy(s, d.x, d.y, d.z);
  if (foe && (d.role === "guard" || dist3(d, foe) < 2.2)) {
    d.task = { kind: "fight", id: foe.id };
    d.thought = "Не отступает";
    return;
  }
  if (d.thirst > 74 && s.stocks.drink > 0) {
    d.task = { kind: "drink", work: 1 };
    d.thought = "Пьёт, не отходя от дела";
    return;
  }
  if (d.hunger > 76 && s.stocks.food > 0) {
    d.task = { kind: "eat", work: 1.1 };
    d.thought = "Жуёт на ходу";
    return;
  }
  if (d.sleep > 80) {
    const bed = findBed(s, d);
    if (bed && pathTo(s, d, bed[0], bed[1], bed[2])) {
      d.task = { kind: "sleep", x: bed[0], y: bed[1], z: bed[2], work: 0, phase: "go", floor: false };
      return;
    }
    d.task = { kind: "sleep", x: Math.floor(d.x), y: d.y, z: Math.floor(d.z), work: 0, phase: "work", floor: true };
    d.floorSleep = true;
    return;
  }
  for (const kind of ROLE_ORDER[d.role]) {
    if (tryAssign(s, d, kind)) return;
  }
  if (d.role !== "guard") {
    for (const kind of ["haul", "dig", "build", "harvest", "brew"] as const) {
      if (tryAssign(s, d, kind)) return;
    }
  }
  if (Math.random() < 0.15) {
    const spot = wanderSpot(s, d);
    if (spot) {
      d.path = [];
      if (pathTo(s, d, spot[0], spot[1], spot[2])) d.task = { kind: "wander", x: spot[0], y: spot[1], z: spot[2] };
    }
  }
  d.thought = thoughtFor(d);
}

function wanderSpot(s: GameState, d: Dwarf): [number, number, number] | null {
  const [x, y, z] = standOf(d);
  for (let k = 0; k < 8; k++) {
    const nx = x + Math.floor(Math.random() * 5) - 2;
    const nz = z + Math.floor(Math.random() * 5) - 2;
    if (goodStand(s.grid, nx, y, nz)) return [nx, y, nz];
  }
  return null;
}

function nearestEnemy(s: GameState, x: number, y: number, z: number) {
  let best: Enemy | null = null;
  let score = 1e9;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const sc = Math.abs(e.x - x) + Math.abs(e.z - z) + Math.abs(e.y - y);
    if (sc < score) {
      score = sc;
      best = e;
    }
  }
  return best;
}

function dist3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function tickDwarf(s: GameState, d: Dwarf, dt: number) {
  if (!d.alive) return;
  const busySleep = d.task?.kind === "sleep" && d.task.phase === "work";
  d.hunger = Math.min(120, d.hunger + dt * (busySleep ? 0.7 : 2.05));
  d.thirst = Math.min(120, d.thirst + dt * (busySleep ? 0.8 : 2.35));
  d.sleep = Math.min(120, d.sleep + dt * (busySleep ? 0 : 1.15));
  if (
    d.task &&
    d.task.kind !== "eat" &&
    d.task.kind !== "drink" &&
    d.task.kind !== "sleep" &&
    d.task.kind !== "fight" &&
    ((d.thirst > 92 && s.stocks.drink > 0) || (d.hunger > 94 && s.stocks.food > 0))
  ) {
    releaseClaim(s, d);
    d.task = null;
    d.path = [];
  }
  if (d.hunger >= 100) d.hp -= 6 * dt;
  if (d.thirst >= 100) d.hp -= 7 * dt;
  const [sx, sy, sz] = standOf(d);
  if (inb(sx, sy, sz)) {
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const nx = sx + dx;
      const ny = sy + dy;
      const nz = sz + dz;
      if (inb(nx, ny, nz) && s.grid[idx(nx, ny, nz)] === MAGMA) d.hp -= 10 * dt;
    }
  }
  if (d.hp <= 0) {
    killDwarf(s, d, "не пережил глубину.");
    return;
  }
  d.attackCd = Math.max(0, d.attackCd - dt);
  const task = d.task;
  if (!task) {
    d.moving = false;
    return;
  }
  if (task.kind === "eat") {
    task.work -= dt;
    d.moving = false;
    if (task.work <= 0) {
      if (s.stocks.food > 0) {
        s.stocks.food--;
        d.hunger = 14;
        s.events.push({ s: "good" });
      }
      d.task = null;
    }
    return;
  }
  if (task.kind === "drink") {
    task.work -= dt;
    d.moving = false;
    if (task.work <= 0) {
      if (s.stocks.drink > 0) {
        s.stocks.drink--;
        d.thirst = 12;
      }
      d.task = null;
    }
    return;
  }
  if (task.kind === "sleep") {
    if (task.phase === "go") {
      const arrived = moveAlong(s, d, dt, 2.1);
      if (arrived) task.phase = "work";
      return;
    }
    d.moving = false;
    d.sleep = Math.max(0, d.sleep - dt * (task.floor ? 8 : 18));
    d.floorSleep = task.floor;
    if (d.sleep <= 12) {
      d.task = null;
      if (!task.floor) d.thought = "Выспался на досках";
    }
    return;
  }
  if (task.kind === "fight") {
    const foe = s.enemies.find((e) => e.id === task.id && e.alive);
    if (!foe) {
      d.task = null;
      return;
    }
    const dist = dist3(d, foe);
    if (dist > 1.25) {
      if (!d.path.length) {
        const spot = workSpot(s.grid, Math.floor(foe.x), foe.y | 0, Math.floor(foe.z), d.x, d.z);
        const [fx, fy, fz] = standOf(foe);
        const goal = spot ?? (goodStand(s.grid, fx, fy, fz) ? ([fx, fy, fz] as [number, number, number]) : null);
        if (goal) pathTo(s, d, goal[0], goal[1], goal[2]);
      }
      moveAlong(s, d, dt, d.role === "guard" ? 2.6 : 2.2);
      return;
    }
    d.moving = false;
    d.facing = Math.atan2(foe.x - d.x, foe.z - d.z);
    if (d.attackCd <= 0) {
      const dmg = d.role === "guard" ? 11 : 4;
      foe.hp -= dmg;
      d.attackCd = 0.75;
      s.events.push({ s: "hit", x: foe.x, y: foe.y, z: foe.z, rgb: 0xc4543c });
      if (foe.hp <= 0) {
        foe.alive = false;
        pushLog(s, `${d.name} одолел: ${foe.name.toLowerCase()}.`, "good");
        s.events.push({ s: "good" });
        d.task = null;
      }
    }
    return;
  }
  if (task.kind === "wander") {
    const arrived = moveAlong(s, d, dt, 1.6);
    if (arrived) d.task = null;
    return;
  }
  if (task.kind === "dig" || task.kind === "build" || task.kind === "harvest" || task.kind === "brew") {
    if (task.phase === "go") {
      const arrived = moveAlong(s, d, dt, 2.35 + moodOf(d) / 120);
      if (arrived) task.phase = "work";
      return;
    }
    d.moving = false;
    task.work -= dt * (0.75 + moodOf(d) / 180);
    if (task.work > 0) return;
    if (task.kind === "dig") finishDig(s, task.x, task.y, task.z);
    if (task.kind === "build") finishBuild(s, task.x, task.y, task.z, task.what);
    if (task.kind === "harvest") {
      const i = idx(task.x, task.y, task.z);
      s.growth.set(i, 0);
      addPile(s, task.x, task.y + 1, task.z, "food", 2);
      s.dirty = true;
      s.events.push({ s: "good" });
    }
    if (task.kind === "brew") {
      if (s.stocks.food >= 2) {
        s.stocks.food -= 2;
        s.stocks.drink += 6;
        pushLog(s, "Бочка булькнула. Пиво будет.", "good");
        s.events.push({ s: "good" });
      }
    }
    d.task = null;
    d.thought = thoughtFor(d);
    return;
  }
  if (task.kind === "haul") {
    const pile = s.piles.find((p) => p.id === task.pile);
    if (task.phase === "go") {
      if (!pile) {
        d.task = null;
        return;
      }
      const arrived = moveAlong(s, d, dt, 2.3);
      if (arrived) {
        task.n = pile.n;
        task.mat = pile.mat;
        pile.n = 0;
        pile.claim = 0;
        s.piles = s.piles.filter((p) => p.n > 0);
        s.propsDirty = true;
        task.phase = "back";
        d.path = [];
        pathTo(s, d, task.to[0], task.to[1], task.to[2]);
      }
      return;
    }
    const arrived = moveAlong(s, d, dt, 2.15);
    if (arrived) {
      s.stocks[task.mat] += task.n;
      d.task = null;
      s.events.push({ s: "build" });
    }
  }
}

function tickEnemy(s: GameState, e: Enemy, dt: number) {
  if (!e.alive) return;
  e.attackCd = Math.max(0, e.attackCd - dt);
  e.repath -= dt;
  const prey = s.dwarves.filter((d) => d.alive).sort((a, b) => dist3(a, e) - dist3(b, e))[0];
  if (!prey) return;
  const dist = dist3(e, prey);
  if (dist > 1.2) {
    if (e.repath <= 0 || !e.path.length) {
      e.repath = 1.2;
      const [px, py, pz] = standOf(prey);
      const [ex, ey, ez] = standOf(e);
      const start = goodStand(s.grid, ex, ey, ez) ? [ex, ey, ez] : workSpot(s.grid, ex, ey, ez, e.x, e.z);
      if (start && goodStand(s.grid, px, py, pz)) {
        const path = findPath(s.grid, start[0], start[1], start[2], px, py, pz);
        if (path) e.path = path;
      }
    }
    moveAlong(s, e, dt, e.speed);
    return;
  }
  e.facing = Math.atan2(prey.x - e.x, prey.z - e.z);
  if (e.attackCd <= 0) {
    const dmg = e.kind === "crawler" ? 9 : 7;
    prey.hp -= dmg;
    e.attackCd = e.kind === "crawler" ? 1 : 0.85;
    s.events.push({ s: "hit", x: prey.x, y: prey.y, z: prey.z, rgb: 0xc4543c });
    if (prey.hp <= 0) killDwarf(s, prey, e.kind === "crawler" ? "остался в темноте." : "пал у ворот.");
  }
}

export function step(s: GameState, dt: number) {
  if (s.fallen) return;
  s.time += dt;
  s.hour += dt;
  if (s.bannerT > 0) s.bannerT -= dt;
  if (s.bannerT <= 0) s.banner = "";
  const winter = seasonOf(s.day) === "зима";
  for (const [i, g] of s.growth) {
    if (s.grid[i] !== FARM) {
      s.growth.delete(i);
      continue;
    }
    if (g < 100) s.growth.set(i, Math.min(100, g + dt * (winter ? 1.1 : 2.7)));
  }
  while (s.hour >= 24) {
    s.hour -= 24;
    s.day += 1;
    onDay(s);
  }
  const h = Math.floor(s.hour);
  if (h !== s.hourMark) {
    if (h === 20) pushLog(s, "Солнце село. Зал держится на факелах.", "info");
    if (h === 6) pushLog(s, "Рассвет лижет склон. Внутри всё равно ночь.", "info");
    s.hourMark = h;
  }
  for (const d of s.dwarves) tickDwarf(s, d, dt);
  for (const e of s.enemies) tickEnemy(s, e, dt);
  s.enemies = s.enemies.filter((e) => e.alive);
  if (s.time >= s.assignAt) {
    s.assignAt = s.time + 0.35;
    const alive = s.dwarves.filter((d) => d.alive);
    if (alive.length) {
      s.cursor = (s.cursor + 1) % alive.length;
      assignOne(s, alive[s.cursor]);
    }
  }
}

function toast(s: GameState, text: string) {
  pushLog(s, text, "info");
  return text;
}

export function paint(s: GameState, tool: Tool, x: number, y: number, z: number, nx: number, ny: number, nz: number): string | null {
  if (s.fallen) return null;
  if (!inb(x, y, z)) return null;
  const placeX = x + nx;
  const placeY = y + ny;
  const placeZ = z + nz;
  if (tool === "dig") {
    if (!diggable(s.grid[idx(x, y, z)])) return "Здесь нечего копать";
    const i = idx(x, y, z);
    if (s.digs.has(i)) return null;
    if (s.digs.size > 420) return "Слишком много меток";
    s.digs.set(i, { claim: 0 });
    s.fail.delete(i);
    return null;
  }
  if (tool === "farm") {
    const t = s.grid[idx(x, y, z)];
    if (t !== GRASS && t !== DIRT && t !== FARM) return "Ферма садится только на землю";
    s.grid[idx(x, y, z)] = FARM;
    s.growth.set(idx(x, y, z), s.growth.get(idx(x, y, z)) ?? 0);
    s.dirty = true;
    s.events.push({ s: "build", x, y, z });
    return null;
  }
  if (tool === "stock") {
    const cell = ny === 1 && inb(placeX, placeY, placeZ) ? [placeX, placeY, placeZ] : [x, y + 1, z];
    const [cx, cy, cz] = cell;
    if (!goodStand(s.grid, cx, cy, cz)) return "Складу нужен пол";
    const i = idx(cx, cy, cz);
    if (s.stocksCells.has(i)) s.stocksCells.delete(i);
    else s.stocksCells.add(i);
    s.propsDirty = true;
    return null;
  }
  if (tool === "torch") {
    const cell = airCell(s, x, y, z, nx, ny, nz);
    if (!cell) return "Факел ставят на пол";
    if (s.stocks.wood < 1) return "Мало дерева";
    s.stocks.wood--;
    s.grid[idx(cell[0], cell[1], cell[2])] = TORCH;
    s.dirty = true;
    s.propsDirty = true;
    s.events.push({ s: "build" });
    return null;
  }
  if (tool === "wall" || tool === "bed" || tool === "still") {
    const cell = airCell(s, x, y, z, nx, ny, nz);
    if (!cell) return "Нужен свободный пол";
    const what = tool;
    const cost = costOf(what);
    if (!canPay(s, cost)) return what === "wall" ? "Мало камня на складе" : "Мало дерева на складе";
    const i = idx(cell[0], cell[1], cell[2]);
    s.builds.set(i, { claim: 0, what });
    s.propsDirty = true;
    return null;
  }
  if (tool === "cancel") {
    const solidI = idx(x, y, z);
    let hit = false;
    if (s.digs.delete(solidI)) hit = true;
    if (s.builds.delete(solidI)) hit = true;
    if (inb(placeX, placeY, placeZ)) {
      const pi = idx(placeX, placeY, placeZ);
      if (s.digs.delete(pi)) hit = true;
      if (s.builds.delete(pi)) hit = true;
      if (s.stocksCells.delete(pi)) hit = true;
      const above = idx(x, y + 1, z);
      if (inb(x, y + 1, z)) {
        if (s.builds.delete(above)) hit = true;
        if (s.stocksCells.delete(above)) hit = true;
      }
      const bt = s.grid[pi];
      if (bt === WALL || bt === BED || bt === STILL || bt === TORCH || bt === FARM) {
        if (bt === WALL) addPile(s, placeX, placeY, placeZ, "stone", 1);
        if (bt === BED || bt === TORCH) addPile(s, placeX, placeY, placeZ, "wood", 1);
        if (bt === STILL) addPile(s, placeX, placeY, placeZ, "wood", 1);
        s.grid[pi] = AIR;
        s.dirty = true;
        s.propsDirty = true;
        hit = true;
      }
    }
    if (s.grid[solidI] === FARM) {
      s.grid[solidI] = DIRT;
      s.growth.delete(solidI);
      s.dirty = true;
      hit = true;
    }
    if (s.grid[solidI] === WALL || s.grid[solidI] === BED || s.grid[solidI] === STILL || s.grid[solidI] === TORCH) {
      const bt = s.grid[solidI];
      if (bt === WALL) addPile(s, x, y, z, "stone", 1);
      if (bt === BED || bt === TORCH) addPile(s, x, y, z, "wood", 1);
      if (bt === STILL) addPile(s, x, y, z, "wood", 1);
      s.grid[solidI] = AIR;
      s.dirty = true;
      s.propsDirty = true;
      hit = true;
    }
    return hit ? null : null;
  }
  return null;
}

function airCell(s: GameState, x: number, y: number, z: number, nx: number, ny: number, nz: number): [number, number, number] | null {
  const candidates: [number, number, number][] = [];
  if (inb(x + nx, y + ny, z + nz)) candidates.push([x + nx, y + ny, z + nz]);
  if (inb(x, y + 1, z)) candidates.push([x, y + 1, z]);
  for (const [cx, cy, cz] of candidates) {
    if (!passable(s.grid[idx(cx, cy, cz)])) continue;
    if (cy - 1 < 0 || !solidFloor(s.grid[idx(cx, cy - 1, cz)])) continue;
    if (s.grid[idx(cx, cy, cz)] !== AIR) continue;
    return [cx, cy, cz];
  }
  return null;
}

export function taskLabel(t: Task | null) {
  if (!t) return "ждёт дела";
  switch (t.kind) {
    case "dig":
      return "копает";
    case "build":
      return "кладёт";
    case "haul":
      return "несёт";
    case "harvest":
      return "собирает";
    case "brew":
      return "варит";
    case "eat":
      return "ест";
    case "drink":
      return "пьёт";
    case "sleep":
      return "спит";
    case "fight":
      return "дерётся";
    case "wander":
      return "бродит";
  }
}

export function setRole(s: GameState, id: number, role: Role) {
  const d = s.dwarves.find((o) => o.id === id && o.alive);
  if (!d) return;
  d.role = role;
  d.thought = `Теперь ${ROLE_LABEL[role].toLowerCase()}`;
  if (d.task && d.task.kind !== "eat" && d.task.kind !== "drink" && d.task.kind !== "sleep") {
    releaseClaim(s, d);
    d.task = null;
    d.path = [];
  }
}

export { moodOf, pushLog as logLine, toast };
