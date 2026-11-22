import { supabase } from "./supabase";

// Ficheiros no Cloudflare R2 ficam na base de dados como "r2:<chave>".
export const isR2 = (path?: string | null) => !!path && path.startsWith("r2:");
export const r2Key = (path: string) => path.slice(3);

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

export async function r2Put(key: string, body: Blob, contentType: string) {
  const { url } = await api({ action: "sign", key }, true);
  const res = await fetch(url as string, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Falha no envio para o Cloudflare (${res.status}). Verifica a política CORS do bucket.`);
}

export async function r2Delete(keys: string[]) {
  if (keys.length) await api({ action: "delete", keys }, true);
}

// Confirma que o ficheiro chegou ao R2 com o tamanho certo.
export async function r2Verify(key: string, size: number) {
  const res = await fetch(r2PublicUrl("r2:" + key), { method: "HEAD" });
  return res.ok && Number(res.headers.get("content-length")) === size;
}
