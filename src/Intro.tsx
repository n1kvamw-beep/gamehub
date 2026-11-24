import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";

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

// Som curto de abertura (só toca se o navegador deixar tocar sem toque do utilizador).
function jingle() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state !== "running") { ctx.close(); return; }
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    [130.8, 196, 261.6].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 0 ? "sawtooth" : "triangle"; o.frequency.setValueAtTime(f * 0.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.5); o.connect(g); o.start(t); o.stop(t + 2.2); });
    window.setTimeout(() => ctx.close(), 2500);
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
      <div className="intro-mark"><Gamepad2 size={64} strokeWidth={2.2}/></div>
      <div className="intro-word">{"GameHub".split("").map((c, i) => <span key={i} style={{ animationDelay: `${0.75 + i * 0.07}s` }} className={i >= 4 ? "hub" : ""}>{c}</span>)}</div>
      <div className="intro-sweep"/>
    </div>
    <div className="intro-skip">Toca para saltar</div>
  </div>;
}
