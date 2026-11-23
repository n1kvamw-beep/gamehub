import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "./supabase";
import PadController from "./PadController";
import { ICE, ROOM_EVENT, roomChannel, type RoomMsg } from "./room";

// Convidado: vê o jogo do anfitrião e joga com o telemóvel (ou teclado) como jogador 2.
export default function RoomGuest({ initialCode, onExit }: { initialCode: string; onExit: () => void }) {
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState("");
  const [live, setLive] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const liveRef = useRef(false);
  liveRef.current = live;

  useEffect(() => {
    if (!code || !supabase) return;
    const sb = supabase;
    const id = Math.random().toString(36).slice(2, 10);
    let pc: RTCPeerConnection | null = null;
    let pending: RTCIceCandidateInit[] = [];
    const ch = sb.channel(roomChannel(code), { config: { broadcast: { self: false } } });
    const send = (p: RoomMsg) => { ch.send({ type: "broadcast", event: ROOM_EVENT, payload: p }); };
    ch.on("broadcast", { event: ROOM_EVENT }, async ({ payload }) => {
      const p = payload as RoomMsg;
      if (p.id !== id) return;
      try {
        if (p.t === "offer") {
          pc?.close(); pending = [];
          const conn = pc = new RTCPeerConnection({ iceServers: ICE });
          conn.ontrack = e => { const v = video.current; if (v && e.streams[0]) { v.srcObject = e.streams[0]; v.play().catch(() => {}); } setLive(true); };
          conn.onicecandidate = e => { if (e.candidate) send({ t: "ice", id, to: "host", c: e.candidate.toJSON() }); };
          conn.onconnectionstatechange = () => { if (["failed", "disconnected", "closed"].includes(conn.connectionState)) setLive(false); };
          await conn.setRemoteDescription(p.sdp);
          for (const c of pending) await conn.addIceCandidate(c).catch(() => {});
          pending = [];
          const ans = await conn.createAnswer();
          await conn.setLocalDescription(ans);
          send({ t: "answer", id, sdp: conn.localDescription!.toJSON() });
        } else if (p.t === "ice" && p.to === "guest") {
          if (pc?.remoteDescription) await pc.addIceCandidate(p.c).catch(() => {}); else pending.push(p.c);
        }
      } catch { setLive(false); }
    });
    let timer = 0;
    ch.subscribe(status => {
      if (status !== "SUBSCRIBED") return;
      const join = () => { if (!liveRef.current) send({ t: "join", id }); };
      join(); timer = window.setInterval(join, 3000); // repete até o anfitrião estar pronto
    });
    return () => { window.clearInterval(timer); pc?.close(); sb.removeChannel(ch); setLive(false); };
  }, [code]);

  if (!code) return <main className="pad-page pad-join">
    <button className="icon-btn" onClick={onExit}><ArrowLeft/></button>
    <h1>Entrar numa sala</h1>
    <p>O anfitrião abre um jogo de consola, toca em <strong>Online</strong> e diz-te o código.</p>
    <input value={input} maxLength={5} autoCapitalize="characters" autoComplete="off" placeholder="ABCDE" onChange={e => setInput(e.target.value.toUpperCase())}/>
    <button className="primary-btn" disabled={input.length !== 5} onClick={() => setCode(input)}>Entrar</button>
  </main>;

  return <PadController initialCode={code} defaultPlayer={2} onShowTv={onExit} onExit={() => setCode("")} top={<div className="room-video">
    <video ref={video} playsInline autoPlay/>
    {!live && <div className="room-wait">A ligar ao anfitrião… O jogo tem de estar aberto no aparelho dele.</div>}
  </div>}/>;
}
