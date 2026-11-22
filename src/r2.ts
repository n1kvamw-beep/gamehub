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

export async function r2Put(key: string, body: Blob, contentType: string, priv = false) {
  const { url } = await api({ action: "sign", key, private: priv }, true);
  const res = await fetch(url as string, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Falha no envio para o Cloudflare (${res.status}). Verifica a política CORS do bucket.`);
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
