import { supabase } from "./supabase";

// Botões do comando virtual e as teclas que cada um simula no jogo da TV.
export type PadButton = "up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "l" | "r" | "start" | "select";
type Key = { key: string; code: string; kc: number };
export const PAD_KEYS: Record<PadButton, Key[]> = {
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

const EVENT = "k";
const channelName = (code: string) => `gamehub-pad-${code.trim().toUpperCase()}`;
export const newPadCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), n => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");
export const padAvailable = () => !!supabase;

// TV: recebe os botões do telemóvel.
export function openPadHost(code: string, onButton: (type: "d" | "u", b: PadButton) => void, onConnect: () => void) {
  if (!supabase) return () => {};
  const sb = supabase;
  const ch = sb.channel(channelName(code), { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: EVENT }, ({ payload }) => {
    const p = payload as { t?: string; b?: PadButton };
    if (p.t === "hello") return onConnect();
    if ((p.t === "d" || p.t === "u") && p.b && PAD_KEYS[p.b]) { onConnect(); onButton(p.t, p.b); }
  }).subscribe();
  return () => { sb.removeChannel(ch); };
}

// Telemóvel: envia os botões para a TV.
export function openPadClient(code: string, onStatus: (ok: boolean) => void) {
  if (!supabase) { onStatus(false); return { send: (_t: "d" | "u", _b: PadButton) => {}, close: () => {} }; }
  const sb = supabase;
  const ch = sb.channel(channelName(code), { config: { broadcast: { self: false } } });
  ch.subscribe(status => {
    const ok = status === "SUBSCRIBED";
    onStatus(ok);
    if (ok) ch.send({ type: "broadcast", event: EVENT, payload: { t: "hello" } });
  });
  return {
    send: (t: "d" | "u", b: PadButton) => { ch.send({ type: "broadcast", event: EVENT, payload: { t, b } }); },
    close: () => { sb.removeChannel(ch); },
  };
}
