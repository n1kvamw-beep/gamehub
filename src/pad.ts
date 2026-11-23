import { supabase } from "./supabase";

// Botões do comando virtual e as teclas que cada um simula no jogo da TV.
export type PadButton = "up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "l" | "r" | "start" | "select" | "home";
type Key = { key: string; code: string; kc: number };
export const PAD_KEYS: Record<Exclude<PadButton, "home">, Key[]> = {
  up: [{ key: "ArrowUp", code: "ArrowUp", kc: 38 }, { key: "w", code: "KeyW", kc: 87 }],
  down: [{ key: "ArrowDown", code: "ArrowDown", kc: 40 }, { key: "s", code: "KeyS", kc: 83 }],
  left: [{ key: "ArrowLeft", code: "ArrowLeft", kc: 37 }, { key: "a", code: "KeyA", kc: 65 }],
  right: [{ key: "ArrowRight", code: "ArrowRight", kc: 39 }, { key: "d", code: "KeyD", kc: 68 }],
  a: [{ key: " ", code: "Space", kc: 32 }, { key: "z", code: "KeyZ", kc: 90 }],
  b: [{ key: "x", code: "KeyX", kc: 88 }],
  x: [{ key: "c", code: "KeyC", kc: 67 }],
  y: [{ key: "v", code: "KeyV", kc: 86 }],
  l: [{ key: "q", code: "KeyQ", kc: 81 }],
  r: [{ key: "e", code: "KeyE", kc: 69 }],
  start: [{ key: "Enter", code: "Enter", kc: 13 }],
  select: [{ key: "Shift", code: "ShiftRight", kc: 16 }],
};

// Teclas por defeito do EmulatorJS (para as consolas): evita enviar teclas a mais que ativam outros botões.
export const EMU_KEYS: Record<Exclude<PadButton, "home">, Key[]> = {
  up: [{ key: "ArrowUp", code: "ArrowUp", kc: 38 }], down: [{ key: "ArrowDown", code: "ArrowDown", kc: 40 }],
  left: [{ key: "ArrowLeft", code: "ArrowLeft", kc: 37 }], right: [{ key: "ArrowRight", code: "ArrowRight", kc: 39 }],
  a: [{ key: "z", code: "KeyZ", kc: 90 }], b: [{ key: "x", code: "KeyX", kc: 88 }],
  x: [{ key: "a", code: "KeyA", kc: 65 }], y: [{ key: "s", code: "KeyS", kc: 83 }],
  l: [{ key: "q", code: "KeyQ", kc: 81 }], r: [{ key: "e", code: "KeyE", kc: 69 }],
  start: [{ key: "Enter", code: "Enter", kc: 13 }], select: [{ key: "v", code: "KeyV", kc: 86 }],
};

