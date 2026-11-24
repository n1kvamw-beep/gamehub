import { useEffect, useState } from "react";
import { Gamepad2, Joystick, Smartphone, Users, BellRing, Download, X, ArrowRight } from "lucide-react";

const KEY = "gh-tour-seen";
const slides = [
  { Icon: Gamepad2, color: "#2fc977", title: "Bem-vindo ao GameHub!", text: "A tua biblioteca de jogos, sempre à mão — diretamente no navegador, sem instalar nada." },
  { Icon: Joystick, color: "#f5b942", title: "Joga de tudo", text: "Jogos HTML5, clássicos de consola e arcade: NES, Mega Drive, PlayStation, PSP e muito mais." },
  { Icon: Smartphone, color: "#4aa8ff", title: "O telemóvel é o teu comando", text: "Liga o telemóvel ao jogo com um código e usa-o como comando, com botões no ecrã." },
  { Icon: Users, color: "#ff6b9d", title: "Joga com amigos", text: "Multiplayer local para até 3 jogadores ou online, numa sala com código que partilhas." },
  { Icon: BellRing, color: "#b78cff", title: "Fica a par das novidades", text: "Ativa os avisos e recebe uma notificação quando houver jogos novos, melhorias ou correções." },
  { Icon: Download, color: "#2fc977", title: "Instala o app", text: "Adiciona o GameHub ao ecrã inicial e abre-o como uma app a sério. Boa diversão!" },
];

function shouldAutoShow() {
  try {
    if (localStorage.getItem(KEY)) return false;
    const q = new URLSearchParams(location.search);
    if (q.has("comando") || q.has("sala")) return false;
  } catch { /* ignora */ }
  return true;
}

export default function Tour() {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    let t = 0;
    if (shouldAutoShow()) {
      // espera pela abertura (Netflix) terminar
      const introShown = !!document.querySelector(".intro");
      t = window.setTimeout(() => { setI(0); setOn(true); }, introShown ? 3300 : 600);
    }
    const open = () => { setI(0); setOut(false); setOn(true); };
    window.addEventListener("gh-tour", open);
    return () => { window.clearTimeout(t); window.removeEventListener("gh-tour", open); };
  }, []);

  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignora */ }
    setOut(true);
    window.setTimeout(() => setOn(false), 250);
  };
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!on) return null;
  const last = i === slides.length - 1;
  const next = () => (last ? close() : setI(i + 1));
  const s = slides[i];
  const Icon = s.Icon;
  return <div className={`tour ${out ? "out" : ""}`} role="dialog" aria-modal="true" aria-label="Apresentação do GameHub" style={{ ["--tc" as string]: s.color }}>
    <div className="tour-top">
      <div className="tour-bars">{slides.map((_, n) => <span key={n} className={n < i ? "done" : n === i ? "now" : ""}/>)}</div>
      <button className="tour-x" onClick={close} aria-label="Fechar apresentação"><X size={22}/></button>
    </div>
    <div className="tour-body" key={i}>
      <div className="tour-art">
        <i/><i/><i/><i/><i/>
        <div className="tour-badge"><Icon size={64} strokeWidth={1.8}/></div>
      </div>
      <h2>{s.title}</h2>
      <p>{s.text}</p>
    </div>
    <div className="tour-actions">
      <button className="tour-next" onClick={next}>{last ? "Começar a jogar" : <>Continuar <ArrowRight size={18}/></>}</button>
      {!last && <button className="tour-skip" onClick={close}>Saltar</button>}
    </div>
  </div>;
}
