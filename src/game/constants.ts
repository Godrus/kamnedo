export const SX = 128;
export const SY = 22;
export const SZ = 128;
export const CHUNK = 16;
export const CHUNKS_X = SX / CHUNK;
export const CHUNKS_Z = SZ / CHUNK;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const ORE = 4;
export const GEM = 5;
export const LOG = 6;
export const LEAF = 7;
export const WATER = 8;
export const MAGMA = 9;
export const WALL = 10;
export const FARM = 11;
export const BED = 12;
export const STILL = 13;
export const TORCH = 14;
export const CHEST = 15;

/** Air cell dwarves walk in inside the hall. */
export const WALK = 12;
export const ROOM = { x0: 56, x1: 68, z0: 60, z1: 70 };

export type Mat = "stone" | "ore" | "gem" | "wood" | "food" | "drink";
export type Role = "miner" | "mason" | "farmer" | "brewer" | "hauler" | "guard";
export type Tool =
  | "look"
  | "dig"
  | "wall"
  | "bed"
  | "farm"
  | "still"
  | "stock"
  | "chest"
  | "torch"
  | "cancel";
export type ViewMode = "volume" | "layer";

export const ROLE_LABEL: Record<Role, string> = {
  miner: "Рудокоп",
  mason: "Каменщик",
  farmer: "Земледел",
  brewer: "Пивовар",
  hauler: "Носильщик",
  guard: "Страж",
};

export const MAT_LABEL: Record<Mat, string> = {
  stone: "камень",
  ore: "руда",
  gem: "самоцветы",
  wood: "дерево",
  food: "еда",
  drink: "питьё",
};

export const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "look", label: "Обзор", key: "1" },
  { id: "dig", label: "Копать", key: "2" },
  { id: "wall", label: "Стена", key: "3" },
  { id: "bed", label: "Кровать", key: "4" },
  { id: "farm", label: "Ферма", key: "5" },
  { id: "still", label: "Брага", key: "6" },
  { id: "stock", label: "Склад", key: "7" },
  { id: "chest", label: "Сундук", key: "0" },
  { id: "torch", label: "Факел", key: "8" },
  { id: "cancel", label: "Снять", key: "9" },
];

export const SEASONS = ["весна", "лето", "осень", "зима"] as const;

export const SAVE_KEY = "kamnedol-save-v2";

// At x1 the calendar advances six in-game minutes per real second.
// Movement, hauling and combat remain real-time; only the calendar is slowed
// so a full day is readable instead of disappearing in a few seconds.
export const GAME_HOURS_PER_REAL_SECOND = 0.1;

export function chunkIndex(cx: number, cz: number) {
  return cx + CHUNKS_X * cz;
}

export function idx(x: number, y: number, z: number) {
  return x + SX * (y + SY * z);
}

export function unidx(i: number) {
  const x = i % SX;
  const y = Math.floor(i / SX) % SY;
  const z = Math.floor(i / (SX * SY));
  return { x, y, z };
}

export function inb(x: number, y: number, z: number) {
  return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
}

export function isCube(t: number) {
  return t >= GRASS && t <= FARM;
}

export function solidFloor(t: number) {
  return t === GRASS || t === DIRT || t === STONE || t === ORE || t === GEM || t === WALL || t === FARM;
}

export function passable(t: number) {
  return t === AIR || t === BED || t === STILL || t === TORCH;
}

export function blocksLight(t: number) {
  return t === GRASS || t === DIRT || t === STONE || t === ORE || t === GEM || t === WALL || t === FARM || t === MAGMA || t === WATER || t === CHEST;
}

export function diggable(t: number) {
  return (
    t === GRASS ||
    t === DIRT ||
    t === STONE ||
    t === ORE ||
    t === GEM ||
    t === LOG ||
    t === LEAF ||
    t === WALL ||
    t === FARM
  );
}

export function goodStand(grid: Uint8Array, x: number, y: number, z: number) {
  if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY) return false;
  if (!passable(grid[idx(x, y, z)])) return false;
  const below = grid[idx(x, y - 1, z)];
  return solidFloor(below);
}

export const BLOCK_COLOR: Record<number, number> = {
  [GRASS]: 0x6e8f45,
  [DIRT]: 0x6b4630,
  [STONE]: 0x8b8176,
  [ORE]: 0xc47a3a,
  [GEM]: 0x3cafa6,
  [LOG]: 0x5a3a24,
  [LEAF]: 0x3e6a34,
  [WATER]: 0x2c6e90,
  [MAGMA]: 0xe25822,
  [WALL]: 0xa39482,
  [FARM]: 0x5d7a38,
};

export function seasonOf(day: number) {
  return SEASONS[Math.floor((Math.max(1, day) - 1) / 4) % 4];
}

export function sunAmount(hour: number) {
  if (hour < 5 || hour > 21) return 0.06;
  const x = (hour - 5) / 16;
  return 0.06 + 0.94 * Math.sin(Math.min(1, Math.max(0, x)) * Math.PI);
}

export function emptyMats(): Record<Mat, number> {
  return { stone: 0, ore: 0, gem: 0, wood: 0, food: 0, drink: 0 };
}
