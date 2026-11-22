import { useEffect, useRef, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { newPadCode, openPadHost, PAD_KEYS, type PadButton } from "./pad";

type Props = { frame: React.RefObject<HTMLIFrameElement>; show: boolean; onHide: () => void };

// Na TV: mostra o código de ligação e passa os botões do telemóvel ao jogo.
export default function PadHost({ frame, show, onHide }: Props) {
  const [code] = useState(newPadCode);
  const [connected, setConnected] = useState(false);
  const held = useRef(new Set<PadButton>());

  useEffect(() => {
    const send = (type: "d" | "u", b: PadButton) => {
      const win = frame.current?.contentWindow;
      if (!win) return;
      if (type === "d") held.current.add(b); else held.current.delete(b);
      for (const k of PAD_KEYS[b]) win.postMessage({ gh: "key", type, key: k.key, code: k.code, kc: k.kc }, "*");
    };
    const close = openPadHost(code, send, () => setConnected(true));
    return () => { close(); for (const b of [...held.current]) send("u", b); };
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
      <div className={`pad-status ${connected ? "ok" : ""}`}>{connected ? "✓ Telemóvel ligado. Podes fechar esta janela e jogar." : "À espera do telemóvel..."}</div>
    </div>
  </div>;
}
