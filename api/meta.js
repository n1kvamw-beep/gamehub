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

const UA = { "User-Agent": "GameHub/1.0 (https://gamehub-five-henna.vercel.app)" };
const tmo = ms => AbortSignal.timeout(Math.min(ms, 5000));
const toData = async (url, headers = {}) => {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: tmo(9000), redirect: "follow" });
  if (!r.ok) throw new Error("img " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 500 || buf.length > 3.5 * 1024 * 1024) throw new Error("img tamanho");
  const type = (r.headers.get("content-type") || "image/png").split(";")[0];
  return `data:${type};base64,${buf.toString("base64")}`;
};
const cleanTitle = f => f.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").replace(/^(.*), (The|A|An)$/, "$2 $1").trim();

// 1) libretro: lista oficial (procura aproximada) e, se falhar, tentativa direta no GitHub
async function fromLibretro(name, systems, tried, direct) {
  for (const sys of systems) {
    let file = null;
    if (!direct) { try { file = best(await listing(sys), name); } catch (e) { tried.push("libretro-lista:" + (e.message || "erro")); } if (!file) continue; }
    const repo = sys.replace(/ /g, "_");
    const cands = file ? [file] : ["", " (World)", " (USA)", " (Europe)", " (USA, Europe)"].map(x => name + x);
    for (const c of cands) {
      const f = c.replace(/[&*/:`<>?\\|]/g, "_");
      for (const base of [`${HOST}/${encodeURIComponent(sys)}/Named_Boxarts/`, `https://raw.githubusercontent.com/libretro-thumbnails/${encodeURIComponent(repo)}/master/Named_Boxarts/`]) {
        try { return { title: cleanTitle(c), full: c, cover: await toData(base + encodeURIComponent(f) + ".png"), source: "libretro" }; } catch { /* próxima */ }
      }
      if (file) break;
    }
  }
  return null;
}

// 2) Wikipédia: imagem principal do artigo do jogo (capa da caixa)
async function fromWikipedia(name, platform, tried) {
  const plat = platform.replace(/\s*\(.*\)/, "");
  const q = `${name} ${plat} video game`;
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&generator=search&gsrlimit=6&gsrsearch=" + encodeURIComponent(q) + "&prop=pageimages&piprop=thumbnail&pithumbsize=600";
  try {
    const r = await fetch(url, { headers: UA, signal: tmo(9000) });
    if (!r.ok) throw new Error("wiki " + r.status);
    const pages = Object.values((await r.json())?.query?.pages || {}).sort((a, b) => a.index - b.index);
    const qn = norm(name).split(" ").filter(Boolean);
    for (const p of pages) {
      const tn = norm(p.title);
      if (!p.thumbnail?.source || !qn.every(t => tn.split(" ").includes(t) || tn.includes(t))) continue;
      if (/\.svg/i.test(p.thumbnail.source)) continue;
      try { return { title: p.title.replace(/\s*\((video game|[^)]*game[^)]*)\)/i, "").trim(), full: p.title, cover: await toData(p.thumbnail.source), source: "wikipedia" }; } catch (e) { tried.push("wiki-img:" + e.message); }
    }
  } catch (e) { tried.push("wikipedia:" + (e.message || "erro")); }
  return null;
}

// 3) RAWG (opcional): só se existir a variável RAWG_KEY no Vercel
async function fromRawg(name, tried) {
  const key = process.env.RAWG_KEY; if (!key) return null;
  try {
    const r = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&page_size=3&key=${key}`, { signal: tmo(9000) });
    const g = (await r.json())?.results?.find(x => x.background_image);
    if (g) return { title: g.name, full: g.name, cover: await toData(g.background_image), source: "rawg" };
  } catch (e) { tried.push("rawg:" + (e.message || "erro")); }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const name = String(req.query.name || "").slice(0, 200);
  const platform = String(req.query.platform || "");
  const systems = SYSTEMS[platform];
  if (!name || !systems) return res.status(400).json({ error: "pedido inválido" });
  const tried = [];
  try {
    const hit = (await fromLibretro(name, systems, tried, false)) || (await fromWikipedia(name, platform, tried)) || (await fromLibretro(name, systems, tried, true)) || (await fromRawg(name, tried));
    if (hit) return res.status(200).json(hit);
    return res.status(404).json({ error: "não encontrado", tried });
  } catch (e) {
    return res.status(502).json({ error: "falha ao procurar", tried });
  }
}
