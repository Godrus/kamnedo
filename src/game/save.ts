import { SAVE_KEY } from "./constants";
import type { GameState } from "./sim";

type Blob = {
  v: 1;
  seed: number;
  name: string;
  grid: string;
  anchors: GameState["anchors"];
  digs: [number, { claim: number }][];
  builds: [number, { claim: number; what: "wall" | "bed" | "still" }][];
  stocksCells: number[];
  growth: [number, number][];
  piles: GameState["piles"];
  stocks: GameState["stocks"];
  dwarves: GameState["dwarves"];
  enemies: GameState["enemies"];
  day: number;
  hour: number;
  time: number;
  log: GameState["log"];
  logId: number;
  nextId: number;
  pileId: number;
  enemyId: number;
  invaded: number[];
  migrants: number[];
  lost: number;
  mined: number;
  oreStruck: boolean;
  fallen: boolean;
  tutorialSeen: boolean;
};

function encode(grid: Uint8Array) {
  let s = "";
  const chunk = 0x2000;
  for (let i = 0; i < grid.length; i += chunk) {
    s += String.fromCharCode(...grid.subarray(i, i + chunk));
  }
  return btoa(s);
}

function decode(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function writeSave(s: GameState) {
  const blob: Blob = {
    v: 1,
    seed: s.seed,
    name: s.name,
    grid: encode(s.grid),
    anchors: s.anchors,
    digs: [...s.digs.entries()],
    builds: [...s.builds.entries()],
    stocksCells: [...s.stocksCells],
    growth: [...s.growth.entries()],
    piles: s.piles,
    stocks: s.stocks,
    dwarves: s.dwarves,
    enemies: s.enemies,
    day: s.day,
    hour: s.hour,
    time: s.time,
    log: s.log,
    logId: s.logId,
    nextId: s.nextId,
    pileId: s.pileId,
    enemyId: s.enemyId,
    invaded: [...s.invaded],
    migrants: [...s.migrants],
    lost: s.lost,
    mined: s.mined,
    oreStruck: s.oreStruck,
    fallen: s.fallen,
    tutorialSeen: s.tutorialSeen,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    /* private mode */
  }
}

export function readSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Blob;
    if (b.v !== 1 || !b.grid) return null;
    const grid = decode(b.grid);
    const s = {
      seed: b.seed,
      name: b.name,
      grid,
      anchors: b.anchors,
      digs: new Map(b.digs),
      builds: new Map(b.builds),
      stocksCells: new Set(b.stocksCells),
      growth: new Map(b.growth),
      piles: b.piles ?? [],
      stocks: b.stocks,
      dwarves: b.dwarves,
      enemies: b.enemies ?? [],
      day: b.day,
      hour: b.hour,
      time: b.time,
      log: b.log ?? [],
      logId: b.logId ?? 1,
      nextId: b.nextId ?? 10,
      pileId: b.pileId ?? 1,
      enemyId: b.enemyId ?? 1,
      fail: new Map(),
      assignAt: 0,
      cursor: 0,
      invaded: new Set(b.invaded ?? []),
      migrants: new Set(b.migrants ?? []),
      banner: "",
      bannerT: 0,
      fallen: !!b.fallen,
      lost: b.lost ?? 0,
      mined: b.mined ?? 0,
      oreStruck: !!b.oreStruck,
      dirty: true,
      propsDirty: true,
      events: [],
      hourMark: Math.floor(b.hour),
      tutorialSeen: !!b.tutorialSeen,
    } as GameState;
    return s;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
