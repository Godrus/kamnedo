import { useSyncExternalStore, type ReactNode } from "react";
import {
  BedDouble,
  Beer,
  BrickWall,
  Eye,
  Flame,
  Layers,
  Pause,
  Pickaxe,
  Play,
  RotateCcw,
  RotateCw,
  ScrollText,
  Users,
  Warehouse,
  Wheat,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ROLE_LABEL, type Role, type Tool } from "./constants";
import type { Engine, HudSnap } from "./engine";

const ICONS: Record<Tool, typeof Eye> = {
  look: Eye,
  dig: Pickaxe,
  wall: BrickWall,
  bed: BedDouble,
  farm: Wheat,
  still: Beer,
  stock: Warehouse,
  torch: Flame,
  cancel: X,
};

function useSnap(engine: Engine) {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

function Need({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const bad = v > 72;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{Math.round(v)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={bad ? "h-full bg-blood" : "h-full bg-moss"} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg">{children}</span>
  );
}

export function Overlay({ engine }: { engine: Engine }) {
  const s = useSnap(engine);
  const hour = Math.floor(s.hour) % 24;
  const hh = String(hour).padStart(2, "0");
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <header className="flex items-start justify-between gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto max-w-[70%] rounded-lg border border-line bg-surface/95 px-3 py-2">
          <div className="truncate font-display text-lg leading-none">{s.name}</div>
          <div className="mt-1 text-xs text-muted">
            день {s.day} · {s.season}
            {s.night ? " · ночь" : ""} · {hh}:00
          </div>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <Speed n={1} cur={s.speed} engine={engine} />
          <Speed n={3} cur={s.speed} engine={engine} />
          <Speed n={8} cur={s.speed} engine={engine} />
          <button
            type="button"
            aria-label={s.speed === 0 ? "Пуск" : "Пауза"}
            onClick={engine.togglePause}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-fg"
          >
            {s.speed === 0 ? <Play className="size-5" /> : <Pause className="size-5" />}
          </button>
        </div>
      </header>

      <div className="pointer-events-none mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1">
        <Chip>{s.pop} в зале</Chip>
        <Chip>еда {s.food}</Chip>
        <Chip>питьё {s.drink}</Chip>
        <Chip>камень {s.stone}</Chip>
        <Chip>дерево {s.wood}</Chip>
        <Chip>руда {s.ore}</Chip>
        {s.gems > 0 ? <Chip>самоцветы {s.gems}</Chip> : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-col gap-1">
          <CamBtn label="Повернуть влево" onClick={() => engine.nudgeYaw(1)}>
            <RotateCcw className="size-5" />
          </CamBtn>
          <CamBtn label="Повернуть вправо" onClick={() => engine.nudgeYaw(-1)}>
            <RotateCw className="size-5" />
          </CamBtn>
          <CamBtn label="Ближе" onClick={() => engine.nudgeZoom(1)}>
            <ZoomIn className="size-5" />
          </CamBtn>
          <CamBtn label="Дальше" onClick={() => engine.nudgeZoom(-1)}>
            <ZoomOut className="size-5" />
          </CamBtn>
        </div>
        <div className="pointer-events-auto absolute right-3 bottom-3 flex max-w-[46%] flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => engine.setView(s.view === "volume" ? "layer" : "volume")}
            className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-fg"
          >
            <Layers className="size-4" />
            {s.view === "volume" ? "Объём" : "Слой"}
          </button>
          <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs text-muted">
            {s.view === "volume" ? "Разрез" : "Слой"}
            <input
              type="range"
              min={s.view === "volume" ? 0 : 1}
              max={s.view === "volume" ? 39 : s.maxLayer}
              value={s.view === "volume" ? s.clip : s.layer}
              onChange={(e) => engine.setSlider(Number(e.target.value))}
              className="w-full accent-ember"
            />
          </label>
        </div>
        {s.banner ? (
          <div
            className={
              s.alarm
                ? "absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-blood px-4 py-2 text-center font-display text-blood-ink"
                : "absolute top-4 left-1/2 max-w-[80%] -translate-x-1/2 rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm text-fg"
            }
          >
            {s.banner}
          </div>
        ) : null}
        {s.tutorial && !s.fallen ? <Coach engine={engine} /> : null}
      </div>

      {s.fallen ? <Fallen s={s} engine={engine} /> : null}
      {s.showRoster ? <Roster s={s} engine={engine} /> : null}
      {s.showLog ? <LogPanel s={s} engine={engine} /> : null}
      {s.selected && !s.showRoster ? <DwarfSheet s={s} engine={engine} /> : null}

      <div className="pointer-events-none px-3 pb-1 text-xs text-muted">
        <p className="truncate">{s.speed === 0 ? "Пауза. " : ""}{s.ticker}</p>
      </div>

      <div className="pointer-events-auto flex items-stretch gap-1 overflow-x-auto px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
        <SideBtn label="Дворфы" on={s.showRoster} onClick={engine.toggleRoster}>
          <Users className="size-5" />
        </SideBtn>
        <SideBtn label="Хроника" on={s.showLog} onClick={engine.toggleLog}>
          <ScrollText className="size-5" />
        </SideBtn>
        {s.roster.length >= 0
          ? (Object.keys(ICONS) as Tool[]).map((id) => {
              const Icon = ICONS[id];
              const on = s.tool === id;
              const label =
                id === "look"
                  ? "Обзор"
                  : id === "dig"
                    ? "Копать"
                    : id === "wall"
                      ? "Стена"
                      : id === "bed"
                        ? "Кровать"
                        : id === "farm"
                          ? "Ферма"
                          : id === "still"
                            ? "Брага"
                            : id === "stock"
                              ? "Склад"
                              : id === "torch"
                                ? "Огонь"
                                : "Снять";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => engine.setTool(id)}
                  className={
                    on
                      ? "flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-ember text-ember-ink"
                      : "flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-surface text-fg"
                  }
                >
                  <Icon className="size-5" />
                  <span className="text-xs leading-none">{label}</span>
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}

function Speed({ n, cur, engine }: { n: number; cur: number; engine: Engine }) {
  const on = cur === n;
  return (
    <button
      type="button"
      onClick={() => engine.setSpeed(n)}
      className={
        on
          ? "h-11 min-w-11 rounded-lg bg-ember px-2 text-sm text-ember-ink"
          : "h-11 min-w-11 rounded-lg border border-line bg-surface px-2 text-sm text-fg"
      }
    >
      ×{n}
    </button>
  );
}

function CamBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface/95 text-fg"
    >
      {children}
    </button>
  );
}

function SideBtn({
  children,
  label,
  on,
  onClick,
}: {
  children: ReactNode;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-ember text-ember-ink"
          : "flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-surface text-fg"
      }
    >
      {children}
      <span className="text-xs leading-none">{label}</span>
    </button>
  );
}

function Coach({ engine }: { engine: Engine }) {
  return (
    <div className="pointer-events-auto absolute top-3 right-3 left-16 max-w-sm rounded-lg border border-line bg-surface/95 p-3">
      <p className="font-display text-base leading-tight">Кирка уже звенит</p>
      <p className="mt-1 text-sm text-muted">
        Сначала осмотритесь: палец или мышь крутят гору. Потом «Копать» и ведите по камню. Щипок двумя пальцами приближает.
      </p>
      <button type="button" onClick={engine.dismissTutorial} className="mt-2 text-sm text-ember">
        Понятно
      </button>
    </div>
  );
}

function DwarfSheet({ s, engine }: { s: HudSnap; engine: Engine }) {
  const d = s.selected;
  if (!d) return null;
  const roles = Object.keys(ROLE_LABEL) as Role[];
  return (
    <section className="pointer-events-auto mx-2 mb-2 rounded-lg border border-line bg-surface/95 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg leading-tight">{d.name}</h2>
          <p className="text-xs text-muted">
            {ROLE_LABEL[d.role]} · {d.moodWord} · {d.task}
          </p>
        </div>
        <button type="button" aria-label="Закрыть" onClick={() => engine.select(null)} className="text-muted">
          <X className="size-5" />
        </button>
      </div>
      <p className="mt-1 text-sm text-fg">{d.thought}</p>
      <div className="mt-2 flex gap-3">
        <Need label="Голод" value={d.hunger} />
        <Need label="Жажда" value={d.thirst} />
        <Need label="Сон" value={d.sleep} />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-ember" style={{ width: `${(d.hp / d.maxHp) * 100}%` }} />
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => engine.assignRole(d.id, r)}
            className={
              d.role === r
                ? "h-9 shrink-0 rounded-full bg-ember px-3 text-xs text-ember-ink"
                : "h-9 shrink-0 rounded-full border border-line px-3 text-xs text-fg"
            }
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
    </section>
  );
}

function Roster({ s, engine }: { s: HudSnap; engine: Engine }) {
  return (
    <section className="pointer-events-auto mx-2 mb-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface/95 p-2">
      {s.roster.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => {
            engine.select(d.id);
            engine.toggleRoster();
          }}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
        >
          <span>
            <span className="block text-sm">{d.name}</span>
            <span className="text-xs text-muted">
              {ROLE_LABEL[d.role]} · {d.task}
            </span>
          </span>
          <span className="text-xs text-muted">{d.moodWord}</span>
        </button>
      ))}
    </section>
  );
}