// Teclas dos jogadores 2 e 3 (o jogador 1 usa PAD_KEYS / EMU_KEYS). Letras e números que não colidem entre si.
const k = (key: string, kc: number): Key => ({ key, code: /^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`, kc });
const P2: Record<Exclude<PadButton, "home">, Key[]> = {
  up: [k("i", 73)], down: [k("k", 75)], left: [k("j", 74)], right: [k("l", 76)],
  a: [k("m", 77)], b: [k("n", 78)], x: [k("c", 67)], y: [k("b", 66)], l: [k("u", 85)], r: [k("o", 79)], start: [k("p", 80)], select: [k("y", 89)],
};
const P3: Record<Exclude<PadButton, "home">, Key[]> = {
  up: [k("t", 84)], down: [k("g", 71)], left: [k("f", 70)], right: [k("h", 72)],
  a: [k("1", 49)], b: [k("2", 50)], x: [k("3", 51)], y: [k("4", 52)], l: [k("5", 53)], r: [k("6", 54)], start: [k("7", 55)], select: [k("8", 56)],
};
// Jogos HTML5 com 2 jogadores costumam usar WASD no segundo.
const P2_HTML: Record<Exclude<PadButton, "home">, Key[]> = {
  ...P2,
  up: [k("w", 87)], down: [k("s", 83)], left: [k("a", 65)], right: [k("d", 68)],
  a: [k("f", 70)], b: [k("g", 71)], x: [k("r", 82)], y: [k("t", 84)],
};
export const MAX_PLAYERS = 3;
// Teclas de um botão para o jogador n. Com mais de um jogador ligado, o jogador 1 deixa de usar WASD.
export function keysFor(player: number, b: Exclude<PadButton, "home">, emulator: boolean, multi: boolean): Key[] {
  if (player === 2) return (emulator ? P2 : P2_HTML)[b];
  if (player === 3) return P3[b];
  const base = (emulator ? EMU_KEYS : PAD_KEYS)[b];
  return multi && !emulator && ["up", "down", "left", "right"].includes(b) ? base.slice(0, 1) : base;
}
// Controlos do EmulatorJS para os jogadores 2 e 3 (índices dos botões do libretro).
export const EJS_BUTTONS: Record<Exclude<PadButton, "home">, number> = { b: 0, y: 1, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8, x: 9, l: 10, r: 11 };

const EVENT = "k";
const channelName = (code: string) => `gamehub-pad-${code.trim().toUpperCase()}`;
export const newPadCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), n => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");
export const padAvailable = () => !!supabase;

// Ligação direta (WebRTC) entre telemóvel e TV: os botões não passam pelo servidor, por isso chegam mais depressa.
// O Supabase só serve para combinar a ligação e como reserva se a ligação direta falhar.
type Payload = { t?: string; b?: PadButton; n?: number };
const SIG = "sig";
const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// TV: recebe os botões do telemóvel.
export function openPadHost(code: string, onButton: (type: "d" | "u", b: PadButton, player: number) => void, onConnect: (player: number) => void) {
  if (!supabase) return () => {};
  const sb = supabase;
  const ch = sb.channel(channelName(code), { config: { broadcast: { self: false } } });
  const handle = (p: Payload) => {
    const n = p.n && p.n >= 1 && p.n <= MAX_PLAYERS ? Math.floor(p.n) : 1;
    if (p.t === "hello") return onConnect(n);
    if ((p.t === "d" || p.t === "u") && p.b && (p.b === "home" || PAD_KEYS[p.b])) { onConnect(n); onButton(p.t, p.b, n); }
  };
  const peers = new Map<string, RTCPeerConnection>();
  const sig = (payload: object) => { ch.send({ type: "broadcast", event: SIG, payload }); };
  ch.on("broadcast", { event: EVENT }, ({ payload }) => handle(payload as Payload));
  ch.on("broadcast", { event: SIG }, async ({ payload }) => {
    const m = payload as { t: string; id: string; to?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };
    try {
      if (m.t === "offer" && m.sdp && typeof RTCPeerConnection !== "undefined") {
        peers.get(m.id)?.close();
        const pc = new RTCPeerConnection({ iceServers: ICE });
        peers.set(m.id, pc);
        pc.onicecandidate = e => { if (e.candidate) sig({ t: "ice", id: m.id, to: "client", c: e.candidate.toJSON() }); };
        pc.ondatachannel = e => { e.channel.onmessage = ev => { try { handle(JSON.parse(String(ev.data))); } catch { /* ignora */ } }; };
        await pc.setRemoteDescription(m.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        sig({ t: "answer", id: m.id, sdp: pc.localDescription!.toJSON() });
      } else if (m.t === "ice" && m.to === "host" && m.c) {
        await peers.get(m.id)?.addIceCandidate(m.c);
      }
    } catch { /* fica a reserva pelo servidor */ }
  });
  ch.subscribe();
  return () => { peers.forEach(pc => pc.close()); sb.removeChannel(ch); };
}

// Telemóvel: envia os botões para a TV.
export function openPadClient(code: string, onStatus: (ok: boolean) => void, player = 1) {
  if (!supabase) { onStatus(false); return { send: (_t: "d" | "u", _b: PadButton) => {}, close: () => {} }; }
  const sb = supabase;
  const ch = sb.channel(channelName(code), { config: { broadcast: { self: false } } });
  const id = Math.random().toString(36).slice(2, 10);
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  const sig = (payload: object) => { ch.send({ type: "broadcast", event: SIG, payload }); };
  ch.on("broadcast", { event: SIG }, async ({ payload }) => {
    const m = payload as { t: string; id: string; to?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };
    if (m.id !== id || !pc) return;
    try {
      if (m.t === "answer" && m.sdp) await pc.setRemoteDescription(m.sdp);
      else if (m.t === "ice" && m.to === "client" && m.c) await pc.addIceCandidate(m.c);
    } catch { /* reserva pelo servidor */ }
  });
  async function startDirect() {
    if (typeof RTCPeerConnection === "undefined") return;
    try {
      pc?.close();
      const conn = pc = new RTCPeerConnection({ iceServers: ICE });
      dc = conn.createDataChannel("pad", { ordered: true });
      dc.onclose = () => { dc = null; };
      conn.onicecandidate = e => { if (e.candidate) sig({ t: "ice", id, to: "host", c: e.candidate.toJSON() }); };
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      sig({ t: "offer", id, sdp: conn.localDescription!.toJSON() });
    } catch { /* reserva pelo servidor */ }
  }
  ch.subscribe(status => {
    const ok = status === "SUBSCRIBED";
    onStatus(ok);
    if (ok) { ch.send({ type: "broadcast", event: EVENT, payload: { t: "hello", n: player } }); startDirect(); }
  });
  return {
    send: (t: "d" | "u", b: PadButton) => {
      const payload = { t, b, n: player };
      if (dc && dc.readyState === "open") { try { dc.send(JSON.stringify(payload)); return; } catch { /* usa a reserva */ } }
      ch.send({ type: "broadcast", event: EVENT, payload });
    },
    close: () => { dc = null; pc?.close(); sb.removeChannel(ch); },
  };
}
