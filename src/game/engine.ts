import * as THREE from "three";
import {
  BED,
  CHEST,
  CHUNK,
  CHUNKS_X,
  FARM,
  STILL,
  SX,
  SY,
  SZ,
  TORCH,
  WALK,
  inb,
  MAT_LABEL,
  seasonOf,
  sunAmount,
  unidx,
  type Mat,
  type Role,
  type Tool,
  type ViewMode,
} from "./constants";
import { createAudio, type AudioBus } from "./audio";
import { clearSave, readSave, writeSave } from "./save";
import {
  brushCells,
  createGame,
  moodLabel,
  moodOf,
  moveChest,
  paint,
  paintBox,
  setRole,
  step,
  taskLabel,
  type Dwarf,
  type Enemy,
  type GameState,
} from "./sim";
import { buildMeshes, cellLight, computeLight, ensureChunks, markChunks, raycast, type LightMaps } from "./world";

export type DwarfHud = {
  id: number;
  name: string;
  role: Role;
  female: boolean;
  hunger: number;
  thirst: number;
  sleep: number;
  hp: number;
  maxHp: number;
  mood: number;
  moodWord: string;
  thought: string;
  alive: boolean;
  task: string;
};

export type HudSnap = {
  name: string;
  day: number;
  hour: number;
  season: string;
  night: boolean;
  speed: number;
  pop: number;
  food: number;
  drink: number;
  stone: number;
  wood: number;
  ore: number;
  gems: number;
  tool: Tool;
  view: ViewMode;
  layer: number;
  clip: number;
  banner: string;
  alarm: boolean;
  ticker: string;
  log: { id: number; text: string; tone: string }[];
  selected: DwarfHud | null;
  roster: DwarfHud[];
  showRoster: boolean;
  showLog: boolean;
  fallen: boolean;
  lost: number;
  mined: number;
  tutorial: boolean;
  maxLayer: number;
  maxClip: number;
  inspect: InspectHud | null;
};

export type InspectHud = {
  title: string;
  body: string;
  chest: boolean;
  cell: number;
  slots: { mat: Mat; label: string; n: number; fort: number }[];
};

const VERT = `
in vec3 color;
in float aSky;
in float aTorch;
uniform float uSun;
out vec3 vCol;
out float vLight;
out float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFog = -mv.z;
  vCol = color;
  vLight = max(aTorch, aSky * uSun);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
in vec3 vCol;
in float vLight;
in float vFog;
out vec4 fragColor;
void main() {
  float l = 0.08 + 0.92 * clamp(vLight, 0.0, 1.0);
  vec3 c = vCol * l;
  float f = smoothstep(uFogNear, uFogFar, vFog);
  c = mix(c, uFog, f);
  fragColor = vec4(c, uAlpha);
}
`;

function makeTerrainMat(alpha: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: 1 },
      uFog: { value: new THREE.Color("#9aafbf") },
      uFogNear: { value: 40 },
      uFogFar: { value: 150 },
      uAlpha: { value: alpha },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    glslVersion: THREE.GLSL3,
    transparent: alpha < 1,
    depthWrite: alpha >= 1,
  });
}

function applyMesh(mesh: THREE.Mesh, data: { positions: Float32Array; colors: Float32Array; sky: Float32Array; torch: Float32Array; indices: Uint32Array }) {
  const geo = mesh.geometry;
  if (data.positions.length === 0) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
  geo.setAttribute("aSky", new THREE.BufferAttribute(data.sky, 1));
  geo.setAttribute("aTorch", new THREE.BufferAttribute(data.torch, 1));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
}

type Actor = {
  group: THREE.Group;
  limbs: THREE.Object3D[];
  tunic: THREE.MeshLambertMaterial;
  base: number;
  kind: string;
};

function makeActor(kind: "dwarf" | "guard" | "goblin" | "crawler", color: number): Actor {
  const group = new THREE.Group();
  const tunic = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({
    color: kind === "goblin" ? 0x6d8f45 : kind === "crawler" ? 0x5c3832 : 0xd7a27c,
  });
  const dark = new THREE.MeshLambertMaterial({ color: kind === "guard" ? 0xc9a15a : 0x4a3428 });
  const limbs: THREE.Object3D[] = [];
  if (kind === "crawler") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.42), tunic);
    body.position.y = 0.18;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.22), skin);
    head.position.set(0.28, 0.22, 0);
    group.add(head);
  } else {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.2), tunic);
    torso.position.y = 0.48;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.24), skin);
    head.position.y = 0.78;
    group.add(head);
    if (kind !== "goblin") {
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.12), dark);
      beard.position.set(0, 0.66, 0.12);
      group.add(beard);
    }
    if (kind === "guard") {
      const helm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), dark);
      helm.position.y = 0.92;
      group.add(helm);
    }
    const armGeo = new THREE.BoxGeometry(0.1, 0.28, 0.1);
    const legGeo = new THREE.BoxGeometry(0.1, 0.26, 0.1);
    for (const side of [-1, 1]) {
      const ap = new THREE.Group();
      ap.position.set(side * 0.22, 0.62, 0);
      const arm = new THREE.Mesh(armGeo, tunic);
      arm.position.y = -0.14;
      ap.add(arm);
      group.add(ap);
      limbs.push(ap);
      const lp = new THREE.Group();
      lp.position.set(side * 0.09, 0.28, 0);
      const leg = new THREE.Mesh(legGeo, dark);
      leg.position.y = -0.13;
      lp.add(leg);
      group.add(lp);
      limbs.push(lp);
    }
  }
  group.visible = false;
  return { group, limbs, tunic, base: color, kind };
}

