import { supabase } from "./supabase";

export type NewsKind = "jogo" | "mecanica" | "bug" | "outro";
export type NewsItem = { id: string; kind: NewsKind; title: string; body: string; createdAt: number };
export const KIND_LABEL: Record<NewsKind, string> = { jogo: "Jogo novo", mecanica: "Mecânicas", bug: "Bug corrigido", outro: "Novidade" };

const SEEN = "gh-news-seen";
export const lastSeen = () => { try { return Number(localStorage.getItem(SEEN)) || 0; } catch { return 0; } };
export const markSeen = () => { try { localStorage.setItem(SEEN, String(Date.now())); } catch { /* ignora */ } };

export async function fetchNews(limit = 30): Promise<NewsItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("news").select("id,kind,title,body,created_at").order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data.map(r => ({ id: r.id, kind: r.kind, title: r.title, body: r.body ?? "", createdAt: new Date(r.created_at).getTime() }));
}

async function token() { return (await supabase?.auth.getSession())?.data.session?.access_token ?? ""; }
async function push(body: object) {
  const t = await token();
  const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Erro nas notificações.");
  return j as Record<string, unknown>;
}

// Admin: publica uma novidade e, se pedido, envia a notificação push.
export async function publishNews(n: { kind: NewsKind; title: string; body: string; push: boolean }) {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  const { data, error } = await supabase.from("news").insert({ kind: n.kind, title: n.title.trim(), body: n.body.trim() }).select("id").single();
  if (error || !data) throw new Error(error?.message.includes("does not exist") ? "Falta correr o SQL das novidades no Supabase." : error?.message || "Não foi possível publicar.");
  if (!n.push) return null;
  return (await push({ action: "send", newsId: data.id })) as { sent: number; total: number };
}
export async function deleteNews(id: string) { await supabase?.from("news").delete().eq("id", id); }

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const toBytes = (b64: string) => { const p = "=".repeat((4 - b64.length % 4) % 4); const r = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
export async function pushEnabled() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try { return !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()); } catch { return false; }
}
export async function enablePush() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  if (!pushSupported()) throw new Error("Este aparelho não suporta notificações. No iPhone, instala primeiro a app no ecrã inicial.");
  const k = await push({ action: "key" });
  if (!k.key) throw new Error(String(k.error || "As notificações ainda não estão ativas no servidor."));
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Permissão recusada. Ativa as notificações nas definições do navegador.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(String(k.key)) });
  const j = sub.toJSON();
  const { error } = await supabase.rpc("gh_save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth });
  if (error) throw new Error(error.message.includes("gh_save_push") ? "Falta correr o SQL das novidades no Supabase." : error.message);
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase?.rpc("gh_drop_push", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
