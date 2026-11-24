import { supabase } from "./supabase";

export type Playing = { uid: string | null; user: string; game: string; name: string; since: number };
type Listener = (list: Playing[]) => void;

let ch: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
let ready = false;
let pending: Playing | null = null;
const listeners = new Set<Listener>();

function snapshot(): Playing[] {
  if (!ch) return [];
  const st = ch.presenceState() as Record<string, Playing[]>;
  return Object.values(st).flat().filter(p => p && p.game);
}
function ensure() {
  if (!supabase || ch) return;
  ch = supabase.channel("gh-live", { config: { presence: { key: Math.random().toString(36).slice(2) } } });
  ch.on("presence", { event: "sync" }, () => { const l = snapshot(); listeners.forEach(f => f(l)); });
  ch.subscribe(status => {
    if (status === "SUBSCRIBED") { ready = true; if (pending) void ch!.track(pending); }
  });
}
/** Diz ao admin que esta pessoa está a jogar (ou deixou de jogar, com null). */
export function setPlaying(p: Playing | null) {
  if (!supabase) return;
  ensure();
  pending = p;
  if (!ready || !ch) return;
  if (p) void ch.track(p); else void ch.untrack();
}
/** Admin: lista em tempo real de quem está a jogar agora. */
export function watchPlaying(fn: Listener): () => void {
  ensure();
  listeners.add(fn);
  fn(snapshot());
  return () => { listeners.delete(fn); };
}