const EMPTY: HudSnap = {
  name: "",
  day: 1,
  hour: 8,
  season: "весна",
  night: false,
  speed: 1,
  pop: 0,
  food: 0,
  drink: 0,
  stone: 0,
  wood: 0,
  ore: 0,
  gems: 0,
  tool: "look",
  view: "volume",
  layer: WALK,
  clip: 0,
  banner: "",
  alarm: false,
  ticker: "",
  log: [],
  selected: null,
  roster: [],
  showRoster: false,
  showLog: false,
  fallen: false,
  lost: 0,
  mined: 0,
  tutorial: true,
  maxLayer: SY - 4,
  maxClip: SZ - 1,
  inspect: null,
};

export class Engine {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.2, 380);
  private solidMat = makeTerrainMat(1);
  private waterMat = makeTerrainMat(0.78);
  private terrain = new THREE.Group();
  private chunkSolid = new Map<number, THREE.Mesh>();
  private chunkWater = new Map<number, THREE.Mesh>();
  private rebuildAll = true;
  private props = new THREE.Group();
  private markerDig: THREE.InstancedMesh;
  private markerBuild: THREE.InstancedMesh;
  private markerStock: THREE.InstancedMesh;
  private markerArea: THREE.InstancedMesh;
  private hover: THREE.LineSegments;
  private ring: THREE.Mesh;
  private actors: Actor[] = [];
  private foeActors: Actor[] = [];
  private flames: THREE.Object3D[] = [];
  private light: LightMaps | null = null;
  private hemi = new THREE.HemisphereLight(0xd5e2ea, 0x3a2a22, 0.55);
  private sun = new THREE.DirectionalLight(0xfff0d2, 1.1);
  private state: GameState;
  private tool: Tool = "look";
  private view: ViewMode = "volume";
  private layer = WALK;
  private clip = 0;
  private speed = 1;
  private lastSpeed = 1;
  private showRoster = false;
  private showLog = false;
  private selectedId: number | null = null;
  private snap: HudSnap = EMPTY;
  private snapRev = -1;
  private rev = 0;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = performance.now();
  private acc = 0;
  private yaw = 0.35;
  private pitch = 0.58;
  private dist = 28;
  private target = new THREE.Vector3(20, 12, 20);
  private right = new THREE.Vector3(1, 0, 0);
  private fwd = new THREE.Vector3(0, 0, 1);
  private held = new Set<string>();
  private qaOverride: Set<string> | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: "none" | "pan" | "orbit" | "area" = "none";
  private anchor: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
  private dragMoved = 0;
  private pinchDist = 0;
  private pinchAng = 0;
  private pinchX = 0;
  private pinchY = 0;
  private grab: { x: number; z: number; y: number } | null = null;
  private focusCell: number | null = null;
  private userMoved = false;
  private audio: AudioBus;
  private saveT = 0;
  private markT = 0;
  private coarse: boolean;
  private reduced: boolean;
  private alive = true;
  private shake = 0;
  private lastPan = 0;
  private dummy = new THREE.Object3D();
  private fogColor = new THREE.Color();
  private dayFog = new THREE.Color("#b7c6cf");
  private nightFog = new THREE.Color("#14161c");

  constructor(host: HTMLElement, opts: { name: string; seed: number; load: boolean }) {
    this.host = host;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.audio = createAudio();
    const loaded = opts.load ? readSave() : null;
    this.state = loaded ?? createGame(opts.name, opts.seed);
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.coarse,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.coarse ? 1.35 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "h-full w-full";
    host.appendChild(this.renderer.domElement);

    this.scene.add(this.terrain, this.props, this.hemi, this.sun);
    this.sun.position.set(40, 60, -12);

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.markerDig = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xc4543c, transparent: true, opacity: 0.28, depthWrite: false }),
      1600,
    );
    this.markerBuild = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xe08a3c, transparent: true, opacity: 0.32, depthWrite: false }),
      800,
    );
    this.markerStock = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.86, 0.05, 0.86),
      new THREE.MeshBasicMaterial({ color: 0x8ea56a, transparent: true, opacity: 0.55, depthWrite: false }),
      400,
    );
    this.markerArea = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xf3eadc, transparent: true, opacity: 0.42, depthWrite: false }),
      700,
    );
    this.markerDig.count = 0;
    this.markerBuild.count = 0;
    this.markerStock.count = 0;
    this.markerArea.count = 0;
    this.markerDig.frustumCulled = false;
    this.markerBuild.frustumCulled = false;
    this.markerStock.frustumCulled = false;
    this.markerArea.frustumCulled = false;
    this.scene.add(this.markerDig, this.markerBuild, this.markerStock, this.markerArea);

    this.hover = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xf3eadc }),
    );
    this.hover.visible = false;
    this.scene.add(this.hover);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.035, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xe08a3c }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    for (let i = 0; i < 14; i++) {
      const a = makeActor(i % 5 === 0 ? "guard" : "dwarf", 0xb5523a);
      this.actors.push(a);
      this.scene.add(a.group);
    }
    for (let i = 0; i < 6; i++) {
      const a = makeActor(i < 2 ? "crawler" : "goblin", i < 2 ? 0x6a4038 : 0x3f6a32);
      this.foeActors.push(a);
      this.scene.add(a.group);
    }

    const [hx, hy, hz] = this.state.anchors.hall;
    this.target.set(hx, hy, hz - 2);
    this.resize();
    this.rebuild();
    this.syncMarkers();
    this.syncProps();
    this.publish();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onHide);
    this.raf = requestAnimationFrame(this.frame);

    const probe = {
      getYaw: () => this.yaw,
      getPitch: () => this.pitch,
      getSpeed: () => this.lastPan,
      setKeys: (codes: string[]) => {
        this.qaOverride = new Set(codes);
      },
      getTarget: () => ({ x: this.target.x, y: this.target.y, z: this.target.z }),
      getRight: () => ({ x: this.right.x, y: 0, z: this.right.z }),
      getForward: () => ({ x: this.fwd.x, y: 0, z: this.fwd.z }),
      project: (x: number, y: number, z: number) => {
        this.updateCamera();
        const v = new THREE.Vector3(x, y, z).project(this.camera);
        return { x: v.x, y: v.y };
      },
      orbitBy: (dx: number, dy: number) => this.orbitBy(dx, dy),
      grabBy: (dx: number, dy: number) => {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this.armGrab(cx, cy);
        this.stickGrab(cx + dx, cy + dy);
      },
    };
    window.__controlsTest = probe;
    window.__fort = {
      snap: () => this.getSnapshot(),
      setTool: (t: Tool) => this.setTool(t),
      setSpeed: (n: number) => this.setSpeed(n),
      paintCenter: () => this.paintAt(this.host.clientWidth / 2, this.host.clientHeight / 2),
      ready: true,
    };
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.onUp);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onHide);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.host) this.host.removeChild(this.renderer.domElement);
    if (window.__fort) delete window.__fort;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => {
    if (this.snapRev !== this.rev) {
      this.snap = this.buildSnap();
      this.snapRev = this.rev;
    }
    return this.snap;
  };

  setTool(tool: Tool) {
    this.tool = tool;
    this.audio.unlock();
    this.publish();
  }

  setSpeed(n: number) {
    this.audio.unlock();
    if (n <= 0) {
      if (this.speed !== 0) this.lastSpeed = this.speed;
      this.speed = 0;
    } else {
      this.speed = n;
      this.lastSpeed = n;
    }
    this.publish();
  }

  togglePause = () => {
    this.audio.unlock();
    if (this.speed === 0) this.speed = this.lastSpeed || 1;
    else {
      this.lastSpeed = this.speed;
      this.speed = 0;
    }
    this.publish();
  };

  setView(mode: ViewMode) {
    this.view = mode;
    if (mode === "layer") {
      this.pitch = 1.25;
      this.dist = Math.max(this.dist, 42);
      this.target.y = this.layer;
    } else {
      this.pitch = Math.min(this.pitch, 0.7);
      this.target.y = WALK;
    }
    this.state.dirty = true;
    this.rebuildAll = true;
    this.publish();
  }

  panStep(screenX: number, screenY: number) {
    this.userMoved = true;
    this.target.addScaledVector(this.right, screenX * 6);
    this.target.addScaledVector(this.fwd, screenY * 6);
  }

  nudgeYaw(dir: number) {
    this.userMoved = true;
    this.yaw += dir * 0.35;
  }

  nudgeZoom(dir: number) {
    this.dist = THREE.MathUtils.clamp(this.dist * (dir > 0 ? 0.86 : 1.16), 8, 120);
  }

  setSlider(v: number) {
    if (this.view === "layer") {
      this.layer = Math.max(1, Math.min(SY - 4, Math.round(v)));
      this.target.y = this.layer;
    } else this.clip = Math.max(0, Math.min(SZ - 1, Math.round(v)));
    this.state.dirty = true;
    this.rebuildAll = true;
    this.publish();
  }

  nudgeLayer(dir: number) {
    if (this.view !== "layer") this.setView("layer");
    this.setSlider(this.layer + Math.sign(dir));
  }

  select(id: number | null) {
    this.selectedId = id;
    if (id != null) this.focusCell = null;
    if (id != null) {
      const d = this.state.dwarves.find((o) => o.id === id && o.alive);
      if (d) this.target.set(d.x, d.y + 0.4, d.z);
    }
    this.publish();
  }

  toggleRoster = () => {
    this.showRoster = !this.showRoster;
    if (this.showRoster) this.showLog = false;
    this.publish();
  };

  toggleLog = () => {
    this.showLog = !this.showLog;
    if (this.showLog) this.showRoster = false;
    this.publish();
  };

  dismissTutorial = () => {
    this.state.tutorialSeen = true;
    this.publish();
  };

  assignRole(id: number, role: Role) {
    setRole(this.state, id, role);
    this.publish();
  }

  freshFort(name: string) {
    clearSave();
    const seed = (Math.random() * 1e9) | 0;
    this.state = createGame(name, seed);
    const [hx, hy, hz] = this.state.anchors.hall;
    this.target.set(hx, hy, hz - 2);
    this.selectedId = null;
    this.speed = 1;
    this.view = "volume";
    this.clip = 0;
    this.rebuildAll = true;
    this.clearChunks();
    this.rebuild();
    this.syncProps();
    this.publish();
  }

  private publish() {
    this.rev++;
    for (const fn of this.listeners) fn();
  }

  private buildSnap(): HudSnap {
    const s = this.state;
    const alive = s.dwarves.filter((d) => d.alive);
    const toHud = (d: Dwarf): DwarfHud => ({
      id: d.id,
      name: d.name,
      role: d.role,
      female: d.female,
      hunger: d.hunger,
      thirst: d.thirst,
      sleep: d.sleep,
      hp: Math.max(0, d.hp),
      maxHp: d.maxHp,
      mood: moodOf(d),
      moodWord: moodLabel(moodOf(d)),
      thought: d.thought,
      alive: d.alive,
      task: taskLabel(d.task),
    });
    const last = s.log[s.log.length - 1];
    return {
      name: s.name,
      day: s.day,
      hour: s.hour,
      season: seasonOf(s.day),
      night: sunAmount(s.hour) < 0.25,
      speed: this.speed,
      pop: alive.length,
      food: s.stocks.food,
      drink: s.stocks.drink,
      stone: s.stocks.stone,
      wood: s.stocks.wood,
      ore: s.stocks.ore,
      gems: s.stocks.gem,
      tool: this.tool,
      view: this.view,
      layer: this.layer,
      clip: this.clip,
      banner: s.bannerT > 0 ? s.banner : "",
      alarm: /гоблин|скольз|глубине|ворот/i.test(s.banner),
      ticker: last?.text ?? "",
      log: s.log.slice(-12),
      selected: alive.find((d) => d.id === this.selectedId) ? toHud(alive.find((d) => d.id === this.selectedId)!) : null,
      roster: alive.map(toHud),
      showRoster: this.showRoster,
      showLog: this.showLog,
      fallen: s.fallen,
      lost: s.lost,
      mined: s.mined,
      tutorial: !s.tutorialSeen,
      maxLayer: SY - 4,
      maxClip: SZ - 1,
      inspect: this.inspectSnap(),
    };
  }

  private inspectSnap(): InspectHud | null {
    if (this.focusCell == null) return null;
    const { x, y, z } = unidx(this.focusCell);
    const t = this.state.grid[this.focusCell];
    const slots = (Object.keys(MAT_LABEL) as Mat[]).map((mat) => ({
      mat,
      label: MAT_LABEL[mat],
      n: this.state.chests.get(this.focusCell!)?.[mat] ?? 0,
      fort: this.state.stocks[mat],
    }));
    if (t === CHEST) {
      return { title: "Сундук", body: "Склад крепости слева, сундук справа. Положите или заберите.", chest: true, cell: this.focusCell, slots };
    }
    if (t === STILL) return { title: "Пивоварня", body: "Пивовар варит, когда на складе есть еда.", chest: false, cell: this.focusCell, slots: [] };
    if (t === BED) return { title: "Кровать", body: "Сюда ложатся, когда сморит сон.", chest: false, cell: this.focusCell, slots: [] };
    if (t === FARM) {
      const g = Math.round(this.state.growth.get(this.focusCell) ?? 0);
      return { title: "Грядка", body: `Всходы на ${g}%. Зимой стоят.`, chest: false, cell: this.focusCell, slots: [] };
    }
    if (t === TORCH) return { title: "Факел", body: "Держит зал, когда солнце село.", chest: false, cell: this.focusCell, slots: [] };
    if (this.state.stocksCells.has(this.focusCell)) return { title: "Склад", body: "Сюда носят камень, еду и дерево.", chest: false, cell: this.focusCell, slots: [] };
    return { title: "Клетка", body: `${x}, ${y}, ${z}`, chest: false, cell: this.focusCell, slots: [] };
  }

  closeInspect = () => {
    this.focusCell = null;
    this.publish();
  };

  shiftChest(mat: Mat, dir: "in" | "out", n: number) {
    if (this.focusCell == null) return;
    const msg = moveChest(this.state, this.focusCell, mat, dir, n);
    if (msg) {
      this.state.banner = msg;
      this.state.bannerT = 1.6;
    }
    this.publish();
  }

  private resize = () => {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private keys() {
    return this.qaOverride ?? this.held;
  }

  private frame = (now: number) => {
    if (!this.alive) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const keys = this.keys();
    let pan = 0;
    const panSpeed = 14;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) {
      this.target.addScaledVector(this.right, -panSpeed * dt);
      pan = panSpeed;
    }
    if (keys.has("KeyD") || keys.has("ArrowRight")) {
      this.target.addScaledVector(this.right, panSpeed * dt);
      pan = panSpeed;
    }
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
      this.target.addScaledVector(this.fwd, panSpeed * dt);
      pan = panSpeed;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
      this.target.addScaledVector(this.fwd, -panSpeed * dt);
      pan = panSpeed;
    }
    this.lastPan = pan;
    if (keys.has("KeyQ")) this.yaw += dt * 0.9;
    if (keys.has("KeyE")) this.yaw -= dt * 0.9;

    const born = ensureChunks(this.state.grid, this.state.ready, this.state.seed, this.target.x, this.target.z, 2);
    if (born.length) {
      for (const id of born) {
        const cx = (id % CHUNKS_X) * CHUNK;
        const cz = Math.floor(id / CHUNKS_X) * CHUNK;
        markChunks(this.state.dirtyChunks, cx, cz);
      }
      this.state.dirty = true;
    }

    if (this.speed > 0 && !this.state.fallen) {
      this.acc += dt * this.speed;
      let guard = 0;
      while (this.acc >= 1 / 20 && guard++ < 8) {
        step(this.state, 1 / 20);
        this.acc -= 1 / 20;
      }
      if (guard >= 8) this.acc = 0;
    }

    this.flushEvents();
    if (this.state.dirty) {
      this.state.dirty = false;
      this.rebuild();
    }
    if (this.state.propsDirty) {
      this.state.propsDirty = false;
      this.syncProps();
    }
    this.markT += dt;
    if (this.markT > 0.3) {
      this.markT = 0;
      this.syncMarkers();
    }
    this.syncActors(now / 1000);
    this.updateCamera();
    this.cullChunks();
    const sun = sunAmount(this.state.hour);
    this.solidMat.uniforms.uSun.value = sun;
    this.waterMat.uniforms.uSun.value = sun;
    this.fogColor.copy(this.nightFog).lerp(this.dayFog, Math.min(1, sun));
    this.scene.background = this.fogColor;
    this.solidMat.uniforms.uFog.value.copy(this.fogColor);
    this.waterMat.uniforms.uFog.value.copy(this.fogColor);
    this.hemi.intensity = 0.28 + sun * 0.55;
    this.sun.intensity = 0.25 + sun * 1.15;
    for (const f of this.flames) {
      f.position.y = 0.72 + Math.sin(now * 0.008 + f.id) * 0.04;
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.08;
    }

    this.saveT += dt;
    if (this.saveT > 12) {
      this.saveT = 0;
      writeSave(this.state);
    }
    if ((this.rev % 1 === 0 && this.markT === 0) || this.state.bannerT > 0) {
      /* publish on a slow cadence below */
    }
    if (Math.floor(now / 280) !== Math.floor((now - dt * 1000) / 280)) this.publish();

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  private updateCamera() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z - Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
    this.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, 1);
    this.fwd.normalize();
    // fwd × up is screen-right. up × fwd pointed screen-left and made drag feel like Dota.
    this.right.crossVectors(this.fwd, this.camera.up);
    this.right.y = 0;
    this.right.normalize();
    this.target.x = THREE.MathUtils.clamp(this.target.x, 2, SX - 2);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 2, SZ - 2);
  }

  private flushEvents() {
    const evs = this.state.events;
    if (!evs.length) return;
    for (const e of evs) {
      if (e.s === "dig") this.audio.dig();
      if (e.s === "build") this.audio.build();
      if (e.s === "good") this.audio.good();
      if (e.s === "hit") {
        this.audio.hit();
        this.shake = 0.15;
      }
      if (e.s === "alert") {
        this.audio.alert();
        this.shake = 0.25;
        if (navigator.vibrate) navigator.vibrate(40);
      }
      if (e.s === "death") this.audio.death();
    }
    this.state.events.length = 0;
  }

  private rebuild() {
    this.light = computeLight(this.state.grid);
    const keys: number[] = [];
    if (this.rebuildAll || this.state.dirtyChunks.size === 0) {
      for (let i = 0; i < this.state.ready.length; i++) if (this.state.ready[i]) keys.push(i);
    } else {
      for (const k of this.state.dirtyChunks) if (this.state.ready[k]) keys.push(k);
    }
    this.rebuildAll = false;
    this.state.dirtyChunks.clear();
    const layer = this.view === "layer" ? this.layer : null;
    const clip = this.view === "volume" ? this.clip : 0;
    for (const key of keys) {
      const cx = key % CHUNKS_X;
      const cz = Math.floor(key / CHUNKS_X);
      const built = buildMeshes(
        this.state.grid,
        this.light,
        this.state.growth,
        layer,
        { x0: cx * CHUNK, x1: cx * CHUNK + CHUNK - 1, z0: cz * CHUNK, z1: cz * CHUNK + CHUNK - 1 },
        this.state.ready,
        clip,
      );
      this.putChunk(key, built);
    }
  }

  private putChunk(key: number, built: ReturnType<typeof buildMeshes>) {
    let solid = this.chunkSolid.get(key);
    if (!solid) {
      solid = new THREE.Mesh(new THREE.BufferGeometry(), this.solidMat);
      this.chunkSolid.set(key, solid);
      this.terrain.add(solid);
    }
    applyMesh(solid, built.solid);
    let water = this.chunkWater.get(key);
    if (!water) {
      water = new THREE.Mesh(new THREE.BufferGeometry(), this.waterMat);
      this.chunkWater.set(key, water);
      this.terrain.add(water);
    }
    applyMesh(water, built.water);
  }

  private clearChunks() {
    for (const mesh of this.chunkSolid.values()) {
      mesh.geometry.dispose();
      this.terrain.remove(mesh);
    }
    for (const mesh of this.chunkWater.values()) {
      mesh.geometry.dispose();
      this.terrain.remove(mesh);
    }
    this.chunkSolid.clear();
    this.chunkWater.clear();
  }

  private cullChunks() {
    const ccx = Math.floor(this.target.x / CHUNK);
    const ccz = Math.floor(this.target.z / CHUNK);
    for (const [key, mesh] of this.chunkSolid) {
      const cx = key % CHUNKS_X;
      const cz = Math.floor(key / CHUNKS_X);
      const near = Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) <= 4;
      const has = (mesh.geometry.getAttribute("position")?.count ?? 0) > 0;
      mesh.visible = near && has;
      const water = this.chunkWater.get(key);
      if (water) {
        const wh = (water.geometry.getAttribute("position")?.count ?? 0) > 0;
        water.visible = near && wh;
      }
    }
  }

  private syncMarkers() {
    this.fillMarks(this.markerDig, [...this.state.digs.keys()], 0.5, 1.04);
    const builds = [...this.state.builds.keys()];
    this.fillMarks(this.markerBuild, builds, 0.5, 1.02);
    this.fillMarks(this.markerStock, [...this.state.stocksCells], 0.06, 1);
  }

  private fillMarks(mesh: THREE.InstancedMesh, cells: number[], yLift: number, scale: number) {
    const max = (mesh.instanceMatrix.array as Float32Array).length / 16;
    const use = Math.min(cells.length, max);
    for (let i = 0; i < use; i++) {
      const { x, y, z } = unidx(cells[i]);
      this.dummy.position.set(x + 0.5, y + yLift, z + 0.5);
      this.dummy.scale.setScalar(scale);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.count = use;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private syncProps() {
    for (const c of [...this.props.children]) {
      this.props.remove(c);
    }
    this.flames = [];
    const grid = this.state.grid;
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x6a3e34 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    const metal = new THREE.MeshLambertMaterial({ color: 0xb9a48a });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa14a });
    const bedGeo = new THREE.BoxGeometry(0.7, 0.16, 0.4);
    const stillGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.38, 8);
    const stick = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5);
    const flameGeo = new THREE.SphereGeometry(0.09, 6, 5);
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t !== BED && t !== STILL && t !== TORCH && t !== FARM && t !== CHEST) continue;
      const { x, y, z } = unidx(i);
      if (t === BED) {
        const m = new THREE.Mesh(bedGeo, bedMat);
        m.position.set(x + 0.5, y + 0.1, z + 0.5);
        this.props.add(m);
      } else if (t === CHEST) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.46), woodMat);
        body.position.set(x + 0.5, y + 0.22, z + 0.5);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.5), metal);
        lid.position.set(x + 0.5, y + 0.46, z + 0.5);
        this.props.add(body, lid);
      } else if (t === STILL) {
        const m = new THREE.Mesh(stillGeo, woodMat);
        m.position.set(x + 0.5, y + 0.2, z + 0.5);
        this.props.add(m);
      } else if (t === TORCH) {
        const m = new THREE.Mesh(stick, woodMat);
        m.position.set(x + 0.5, y + 0.35, z + 0.5);
        const f = new THREE.Mesh(flameGeo, flameMat);
        f.position.set(0, 0.42, 0);
        m.add(f);
        this.flames.push(f);
        this.props.add(m);
      }
    }
    const colors: Record<string, number> = { stone: 0x8b8176, ore: 0xc47a3a, gem: 0x3cafa6, wood: 0x6b4a2c, food: 0x6e8b4f, drink: 0x8a5a32 };
    const gem = new THREE.OctahedronGeometry(0.12);
    for (const p of this.state.piles) {
      const m = new THREE.Mesh(gem, new THREE.MeshLambertMaterial({ color: colors[p.mat] ?? 0x888888 }));
      m.position.set(p.x + 0.5, p.y + 0.16, p.z + 0.5);
      this.props.add(m);
    }
    const crate = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const stock = [...this.state.stocksCells];
    const kinds = [
      ["stone", this.state.stocks.stone],
      ["wood", this.state.stocks.wood],
      ["food", this.state.stocks.food],
    ] as const;
    kinds.forEach((entry, n) => {
      const cell = stock[n];
      if (cell === undefined || entry[1] <= 0) return;
      const { x, y, z } = unidx(cell);
      const m = new THREE.Mesh(crate, new THREE.MeshLambertMaterial({ color: colors[entry[0]] }));
      const sc = 0.45 + Math.min(1.1, entry[1] / 40);
      m.scale.setScalar(sc);
      m.position.set(x + 0.5, y + 0.18 * sc, z + 0.5);
      this.props.add(m);
    });
    void metal;
  }

  private syncActors(time: number) {
    const sun = sunAmount(this.state.hour);
    const place = (pool: Actor[], list: { x: number; y: number; z: number; facing: number; moving: boolean; alive: boolean; color?: number; kind?: string; hp: number }[]) => {
      let i = 0;
      for (const e of list) {
        if (!e.alive) continue;
        const a = pool[i++];
        if (!a) break;
        a.group.visible = true;
        a.group.position.set(e.x, e.y, e.z);
        a.group.rotation.y = e.facing;
        const swing = !this.reduced && e.moving ? Math.sin(time * 9 + i) * 0.55 : 0;
        a.limbs.forEach((limb, n) => {
          limb.rotation.x = n % 2 === 0 ? swing : -swing;
        });
        if (this.light) {
          const L = Math.max(0.38, cellLight(this.light, e.x, e.y, e.z, sun));
          const base = e.color ?? a.base;
          a.tunic.color.setHex(base);
          a.tunic.color.multiplyScalar(0.55 + 0.45 * L);
        }
      }
      for (; i < pool.length; i++) pool[i].group.visible = false;
    };
    const dwarves = this.state.dwarves.map((d) => ({ ...d, kind: d.role === "guard" ? "guard" : "dwarf" }));
    // Keep guard visual if role is guard — retint only. Actors are generic.
    place(this.actors, dwarves);
    place(
      this.foeActors,
      this.state.enemies.map((e: Enemy) => ({ ...e, moving: e.path.length > 0, color: e.kind === "crawler" ? 0x6a4038 : 0x4d7a3a })),
    );
    const sel = this.state.dwarves.find((d) => d.id === this.selectedId && d.alive);
    if (sel) {
      this.ring.visible = true;
      this.ring.position.set(sel.x, sel.y + 0.05, sel.z);
    } else this.ring.visible = false;
  }

  private rayFrom(cx: number, cy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.ray;
  }

  private pickBlock(cx: number, cy: number) {
    const ray = this.rayFrom(cx, cy);
    return raycast(
      this.state.grid,
      ray.origin.x,
      ray.origin.y,
      ray.origin.z,
      ray.direction.x,
      ray.direction.y,
      ray.direction.z,
      140,
      this.view === "layer" ? this.layer : null,
      this.view === "volume" ? this.clip : 0,
    );
  }

  private showBrush(cells: { x: number; y: number; z: number }[]) {
    const mesh = this.markerArea;
    const max = (mesh.instanceMatrix.array as Float32Array).length / 16;
    const use = Math.min(cells.length, max);
    for (let i = 0; i < use; i++) {
      const c = cells[i];
      this.dummy.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      this.dummy.scale.set(1.04, 1.04, 1.04);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.count = use;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private panBy(dx: number, dy: number) {
    const h = Math.max(1, this.host.clientHeight);
    const scale = (this.dist / h) * 1.15;
    // Grab, not Dota: the ground follows the finger.
    this.target.addScaledVector(this.right, -dx * scale);
    this.target.addScaledVector(this.fwd, dy * scale);
  }

  private planePoint(cx: number, cy: number, y: number) {
    this.updateCamera();
    const ray = this.rayFrom(cx, cy);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  private armGrab(cx: number, cy: number) {
    const hit = this.planePoint(cx, cy, this.target.y);
    this.grab = hit ? { x: hit.x, z: hit.z, y: this.target.y } : null;
  }

  /** Keep the grabbed ground point under the finger. */
  private stickGrab(cx: number, cy: number) {
    if (!this.grab) {
      return false;
    }
    for (let i = 0; i < 2; i++) {
      const hit = this.planePoint(cx, cy, this.grab.y);
      if (!hit) return false;
      this.target.x += this.grab.x - hit.x;
      this.target.z += this.grab.z - hit.z;
    }
    return true;
  }

  /** Drag follows the mountain: right and up both pull the view with the finger. */
  private orbitBy(dx: number, dy: number) {
    this.userMoved = true;
    this.yaw -= dx * 0.012;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.008, 0.18, 1.35);
  }

  private beginPinch() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this.pinchAng = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    this.pinchX = (pts[0].x + pts[1].x) / 2;
    this.pinchY = (pts[0].y + pts[1].y) / 2;
    this.armGrab(this.pinchX, this.pinchY);
    this.gesture = "none";
    this.anchor = null;
    this.markerArea.count = 0;
  }

  private paintAt(cx: number, cy: number) {
    const hit = this.pickBlock(cx, cy);
    if (!hit) return;
    const msg = paint(this.state, this.tool, hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz);
    if (msg) {
      this.state.banner = msg;
      this.state.bannerT = 1.8;
    }
    this.syncMarkers();
    this.publish();
  }

  private inspectAt(cx: number, cy: number) {
    const ray = this.rayFrom(cx, cy);
    const dwarf = this.pickDwarf(ray);
    if (dwarf) {
      this.selectedId = dwarf.id;
      this.focusCell = null;
      this.publish();
      return;
    }
    const hit = this.pickBlock(cx, cy);
    if (!hit) {
      this.focusCell = null;
      this.hover.visible = false;
      this.publish();
      return;
    }
    const spots = [
      [hit.x, hit.y, hit.z],
      [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz],
      [hit.x, hit.y + 1, hit.z],
    ];
    this.focusCell = null;
    for (const [x, y, z] of spots) {
      if (!inb(x, y, z)) continue;
      const i = x + SX * (y + SY * z);
      const t = this.state.grid[i];
      if (t === CHEST || t === BED || t === STILL || t === TORCH || t === FARM || this.state.stocksCells.has(i)) {
        this.focusCell = i;
        this.selectedId = null;
        break;
      }
    }
    this.hover.visible = true;
    this.hover.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.publish();
  }

  private pickDwarf(ray: THREE.Ray) {
    let best: Dwarf | null = null;
    let bestD = 0.72;
    for (const d of this.state.dwarves) {
      if (!d.alive) continue;
      const dx = d.x - ray.origin.x;
      const dy = d.y + 0.5 - ray.origin.y;
      const dz = d.z - ray.origin.z;
      const t = dx * ray.direction.x + dy * ray.direction.y + dz * ray.direction.z;
      if (t < 0) continue;
      const px = ray.origin.x + ray.direction.x * t;
      const py = ray.origin.y + ray.direction.y * t;
      const pz = ray.origin.z + ray.direction.z * t;
      const dist = Math.hypot(px - d.x, py - (d.y + 0.5), pz - d.z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  private onDown = (e: PointerEvent) => {
    this.audio.unlock();
    this.userMoved = true;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragMoved = 0;
    if (this.pointers.size >= 2) {
      this.beginPinch();
      return;
    }
    if (e.button === 1 || e.button === 2 || e.altKey) {
      this.gesture = "pan";
      this.armGrab(e.clientX, e.clientY);
      return;
    }
    if (this.tool === "look") {
      // Touch follows map conventions: one finger grabs the world and moves
      // it with the finger. Desktop keeps the more precise orbit gesture.
      this.gesture = this.coarse ? "pan" : "orbit";
      if (this.coarse) this.armGrab(e.clientX, e.clientY);
      return;
    }
    this.gesture = "area";
    const hit = this.pickBlock(e.clientX, e.clientY);
    this.anchor = hit;
    if (hit) {
      this.hover.visible = true;
      this.hover.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.showBrush(brushCells(hit, hit, hit.nx, hit.ny, hit.nz));
    }
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (!this.coarse && this.gesture === "none") this.preview(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    this.dragMoved += Math.hypot(dx, dy);
    if (this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      if (this.pinchDist > 8) {
        this.dist = THREE.MathUtils.clamp(this.dist * (this.pinchDist / Math.max(8, dist)), 8, 120);
      }
      if (!this.stickGrab(cx, cy)) this.panBy(cx - this.pinchX, cy - this.pinchY);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      let twist = angle - this.pinchAng;
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      if (Math.abs(twist) > 0.002) this.yaw -= twist * 0.9;
      this.pinchDist = dist;
      this.pinchAng = angle;
      this.pinchX = cx;
      this.pinchY = cy;
      return;
    }
    if (this.gesture === "pan") {
      if (!this.stickGrab(e.clientX, e.clientY)) this.panBy(dx, dy);
    } else if (this.gesture === "orbit") this.orbitBy(dx, dy); else if (this.gesture === "area" && this.anchor) {
      const hit = this.pickBlock(e.clientX, e.clientY) ?? this.anchor;
      this.hover.visible = true;
      this.hover.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.showBrush(brushCells(this.anchor, hit, this.anchor.nx, this.anchor.ny, this.anchor.nz));
    }
  };

  private onUp = (e: PointerEvent) => {
    const was = this.gesture;
    const moved = this.dragMoved;
    const anchor = this.anchor;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size >= 2) this.beginPinch();
    if (this.pointers.size > 0) return;
    this.gesture = "none";
    this.anchor = null;
    this.grab = null;
    this.markerArea.count = 0;
    this.markerArea.instanceMatrix.needsUpdate = true;
    if (was === "area" && anchor) {
      const hit = this.pickBlock(e.clientX, e.clientY) ?? anchor;
      const msg = paintBox(this.state, this.tool, anchor, hit, anchor.nx, anchor.ny, anchor.nz);
      if (msg) {
        this.state.banner = msg;
        this.state.bannerT = 1.8;
      }
      this.syncMarkers();
      this.publish();
    } else if ((was === "orbit" || was === "pan") && moved < 10) {
      this.inspectAt(e.clientX, e.clientY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.userMoved = true;
    this.armGrab(e.clientX, e.clientY);
    this.dist = THREE.MathUtils.clamp(this.dist * (e.deltaY > 0 ? 1.08 : 0.92), 8, 120);
    this.stickGrab(e.clientX, e.clientY);
    this.grab = null;
  };

  private preview(cx: number, cy: number) {
    const hit = this.pickBlock(cx, cy);
    if (!hit) {
      this.hover.visible = false;
      return;
    }
    this.hover.visible = true;
    this.hover.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    this.held.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) this.togglePause();
    }
    const byKey: Record<string, Tool> = {
      Digit1: "look",
      Digit2: "dig",
      Digit3: "wall",
      Digit4: "bed",
      Digit5: "farm",
      Digit6: "still",
      Digit7: "stock",
      Digit0: "chest",
      Digit8: "torch",
      Digit9: "cancel",
    };
    if (byKey[e.code]) this.setTool(byKey[e.code]);
    if (e.code === "BracketLeft" || e.code === "Comma") this.setSlider((this.view === "layer" ? this.layer : this.clip) - 1);
    if (e.code === "BracketRight" || e.code === "Period") this.setSlider((this.view === "layer" ? this.layer : this.clip) + 1);
    if (e.code === "Escape") this.select(null);
    if (e.code === "KeyF") this.setView(this.view === "volume" ? "layer" : "volume");
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  private onHide = () => {
    if (document.hidden) writeSave(this.state);
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getPitch: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getTarget: () => { x: number; y: number; z: number };
      getRight: () => { x: number; y: number; z: number };
      getForward: () => { x: number; y: number; z: number };
      project: (x: number, y: number, z: number) => { x: number; y: number };
      orbitBy: (dx: number, dy: number) => void;
      grabBy: (dx: number, dy: number) => void;
    };
    __fort?: {
      snap: () => HudSnap;
      setTool: (t: Tool) => void;
      setSpeed: (n: number) => void;
      paintCenter: () => void;
      ready: boolean;
    };
  }
}