function LogPanel({ s, engine }: { s: HudSnap; engine: Engine }) {
  return (
    <section className="pointer-events-auto mx-2 mb-2 max-h-48 overflow-y-auto rounded-lg border border-line bg-surface/95 p-3">
      <div className="mb-1 flex justify-between">
        <h2 className="font-display text-base">Хроника</h2>
        <button type="button" onClick={engine.toggleLog} className="text-muted" aria-label="Закрыть хронику">
          <X className="size-4" />
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {[...s.log].reverse().map((l) => (
          <li key={l.id} className={l.tone === "bad" ? "text-sm text-blood" : l.tone === "good" ? "text-sm text-moss" : "text-sm text-fg"}>
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fallen({ s, engine }: { s: HudSnap; engine: Engine }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/80 p-6">
      <div className="stone-card w-full max-w-sm rounded-lg border border-line p-6">
        <p className="text-xs tracking-widest text-ember">ТИШИНА</p>
        <h2 className="mt-1 font-display text-3xl leading-tight">Крепость затихла</h2>
        <p className="mt-2 text-sm text-muted">
          {s.name} продержалась {s.day} дн. Вынуто блоков: {s.mined}. Потеряно: {s.lost}. Руда: {s.ore}.
        </p>
        <button
          type="button"
          onClick={() => engine.freshFort(s.name)}
          className="mt-4 h-12 w-full rounded-lg bg-ember font-display text-lg text-ember-ink"
        >
          Новая гора
        </button>
      </div>
    </div>
  );
}
