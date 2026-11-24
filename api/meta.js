// Procura o nome oficial e a capa de um jogo de consola (base de dados libretro-thumbnails, estilo Emby).
const HOST = "https://thumbnails.libretro.com";
const SYSTEMS = {
  "PSP": ["Sony - PlayStation Portable"], "PlayStation 1": ["Sony - PlayStation"], "Sega CD": ["Sega - Mega-CD - Sega CD"],
  "Sega Saturn": ["Sega - Saturn"], "3DO": ["The 3DO Company - 3DO"], "Mega Drive": ["Sega - Mega Drive - Genesis"],
  "NES": ["Nintendo - Nintendo Entertainment System"], "Super Nintendo": ["Nintendo - Super Nintendo Entertainment System"],
  "Nintendo 64": ["Nintendo - Nintendo 64"], "Game Boy": ["Nintendo - Game Boy", "Nintendo - Game Boy Color"],
  "Game Boy Advance": ["Nintendo - Game Boy Advance"], "Nintendo DS": ["Nintendo - Nintendo DS"],
  "Master System": ["Sega - Master System - Mark III"], "Game Gear": ["Sega - Game Gear"], "Sega 32X": ["Sega - 32X"],
  "Atari 2600": ["Atari - 2600"], "Atari 7800": ["Atari - 7800"], "Atari Lynx": ["Atari - Lynx"], "Atari Jaguar": ["Atari - Jaguar"],
  "PC Engine": ["NEC - PC Engine - TurboGrafx 16", "NEC - PC Engine CD - TurboGrafx-CD"],
  "Neo Geo Pocket": ["SNK - Neo Geo Pocket Color", "SNK - Neo Geo Pocket"], "WonderSwan": ["Bandai - WonderSwan Color", "Bandai - WonderSwan"],
  "Virtual Boy": ["Nintendo - Virtual Boy"], "ColecoVision": ["Coleco - ColecoVision"],
  "Arcade (MAME)": ["MAME"], "Arcade (FBNeo)": ["FBNeo - Arcade Games"]
};
const REGIONS = ["europe", "world", "usa", "portugal", "spain", "japan"];
const cache = new Map(); // listagens em memória (instância quente)

const norm = s => s.toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/^(the|a|an) /, "").replace(/, (the|a|an)$/, "").replace(/[^a-z0-9]+/g, " ").trim();
const tags = s => (s.match(/\(([^)]*)\)/g) || []).join(" ").toLowerCase();

async function listing(sys) {
  const hit = cache.get(sys);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
  const r = await fetch(`${HOST}/${encodeURIComponent(sys)}/Named_Boxarts/`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("listagem " + r.status);
  const html = await r.text();
  const names = [];
  for (const m of html.matchAll(/href="([^"]+?)\.png"/gi)) { try { names.push(decodeURIComponent(m[1])); } catch { /* ignora */ } }
  cache.set(sys, { t: Date.now(), v: names });
  return names;
}

function best(names, query) {
  const q = norm(query); if (!q) return null;
  const qt = q.split(" ");
  const regionRank = n => { const t = tags(n); const i = REGIONS.findIndex(r => t.includes(r)); return i < 0 ? 9 : i; };
  const penal = n => (/\b(beta|proto|demo|sample|unl|pirate|hack)\b/i.test(tags(n)) ? 5 : 0) + (/rev|v\d/i.test(tags(n)) ? 0.5 : 0);
  let exact = names.filter(n => norm(n) === q);
  if (!exact.length) {
    const c = names.map(n => ({ n, nn: norm(n) })).filter(x => qt.every(t => x.nn.split(" ").includes(t)) || x.nn.startsWith(q));
    if (!c.length) return null;
    const min = Math.min(...c.map(x => x.nn.length));
    exact = c.filter(x => x.nn.length <= min + 3).map(x => x.n);
  }
  return exact.sort((a, b) => regionRank(a) + penal(a) - regionRank(b) - penal(b))[0];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const name = String(req.query.name || "").slice(0, 200);
  const systems = SYSTEMS[String(req.query.platform || "")];
  if (!name || !systems) return res.status(400).json({ error: "pedido inválido" });
  try {
    for (const sys of systems) {
      let file = null;
      try { file = best(await listing(sys), name); } catch { /* tenta tentativa direta abaixo */ }
      if (!file) { // tentativa direta (nome já no formato No-Intro)
        file = name.replace(/[&*/:`<>?\\|]/g, "_");
      }
      const img = await fetch(`${HOST}/${encodeURIComponent(sys)}/Named_Boxarts/${encodeURIComponent(file)}.png`, { signal: AbortSignal.timeout(8000) });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length > 3 * 1024 * 1024) continue;
      return res.status(200).json({ title: file.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").replace(/^(.*), (The|A|An)$/, "$2 $1").trim(), full: file, cover: "data:image/png;base64," + buf.toString("base64") });
    }
    return res.status(404).json({ error: "não encontrado" });
  } catch (e) {
    return res.status(502).json({ error: "falha ao procurar" });
  }
}
