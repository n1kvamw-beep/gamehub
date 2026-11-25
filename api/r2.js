// Função do Vercel: liga o GameHub ao Cloudflare R2 sem expor as chaves no navegador.
// Ações (POST JSON): config (público), sign (admin), delete (admin).
import crypto from "node:crypto";

const env = process.env;
const ACCOUNT = env.R2_ACCOUNT_ID, KEY_ID = env.R2_ACCESS_KEY_ID, SECRET = env.R2_SECRET_ACCESS_KEY;
const BUCKET = env.R2_BUCKET, ROMS_BUCKET = env.R2_ROMS_BUCKET || "gamehub-roms", PUBLIC_URL = (env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
const SB_URL = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""), SB_KEY = env.VITE_SUPABASE_KEY;

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// URL pré-assinado (AWS Signature V4) para o R2.
function presign(method, key, expires = 900, bucket = BUCKET, size = null, extra = {}) {
  const host = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const path = "/" + [bucket, ...(key ? key.split("/") : [])].map(enc).join("/");
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = now.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${KEY_ID}/${scope}`, "X-Amz-Date": now,
    "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": size == null ? "host" : "content-length;host", ...extra,
  };
  const canonQuery = Object.keys(query).sort().map(k => `${enc(k)}=${enc(query[k])}`).join("&");
  const headers = (size == null ? "" : `content-length:${size}\n`) + `host:${host}\n`;
  const canonical = [method, path, canonQuery, headers, size == null ? "host" : "content-length;host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", now, scope, sha(canonical)].join("\n");
  const signKey = hmac(hmac(hmac(hmac("AWS4" + SECRET, date), "auto"), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", signKey).update(toSign).digest("hex");
  return `https://${host}${path}?${canonQuery}&X-Amz-Signature=${signature}`;
}

