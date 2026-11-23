import { useEffect, useRef, useState } from "react";
import { Globe, X } from "lucide-react";
import { supabase } from "./supabase";
import { ICE, ROOM_EVENT, roomChannel, type RoomMsg } from "./room";

type Stream = () => MediaStream | null;

// Anfitrião: envia o ecrã e o som do emulador a quem entrar na sala com o código.
export default function OnlineHost({ code, frame, show, onHide }: { code: string; frame: React.RefObject<HTMLIFrameElement>; show: boolean; onHide: () => void }) {
  const [guests, setGuests] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const peers = new Map<string, RTCPeerConnection>();
    const ch = sb.channel(roomChannel(code), { config: { broadcast: { self: false } } });
    const send = (p: RoomMsg) => { ch.send({ type: "broadcast", event: ROOM_EVENT, payload: p }); };
    const count = () => setGuests([...peers.values()].filter(p => p.connectionState === "connected").length);
    ch.on("broadcast", { event: ROOM_EVENT }, async ({ payload }) => {
      const p = payload as RoomMsg;
      try {
        if (p.t === "join") {
          const win = frame.current?.contentWindow as (Window & { __ghStream?: Stream }) | null | undefined;
          const stream = win?.__ghStream?.();
          if (!stream || !stream.getVideoTracks().length) return; // o convidado volta a pedir
          peers.get(p.id)?.close();
          const pc = new RTCPeerConnection({ iceServers: ICE });
          peers.set(p.id, pc);
          pc.onconnectionstatechange = count;
          pc.onicecandidate = e => { if (e.candidate) send({ t: "ice", id: p.id, to: "guest", c: e.candidate.toJSON() }); };
          stream.getTracks().forEach(t => { if (t.kind === "video") (t as MediaStreamTrack & { contentHint: string }).contentHint = "motion"; pc.addTrack(t, stream); });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ t: "offer", id: p.id, sdp: pc.localDescription!.toJSON() });
        } else if (p.t === "answer") {
          const pc = peers.get(p.id);
          if (!pc) return;
          await pc.setRemoteDescription(p.sdp);
          for (const s of pc.getSenders()) if (s.track?.kind === "video") {
            const par = s.getParameters();
            if (par.encodings?.length) { par.encodings[0].maxBitrate = 3_000_000; par.encodings[0].maxFramerate = 60; s.setParameters(par).catch(() => {}); }
          }
        } else if (p.t === "ice" && p.to === "host") {
          await peers.get(p.id)?.addIceCandidate(p.c);
        }
      } catch { /* o convidado tenta de novo */ }
    }).subscribe();
    return () => { peers.forEach(pc => pc.close()); sb.removeChannel(ch); setGuests(0); };
  }, [code, frame]);

  if (!show) return null;
  const url = `${location.origin}/?sala=${code}`;
  return <div className="pad-overlay" onClick={onHide}>
    <div className="pad-card" onClick={e => e.stopPropagation()}>
      <button className="icon-btn pad-close" onClick={onHide} title="Fechar"><X/></button>
      <Globe size={34}/>
      <h2>Jogar online com um amigo</h2>
      <p>O teu amigo abre o GameHub, escolhe <strong>Entrar numa sala</strong> e escreve este código (ele joga como jogador 2):</p>
      <div className="pad-code">{code}</div>
      <p className="muted">Ou envia-lhe o link: <strong>{url}</strong></p>
      <div className={`pad-status ${guests ? "ok" : ""}`}>{guests ? `✓ ${guests} amigo${guests > 1 ? "s" : ""} ligado${guests > 1 ? "s" : ""}` : "À espera de um amigo… (o jogo tem de estar a correr)"}</div>
      <p className="muted">Só funciona com jogos de consola (emulador). O jogo corre no teu aparelho, por isso mantém esta página aberta.</p>
    </div>
  </div>;
}
