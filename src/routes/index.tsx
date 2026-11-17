import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pickaxe, Smartphone, TreePine } from "lucide-react";
import { clearSave, hasSave } from "../game/save";
import { Overlay } from "../game/ui";
import type { Engine } from "../game/engine";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [screen, setScreen] = useState<"embark" | "play">("embark");
  const [name, setName] = useState("Горн-на-Жиле");
  const [seed, setSeed] = useState(260411);
  const [load, setLoad] = useState(false);
  const [canLoad, setCanLoad] = useState(false);

  useEffect(() => {
    setCanLoad(hasSave());
  }, [screen]);

  if (screen === "play") {
    return <Play name={name} seed={seed} load={load} />;
  }

  return (
    <main className="h-dvh overflow-y-auto bg-bg text-fg">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 py-10">
        <p className="text-xs tracking-[0.22em] text-ember">ТРИ ИЗМЕРЕНИЯ · ОДНА ГОРА</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Камнедол</h1>
        <p className="mt-4 text-base text-muted">
          Крепость, которую ведут пальцем. Копайте залы, кормите дворфов, жгите факелы и не проспите шорох в глубине.
          Одинаково на телефоне и на компьютере.
        </p>
        <label className="mt-6 text-sm text-muted" htmlFor="fort-name">
          Название
        </label>
        <input
          id="fort-name"
          value={name}
          maxLength={28}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-12 w-full rounded-lg border border-line bg-surface px-3 text-base text-fg outline-none"
        />
        <button
          type="button"
          onClick={() => {
            clearSave();
            setLoad(false);
            setSeed((Math.random() * 1e9) | 0);
            setScreen("play");
          }}
          className="mt-4 flex h-14 items-center justify-center gap-2 rounded-lg bg-ember font-display text-xl text-ember-ink"
        >
          <Pickaxe className="size-5" />
          Врубить кирки
        </button>
        {canLoad ? (
          <button
            type="button"
            onClick={() => {
              setLoad(true);
              setScreen("play");
            }}
            className="mt-2 h-12 rounded-lg border border-line bg-surface text-fg"
          >
            Вернуться в зал
          </button>
        ) : null}
        <ul className="mt-8 flex flex-col gap-3 text-sm text-muted">
          <li className="flex gap-3">
            <Pickaxe className="mt-0.5 size-4 shrink-0 text-ember" />
            Зажмите склон и протяните прямоугольник — так помечают копку. Снять убирает постройки в области.
          </li>
          <li className="flex gap-3">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-ember" />
            Один палец крутит гору за пальцем. Два пальца сдвигают и приближают. Правая кнопка мыши и WASD — сдвиг карты.
          </li>
          <li className="flex gap-3">
            <TreePine className="mt-0.5 size-4 shrink-0 text-ember" />
            Слой режет гору как чертёж. Объём показывает залы целиком. Зимой грядки встают.
          </li>
        </ul>
      </div>
    </main>
  );
}

function Play({ name, seed, load }: { name: string; seed: number; load: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    if (!host) return;
    let dead = false;
    let eng: Engine | null = null;
    void import("../game/engine").then(({ Engine: Fort }) => {
      if (dead) return;
      eng = new Fort(host, { name, seed, load });
      setEngine(eng);
    });
    return () => {
      dead = true;
      eng?.dispose();
      setEngine(null);
    };
  }, [host, name, seed, load]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <div ref={setHost} className="game-host absolute inset-0" />
      {engine ? <Overlay engine={engine} /> : <p className="absolute bottom-6 left-5 text-sm text-muted">Режем породу…</p>}
    </div>
  );
}
