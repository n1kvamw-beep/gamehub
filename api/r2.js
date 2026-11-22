// Função do Vercel: liga o GameHub ao Cloudflare R2 sem expor as chaves no navegador.
// Ações (POST JSON): config (público), sign (admin), delete (admin).
import crypto from "node:crypto";

const env = process.env;
const ACCOUNT = env.R2_ACCOUNT_ID, KEY_ID = env.R2_ACCESS_KEY_ID, SECRET = env.R2_SECRET_ACCESS_KEY;
const BUCKET = env.R2_BUCKET, PUBLIC_URL = (env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
const SB_URL = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""), SB_KEY = env.VITE_SUPABASE_KEY;

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// URL pré-assinado (AWS Signature V4) para o R2.
function presign(method, key, expires = 900) {
  const host = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const path = "/" + [BUCKET, ...key.split("/")].map(enc).join("/");
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = now.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${KEY_ID}/${scope}`, "X-Amz-Date": now,
    "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host",
  };
  const canonQuery = Object.keys(query).sort().map(k => `${enc(k)}=${enc(query[k])}`).join("&");
  const canonical = [method, path, canonQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", now, scope, sha(canonical)].join("\n");
  const signKey = hmac(hmac(hmac(hmac("AWS4" + SECRET, date), "auto"), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", signKey).update(toSign).digest("hex");
  return `https://${host}${path}?${canonQuery}&X-Amz-Signature=${signature}`;
}

async function requireAdmin(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_KEY) return false;
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${token}` };
  const who = await fetch(`${SB_URL}/auth/v1/user`, { headers });
  if (!who.ok) return false;
  const user = await who.json();
  const prof = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, { headers });
  if (!prof.ok) return false;
  const rows = await prof.json();
  return rows[0]?.role === "admin";
}

const validKey = k => typeof k === "string" && k.length < 300 && /^[\w./ -]+$/.test(k) && !k.includes("..") && !k.startsWith("/");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  const configured = !!(ACCOUNT && KEY_ID && SECRET && BUCKET && PUBLIC_URL);
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  try {
    if (body.action === "config") return res.status(200).json({ publicUrl: configured ? PUBLIC_URL : null });
    if (!configured) return res.status(503).json({ error: "O Cloudflare R2 não está configurado no Vercel." });
    if (!(await requireAdmin(req))) return res.status(403).json({ error: "Só o admin pode fazer isto." });
    if (body.action === "sign") {
      if (!validKey(body.key)) return res.status(400).json({ error: "Nome de ficheiro inválido." });
      return res.status(200).json({ url: presign("PUT", body.key) });
    }
    if (body.action === "delete") {
      const keys = Array.isArray(body.keys) ? body.keys.filter(validKey) : [];
      for (const key of keys) await fetch(presign("DELETE", key, 60), { method: "DELETE" });
      return res.status(200).json({ deleted: keys.length });
    }
    return res.status(400).json({ error: "Ação desconhecida." });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Erro interno." });
  }
}