// Devolve o utilizador autenticado (ou null).
async function requireUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_KEY) return null;
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${token}` };
  const who = await fetch(`${SB_URL}/auth/v1/user`, { headers });
  if (!who.ok) return null;
  const user = await who.json();
  return { id: user.id, headers };
}

async function requireAdmin(req) {
  const u = await requireUser(req);
  if (!u) return false;
  const { id, headers } = u;
  const user = { id };
  const prof = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, { headers });
  if (!prof.ok) return false;
  const rows = await prof.json();
  return rows[0]?.role === "admin";
}

// Link temporário para uma ROM privada: só se o Supabase deixar esta pessoa ver o jogo (RLS).
async function romUrl(req, gameId) {
  if (!/^[0-9a-f-]{36}$/i.test(gameId || "") || !SB_URL || !SB_KEY) return null;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const headers = { apikey: SB_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`${SB_URL}/rest/v1/games?id=eq.${gameId}&select=file_path`, { headers });
  if (!r.ok) return null;
  const path = (await r.json())[0]?.file_path;
  if (typeof path !== "string" || !path.startsWith("r2rom:")) return null;
  return presign("GET", path.slice(6), 6 * 3600, ROMS_BUCKET);
}

// Soma o tamanho dos ficheiros de um bucket, agrupado pela primeira pasta da chave.
async function bucketUsage(bucket) {
  const groups = {};
  let token = "";
  for (let page = 0; page < 60; page++) {
    const extra = { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) };
    const res = await fetch(presign("GET", "", 120, bucket, null, extra));
    if (!res.ok) throw new Error(`O Cloudflare recusou a leitura do bucket ${bucket} (${res.status}). O token precisa de acesso a este bucket.`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] || "";
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0);
      const group = key.includes("/") ? key.split("/")[0] : "outros";
      groups[group] = groups[group] || { bytes: 0, count: 0 };
      groups[group].bytes += size; groups[group].count += 1;
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || "") : "";
    if (!token) break;
  }
  return groups;
}

const validKey = k => typeof k === "string" && k.length < 300 && /^[\w./ -]+$/.test(k) && !k.includes("..") && !k.startsWith("/");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  const configured = !!(ACCOUNT && KEY_ID && SECRET && BUCKET && PUBLIC_URL);
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  try {
    if (body.action === "config") return res.status(200).json({ publicUrl: configured ? PUBLIC_URL : null });
    if (body.action === "read") {
      if (!configured) return res.status(503).json({ error: "O Cloudflare R2 não está configurado no Vercel." });
      const url = await romUrl(req, body.gameId);
      return url ? res.status(200).json({ url }) : res.status(403).json({ error: "Sem permissão para este jogo. Pede ao administrador para te aprovar." });
    }
    if (!configured) return res.status(503).json({ error: "O Cloudflare R2 não está configurado no Vercel." });
    // Imagens de perfil: qualquer utilizador com sessão, só na sua própria pasta e com tamanho limitado.
    if (body.action === "sign-image" || body.action === "delete-image") {
      const u = await requireUser(req);
      if (!u) return res.status(401).json({ error: "Entra na tua conta." });
      if (body.action === "delete-image") {
        if (typeof body.key !== "string" || !validKey(body.key) || !body.key.startsWith(`avatars/${u.id}/`)) return res.status(400).json({ error: "Ficheiro inválido." });
        await fetch(presign("DELETE", body.key, 60), { method: "DELETE" });
        return res.status(200).json({ deleted: 1 });
      }
      const size = Number(body.size), ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[body.type];
      if (!ext || !(size > 0 && size <= 1024 * 1024) || !["avatar", "banner"].includes(body.kind)) return res.status(400).json({ error: "Imagem inválida (máx. 1 MB, WebP/JPG/PNG)." });
      const key = `avatars/${u.id}/${body.kind}-${Date.now()}.${ext}`;
      return res.status(200).json({ key, url: presign("PUT", key, 600, BUCKET, size) });
    }
    if (!(await requireAdmin(req))) return res.status(403).json({ error: "Só o admin pode fazer isto." });
    if (body.action === "usage") {
      const [files, roms] = await Promise.all([bucketUsage(BUCKET), bucketUsage(ROMS_BUCKET).catch(e => ({ error: e.message }))]);
      return res.status(200).json({ limitBytes: 10 * 1024 ** 3, files, roms });
    }
    // Envio em partes (ficheiros grandes): o servidor só cria, assina e conclui; as partes vão direto para o R2.
    if (String(body.action).startsWith("mp-")) {
      if (!validKey(body.key)) return res.status(400).json({ error: "Nome de ficheiro inválido." });
      const bucket = body.private ? ROMS_BUCKET : BUCKET;
      const tag = (xml, t) => (new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml) || [])[1];
      if (body.action === "mp-create") {
        const r = await fetch(presign("POST", body.key, 120, bucket, null, { uploads: "" }), { method: "POST" });
        const id = tag(await r.text(), "UploadId");
        return id ? res.status(200).json({ uploadId: id }) : res.status(502).json({ error: "O R2 não iniciou o envio." });
      }
      const uploadId = String(body.uploadId || "");
      if (!/^[\w.~-]{8,300}$/.test(uploadId)) return res.status(400).json({ error: "Envio inválido." });
      if (body.action === "mp-sign") {
        const parts = (Array.isArray(body.parts) ? body.parts : []).map(Number).filter(n => n >= 1 && n <= 10000).slice(0, 200);
        return res.status(200).json({ urls: parts.map(n => presign("PUT", body.key, 3600, bucket, null, { partNumber: String(n), uploadId })) });
      }
      if (body.action === "mp-abort") {
        await fetch(presign("DELETE", body.key, 60, bucket, null, { uploadId }), { method: "DELETE" });
        return res.status(200).json({ ok: 1 });
      }
      if (body.action === "mp-complete") {
        const parts = []; let marker = "0";
        for (let guard = 0; guard < 20; guard++) {
          const x = await (await fetch(presign("GET", body.key, 60, bucket, null, { uploadId, "max-parts": "1000", "part-number-marker": marker }))).text();
          for (const m of x.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) parts.push({ n: Number(tag(m[1], "PartNumber")), etag: tag(m[1], "ETag") });
          if (tag(x, "IsTruncated") !== "true") break;
          marker = tag(x, "NextPartNumberMarker") || String(parts.length);
        }
        const want = Number(body.count);
        if (!parts.length || (want && parts.length !== want)) return res.status(409).json({ error: `Faltam partes (${parts.length}/${want}).` });
        parts.sort((a, b) => a.n - b.n);
        const xml = "<CompleteMultipartUpload>" + parts.map(p => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag}</ETag></Part>`).join("") + "</CompleteMultipartUpload>";
        const r = await fetch(presign("POST", body.key, 120, bucket, null, { uploadId }), { method: "POST", body: xml, headers: { "Content-Type": "application/xml" } });
        const out = await r.text();
        if (!r.ok || /<Error>/.test(out)) return res.status(502).json({ error: "O R2 não concluiu o envio." });
        return res.status(200).json({ ok: 1 });
      }
      return res.status(400).json({ error: "Ação desconhecida." });
    }
    if (body.action === "sign") {
      if (!validKey(body.key)) return res.status(400).json({ error: "Nome de ficheiro inválido." });
      return res.status(200).json({ url: presign("PUT", body.key, 900, body.private ? ROMS_BUCKET : BUCKET) });
    }
    if (body.action === "delete") {
      const keys = Array.isArray(body.keys) ? body.keys.filter(validKey) : [];
      const romKeys = Array.isArray(body.romKeys) ? body.romKeys.filter(validKey) : [];
      for (const key of keys) await fetch(presign("DELETE", key, 60), { method: "DELETE" });
      for (const key of romKeys) await fetch(presign("DELETE", key, 60, ROMS_BUCKET), { method: "DELETE" });
      return res.status(200).json({ deleted: keys.length + romKeys.length });
    }
    return res.status(400).json({ error: "Ação desconhecida." });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Erro interno." });
  }
}
