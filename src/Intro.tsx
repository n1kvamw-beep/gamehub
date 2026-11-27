import { useEffect, useState } from "react";

const SEEN = "gh-intro-seen";
const skip = () => {
  try {
    if (sessionStorage.getItem(SEEN)) return true;
    const q = new URLSearchParams(location.search);
    if (q.has("comando") || q.has("sala")) return true; // comando e salas: entrar logo
    if (typeof window.matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch { /* mostra na mesma */ }
  return false;
};

// Som de abertura: pancada grave suave, acorde quente a abrir e um arpejo de "sinos" com eco.
export function playJingle(ctx: BaseAudioContext, t0 = 0) {
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  const wet = ctx.createGain(); wet.gain.value = 0.32; // eco curto e suave
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.21;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2600;
  wet.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(out);
  const env = (g: GainNode, t: number, peak: number, atk: number, dec: number) => {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
  };
  const tone = (freq: number, t: number, peak: number, atk: number, dec: number, type: OscillatorType = "sine", detune = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    env(g, t, peak, atk, dec); o.connect(g); g.connect(out); g.connect(wet); o.start(t); o.stop(t + atk + dec + 0.05);
  };
  // pancada grave
  const k = ctx.createOscillator(), kg = ctx.createGain(); k.type = "sine"; k.frequency.setValueAtTime(110, t0 + 0.12); k.frequency.exponentialRampToValueAtTime(45, t0 + 0.7);
  env(kg, t0 + 0.12, 0.5, 0.02, 0.7); k.connect(kg); kg.connect(out); k.start(t0 + 0.12); k.stop(t0 + 0.95);
  // acorde (dó maior com nona) que abre com um filtro
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7; lp.frequency.setValueAtTime(350, t0 + 0.2); lp.frequency.exponentialRampToValueAtTime(3200, t0 + 1.5); lp.connect(out); lp.connect(wet);
  for (const f of [130.8, 196, 261.6, 329.6, 493.9]) for (const d of [-6, 6]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = f; o.detune.value = d;
    env(g, t0 + 0.2, 0.05, 0.55, 1.9); o.connect(g); g.connect(lp); o.start(t0 + 0.2); o.stop(t0 + 2.8);
  }
  // arpejo de sinos quando as letras aparecem
  [[659.3, 0.78], [784, 0.9], [1046.5, 1.02], [1318.5, 1.14], [1568, 1.32]].forEach(([f, dt], i) => {
    tone(f, t0 + dt, 0.13 - i * 0.012, 0.012, 1.3);
    tone(f * 2.01, t0 + dt, 0.035, 0.008, 0.6); // brilho
  });
  // última cintilação
  tone(2093, t0 + 1.55, 0.05, 0.01, 1.0);
  tone(1568, t0 + 1.58, 0.06, 0.01, 1.1);
}

function jingle() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state !== "running") { ctx.close(); return; } // sem permissão para tocar: fica em silêncio
    playJingle(ctx, ctx.currentTime);
    window.setTimeout(() => ctx.close(), 3500);
  } catch { /* sem som */ }
}

// Abertura do app ao estilo de um genérico de cinema: marca, letras a entrar, brilho e saída.
export default function Intro() {
  const [on, setOn] = useState(() => !skip());
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!on) return;
    try { sessionStorage.setItem(SEEN, "1"); } catch { /* ignora */ }
    jingle();
    const a = window.setTimeout(() => setLeaving(true), 2500);
    const b = window.setTimeout(() => setOn(false), 3100);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [on]);
  if (!on) return null;
  const end = () => { setLeaving(true); window.setTimeout(() => setOn(false), 450); };
  return <div className={`intro${leaving ? " leave" : ""}`} onClick={end} role="presentation" aria-hidden="true">
    <div className="intro-glow"/>
    <div className="intro-stage">
      <div className="intro-mark"><img src="/icons/logo.svg" alt="" width={96} height={96}/></div>
      <div className="intro-word">{"GameHub".split("").map((c, i) => <span key={i} style={{ animationDelay: `${0.75 + i * 0.07}s` }} className={i >= 4 ? "hub" : ""}>{c}</span>)}</div>
      <div className="intro-sweep"/>
    </div>
    <div className="intro-skip">Toca para saltar</div>
  </div>;
}
