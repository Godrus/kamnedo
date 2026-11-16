export function createAudio() {
  let ctx: AudioContext | null = null;
  const tone = (freq: number, dur: number, type: OscillatorType, gain = 0.035) => {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  };
  return {
    unlock() {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
    },
    dig() {
      tone(70, 0.07, "square", 0.02);
    },
    build() {
      tone(210, 0.09, "triangle", 0.03);
    },
    good() {
      tone(520, 0.08, "triangle", 0.028);
    },
    hit() {
      tone(140, 0.08, "sawtooth", 0.03);
    },
    alert() {
      tone(420, 0.12, "square", 0.03);
      setTimeout(() => tone(300, 0.16, "square", 0.025), 130);
    },
    death() {
      tone(90, 0.28, "triangle", 0.04);
    },
  };
}

export type AudioBus = ReturnType<typeof createAudio>;
