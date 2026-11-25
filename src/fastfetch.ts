// Descarga rápida de ficheiros grandes: partes em paralelo + cache no aparelho (a 2.ª vez abre logo).
const CACHE = "gh-roms-v1";
const MIN = 40 * 1024 * 1024;   // só acima disto compensa
const CHUNK = 8 * 1024 * 1024;
const PARALLEL = 6;

async function openCache() { try { return typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch { return null; } }

export async function fastBlob(url: string, id: string, version: string, onProgress?: (done: number, total: number) => void): Promise<Blob | null> {
  try {
    const key = `/__rom/${id}/${encodeURIComponent(version)}`;
    const cache = await openCache();
    const hit = cache ? await cache.match(key) : undefined;
    if (hit) { const b = await hit.blob(); if (b.size) return b; }

    // Sonda: descobre o tamanho total (precisa de o servidor deixar ler Content-Range).
    const probe = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = Number(/\/(\d+)$/.exec(probe.headers.get("content-range") || "")?.[1]);
    if (!probe.ok || !total || total < MIN) return null;

    const count = Math.ceil(total / CHUNK);
    const parts: Blob[] = new Array(count);
    let done = 0, next = 0;
    const worker = async () => {
      while (next < count) {
        const i = next++;
        const start = i * CHUNK, end = Math.min(total, start + CHUNK) - 1;
        for (let t = 0; ; t++) {
          try {
            const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
            if (r.status !== 206) throw new Error("range " + r.status);
            const b = await r.blob();
            if (b.size !== end - start + 1) throw new Error("tamanho");
            parts[i] = b; done += b.size; onProgress?.(done, total);
            break;
          } catch (e) { if (t >= 2) throw e; await new Promise(r => setTimeout(r, 600 * (t + 1))); }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));
    const blob = new Blob(parts, { type: "application/octet-stream" });
    if (cache) {
      try {
        for (const k of await cache.keys()) if (k.url.includes(`/__rom/${id}/`)) await cache.delete(k);
        await cache.put(key, new Response(blob));
      } catch { /* sem espaço: segue sem cache */ }
    }
    return blob;
  } catch { return null; }
}
