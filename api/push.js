// Função do Vercel: envia notificações push (só o admin). Ações (POST JSON): key (público), send (admin).
import webpush from "web-push";

const env = process.env;
const SB_URL = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""), SB_KEY = env.VITE_SUPABASE_KEY;
const PUB = env.VAPID_PUBLIC_KEY, PRIV = env.VAPID_PRIVATE_KEY;

async function adminHeaders(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_KEY) return null;
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${token}` };
  const who = await fetch(`${SB_URL}/auth/v1/user`, { headers });
  if (!who.ok) return null;
  const { id } = await who.json();
  const prof = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=role`, { headers });
  if (!prof.ok) return null;
  return (await prof.json())[0]?.role === "admin" ? headers : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!PUB || !PRIV) return res.status(200).json({ configured: false, error: "As chaves das notificações ainda não estão configuradas." });
  if (body.action === "key") return res.status(200).json({ configured: true, key: PUB });
  try {
    const headers = await adminHeaders(req);
    if (!headers) return res.status(403).json({ error: "Só o admin pode fazer isto." });
    if (body.action !== "send" || !/^[0-9a-f-]{36}$/i.test(body.newsId || "")) return res.status(400).json({ error: "Pedido inválido." });
    const n = await (await fetch(`${SB_URL}/rest/v1/news?id=eq.${body.newsId}&select=kind,title,body`, { headers })).json();
    if (!n[0]) return res.status(404).json({ error: "Novidade não encontrada." });
    const prefix = { jogo: "🎮 Jogo novo", mecanica: "⚙️ Mecânicas", bug: "🛠️ Bug corrigido", outro: "📣 Novidade" }[n[0].kind] || "GameHub";
    const payload = JSON.stringify({ title: `${prefix}: ${n[0].title}`, body: n[0].body.slice(0, 160), url: "/" });
    const subsRes = await fetch(`${SB_URL}/rest/v1/push_subs?select=endpoint,p256dh,auth`, { headers });
    const subs = subsRes.ok ? await subsRes.json() : [];
    webpush.setVapidDetails("mailto:n1kvamw@gmail.com", PUB, PRIV);
    let sent = 0; const dead = [];
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); }
    }));
    for (const ep of dead) await fetch(`${SB_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(ep)}`, { method: "DELETE", headers });
    return res.status(200).json({ sent, removed: dead.length, total: subs.length });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao enviar." });
  }
}
