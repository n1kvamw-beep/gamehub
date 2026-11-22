import { useEffect, useRef, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { openPadHost, PAD_KEYS, type PadButton } from "./pad";
import { moveFocus, clickFocused, goBack, scrollPage, type Dir } from "./tvnav";

type Props = {
  code: string; frame: React.RefObject<HTMLIFrameElement>; show: boolean; onHide: () => void;
  inGame: boolean; onHome: () => void;
};

const DIRS: Partial<Record<PadButton, Dir>> = { up: "up", down: "down", left: "left", right: "right" };

// Na TV: mostra o código de ligação. Dentro de um jogo passa os botões ao jogo; no resto do site navega.
export default function PadHost({ code, frame, show, onHide, inGame, onHome }: Props) {
  const [connected, setConnected] = useState(false);
  const held = useRef(new Set<PadButton>());
  const repeat = useRef<{ t?: number; i?: number }>({});
  const live = useRef({ inGame, onHome });
  live.current = { inGame, onHome };

  useEffect(() => {
    const stopRepeat = () => { window.clearTimeout(repeat.current.t); window.clearInterval(repeat.current.i); };
    const handle = (type: "d" | "u", b: PadButton) => {
      if (b === "home") { if (type === "d") live.current.onHome(); return; }
      if (live.current.inGame) {
        const win = frame.current?.contentWindow;
        if (!win) return;
        if (type === "d") held.current.add(b); else held.current.delete(b);
        for (const k of PAD_KEYS[b]) win.postMessage({ gh: "key", type, key: k.key, code: k.code, kc: k.kc }, "*");
        return;
      }
      // Fora dos jogos: navegar no site.
      const dir = DIRS[b];
      if (type === "u") { if (dir) stopRepeat(); return; }
      if (dir) {
        stopRepeat(); moveFocus(dir);
        repeat.current.t = window.setTimeout(() => { repeat.current.i = window.setInterval(() => moveFocus(dir), 140); }, 380);
      } else if (b === "a") clickFocused();
      else if (b === "b") goBack();
      else if (b === "l") scrollPage("up");
      else if (b === "r") scrollPage("down");
      else if (b === "start") live.current.onHome();
    };
    const close = openPadHost(code, handle, () => setConnected(true));
    return () => {
      close(); stopRepeat();
      const win = frame.current?.contentWindow;
      if (win) for (const b of [...held.current]) if (b !== "home") for (const k of PAD_KEYS[b]) win.postMessage({ gh: "key", type: "u", key: k.key, code: k.code, kc: k.kc }, "*");
    };
  }, [code, frame]);

  if (!show) return null;
  const url = `${location.origin}/?comando=${code}`;
  return <div className="pad-overlay" onClick={onHide}>
    <div className="pad-card" onClick={e => e.stopPropagation()}>
      <button className="icon-btn pad-close" onClick={onHide} title="Fechar"><X/></button>
      <Smartphone size={34}/>
      <h2>Usar o telemóvel como comando</h2>
      <p>No telemóvel, abre o GameHub, escolhe <strong>Comando</strong> no menu e escreve este código:</p>
      <div className="pad-code">{code}</div>
      <p className="muted">Ou abre diretamente: <strong>{url}</strong></p>
      <div className={`pad-status ${connected ? "ok" : ""}`}>{connected ? "✓ Telemóvel ligado. Fecha esta janela com B (ou toca no X)." : "À espera do telemóvel..."}</div>
    </div>
  </div>;
}
