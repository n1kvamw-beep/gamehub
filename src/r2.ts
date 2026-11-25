import { supabase } from "./supabase";

// Ficheiros no Cloudflare R2 ficam na base de dados como "r2:<chave>".
export const isR2 = (path?: string | null) => !!path && path.startsWith("r2:");
export const r2Key = (path: string) => path.slice(3);
// ROMs privadas ficam no bucket privado do R2 como "r2rom:<chave>" (só se abrem com link temporário).
export const isR2Rom = (path?: string | null) => !!path && path.startsWith("r2rom:");
export const r2RomKey = (path: string) => path.slice(6);

let base: string | null | undefined;

async function api(body: unknown, auth = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const { data } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch("/api/r2", { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Erro ${res.status} no Cloudflare.`);
  return json as Record<string, unknown>;
}

// Endereço público do bucket (null = R2 não configurado). Fica em cache.
export async function r2Base(): Promise<string | null> {
  if (base !== undefined) return base;
  try { base = ((await api({ action: "config" })).publicUrl as string | null) ?? null; }
  catch { return null; }
  return base;
}

export function r2PublicUrl(path: string) {
  return base ? `${base}/${r2Key(path).split("/").map(encodeURIComponent).join("/")}` : "";
}

export type Progress = (done: number, total: number) => void;
const PART = 32 * 1024 * 1024;     // tamanho de cada parte
const PARALLEL = 4;                // partes enviadas ao mesmo tempo
const BIG = 48 * 1024 * 1024;      // acima disto usa envio em partes

// Envia uma parte com XHR (dá progresso em tempo real) e repete até 3 vezes se falhar.
function putPart(url: string, blob: Blob, onBytes: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const go = () => {
      const x = new XMLHttpRequest();
      let last = 0;
      x.open("PUT", url);
      x.upload.onprogress = e => { onBytes(e.loaded - last); last = e.loaded; };
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : retry(x.status));
      x.onerror = () => retry(0);
      const retry = (code: number) => { onBytes(-last); last = 0; if (++tries < 3) setTimeout(go, 800 * tries); else reject(new Error(`Falha no envio de uma parte (${code}). Verifica a política CORS do bucket.`)); };
      x.send(blob);
    };
    go();
  });
}

async function r2PutMultipart(key: string, body: Blob, priv: boolean, onProgress?: Progress) {
  const { uploadId } = await api({ action: "mp-create", key, private: priv }, true) as { uploadId: string };
  const count = Math.ceil(body.size / PART);
  let sent = 0;
  const bump = (n: number) => { sent += n; onProgress?.(Math.max(0, Math.min(sent, body.size)), body.size); };
  let next = 1;
  try {
    const worker = async () => {
      while (next <= count) {
        const n = next++;
        const { urls } = await api({ action: "mp-sign", key, private: priv, uploadId, parts: [n] }, true) as { urls: string[] };
        await putPart(urls[0], body.slice((n - 1) * PART, n * PART), bump);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));
    await api({ action: "mp-complete", key, private: priv, uploadId, count }, true);
  } catch (e) {
    api({ action: "mp-abort", key, private: priv, uploadId }, true).catch(() => {});
    throw e;
  }
}

export async function r2Put(key: string, body: Blob, contentType: string, priv = false, onProgress?: Progress) {
  if (body.size > BIG) return r2PutMultipart(key, body, priv, onProgress);
  const { url } = await api({ action: "sign", key, private: priv }, true);
  const res = await fetch(url as string, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Falha no envio para o Cloudflare (${res.status}). Verifica a política CORS do bucket.`);
  onProgress?.(body.size, body.size);
}

export async function r2Delete(keys: string[], romKeys: string[] = []) {
  if (keys.length || romKeys.length) await api({ action: "delete", keys, romKeys }, true);
}

// Link temporário (6 h) para uma ROM privada; o servidor confirma se esta pessoa pode ver o jogo.
export async function r2RomUrl(gameId: string): Promise<string> {
  return (await api({ action: "read", gameId }, true)).url as string;
}

// Tamanho de uma ROM privada já guardada (pede só o 1.º byte).
export async function r2RomSize(gameId: string): Promise<number> {
  const res = await fetch(await r2RomUrl(gameId), { headers: { Range: "bytes=0-0" } });
  const total = /\/(\d+)$/.exec(res.headers.get("content-range") || "");
  return total ? Number(total[1]) : -1;
}

// Confirma que o ficheiro chegou ao R2 com o tamanho certo.
export async function r2Verify(key: string, size: number) {
  const res = await fetch(r2PublicUrl("r2:" + key), { method: "HEAD" });
  return res.ok && Number(res.headers.get("content-length")) === size;
}

// Imagens de perfil (avatar/banner): guarda no R2 e devolve a chave "avatars/<id>/...".
export async function r2PutImage(kind: "avatar" | "banner", blob: Blob): Promise<string> {
  const { key, url } = await api({ action: "sign-image", kind, type: blob.type, size: blob.size }, true) as { key: string; url: string };
  const res = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
  if (!res.ok) throw new Error(`Falha no envio da imagem (${res.status}).`);
  return key;
}

export async function r2DeleteImage(key: string) {
  try { await api({ action: "delete-image", key }, true); } catch { /* a imagem antiga pode já não existir */ }
}

// Endereço de uma imagem de perfil já guardada (precisa de r2Base() carregado).
export function imageUrl(key?: string | null) {
  return key && base ? `${base}/${key.split("/").map(encodeURIComponent).join("/")}` : "";
}

export type UsageGroup = Record<string, { bytes: number; count: number }>;
export type R2Usage = { limitBytes: number; files: UsageGroup; roms: UsageGroup & { error?: never } | { error: string } };

// Espaço usado no Cloudflare (só admin).
export async function r2Usage(): Promise<R2Usage> {
  return (await api({ action: "usage" }, true)) as unknown as R2Usage;
}
