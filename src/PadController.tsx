import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { openPadClient, padAvailable, MAX_PLAYERS, type PadButton } from "./pad";

type Props = { initialCode: string; onExit: () => void; onShowTv: () => void };

export default function PadController({ initialCode, onExit, onShowTv }: Props) {
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState(initialCode.length === 5 ? initialCode.toUpperCase() : "");
  const [online, setOnline] = useState(false);
  const [player, setPlayer] = useState(() => { try { return Math.min(MAX_PLAYERS, Math.max(1, Number(localStorage.getItem("gh-player")) || 1)); } catch { return 1; } });
  const pick = (n: number) => { setPlayer(n); try { localStorage.setItem("gh-player", String(n)); } catch { /* ignora */ } };
  const client = useRef<ReturnType<typeof openPadClient> | null>(null);

  useEffect(() => {
    if (!code) return;
    const c = openPadClient(code, setOnline, player);
    client.current = c;
    return () => { c.close(); client.current = null; setOnline(false); };
  }, [code, player]);

  const picker = <div className="pad-players" role="group" aria-label="Jogador">{Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map(n =>
    <button key={n} className={n === player ? "on" : ""} onClick={() => pick(n)}>J{n}</button>)}</div>;

  function Btn({ b, label, cls = "" }: { b: PadButton; label: string; cls?: string }) {
    const down = (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("on"); navigator.vibrate?.(8); client.current?.send("d", b);
    };
    const up = (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.classList.remove("on"); client.current?.send("u", b); };
    return <button className={`pad-btn ${cls}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={e => e.preventDefault()}>{label}</button>;
  }

  if (!padAvailable()) return <main className="pad-page"><p>O Supabase não está configurado.</p></main>;
  if (!code) return <main className="pad-page pad-join">
    <button className="icon-btn" onClick={onExit}><ArrowLeft/></button>
    <h1>Comando</h1>
    <p>Na TV, abre um jogo e carrega em <strong>Comando</strong>. Escreve aqui o código que aparecer.</p>
    <input value={input} maxLength={5} autoCapitalize="characters" autoComplete="off" placeholder="ABCDE" onChange={e => setInput(e.target.value.toUpperCase())}/>
    <p>Qual jogador és?</p>{picker}
    <button className="primary-btn" disabled={input.length !== 5} onClick={() => setCode(input)}>Ligar</button>
    <p className="muted">Estás na TV? Mostra um código para ligares o telemóvel.</p>
    <button className="secondary-btn" onClick={onShowTv}>Mostrar código nesta TV</button>
  </main>;
  return <main className="pad-page pad-live">
    <div className="pad-top"><button className="icon-btn" onClick={() => setCode("")}><ArrowLeft/></button><span className={online ? "pad-on" : "pad-off"}>{online ? `J${player} · ${code}` : "A ligar..."}</span><span style={{ marginLeft: "auto" }}><Btn b="home" label="⌂" cls="small home"/></span></div>
    <div className="pad-players-live">{picker}</div>
    <div className="pad-shoulders"><Btn b="l" label="L" cls="shoulder"/><Btn b="r" label="R" cls="shoulder"/></div>
    <div className="pad-layout">
      <div className="dpad">
        <Btn b="up" label="▲" cls="d-up"/><Btn b="left" label="◀" cls="d-left"/><Btn b="right" label="▶" cls="d-right"/><Btn b="down" label="▼" cls="d-down"/>
      </div>
      <div className="pad-mid"><Btn b="select" label="SELECT" cls="small"/><Btn b="start" label="START" cls="small"/></div>
      <div className="face">
        <Btn b="x" label="X" cls="f-top"/><Btn b="y" label="Y" cls="f-left"/><Btn b="a" label="A" cls="f-right"/><Btn b="b" label="B" cls="f-bottom"/>
      </div>
    </div>
  </main>;
}
