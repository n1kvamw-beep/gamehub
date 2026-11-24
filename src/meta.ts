/** Nome limpo a partir do ficheiro (sem extensão, etiquetas de região/versão e lixo de nomes). */
export function cleanName(filename: string): string {
  const base = filename.split("/").pop() || filename;
  return base.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_.]+/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\((?:[^)]*)\)/g, " ")
    .replace(/\b(v\d+(\.\d+)*|rev ?\w+)\b/gi, " ").replace(/\s+/g, " ").trim();
}
export type GameMeta = { title: string; cover: string };
/** Procura nome oficial + capa (como o Emby). Devolve null se não encontrar. */
export async function lookupMeta(filename: string, platform: string): Promise<GameMeta | null> {
  const name = cleanName(filename);
  if (!name) return null;
  try {
    const r = await fetch(`/api/meta?platform=${encodeURIComponent(platform)}&name=${encodeURIComponent(name)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.cover ? { title: j.title || name, cover: j.cover } : null;
  } catch { return null; }
}
