import { uuid } from "./compat";
import { unzipSync } from "fflate";
import type { Game, GameFile } from "./types";

const MAX_FILES = 1500;
const MAX_TOTAL = 300 * 1024 * 1024;
const MAX_ROM = 4 * 1024 * 1024 * 1024;
const ROM_RE = /\.(iso|cso|chd|pbp|cue|bin|img|mdf|md|gen|smd|nes|sfc|smc|z64|n64|v64|gb|gbc|gba|nds|sms|gg|32x|a26|a78|lnx|lyx|ngp|ngc|pce|vb|vboy|ws|wsc|col|cv|j64|jag|rom|mx1|mx2|dsk|cas|zip)$/i;
export const isRomPath = (p: string) => ROM_RE.test(p);
/** Jogo de emulador: tem imagem de disco e nenhum HTML de entrada. */
export const isRomGame = (files: { path: string }[]) => !files.some(f => /\.html?$/i.test(f.path)) && files.some(f => isRomPath(f.path));
/** Plataforma (campo platform) -> núcleo do EmulatorJS. */
export const EMU_CORES: Record<string, string> = {
  "PSP": "psp", "PlayStation 1": "psx", "Sega CD": "segaCD", "Sega Saturn": "segaSaturn", "3DO": "3do",
  "Mega Drive": "segaMD", "NES": "nes", "Super Nintendo": "snes", "Nintendo 64": "n64",
  "Game Boy": "gb", "Game Boy Advance": "gba", "Nintendo DS": "nds",
  "Arcade (MAME)": "mame2003", "Arcade (FBNeo)": "arcade",
  "Master System": "segaMS", "Game Gear": "segaGG", "Sega 32X": "sega32x", "Atari 2600": "atari2600", "Atari 7800": "atari7800",
  "Atari Lynx": "lynx", "Atari Jaguar": "jaguar", "PC Engine": "pce", "Neo Geo Pocket": "ngp", "WonderSwan": "ws", "Virtual Boy": "vb", "ColecoVision": "coleco", "MSX": "msx", "MSX2": "msx2"
};
const EXT_PLATFORM: Record<string, string> = {
  md: "Mega Drive", gen: "Mega Drive", smd: "Mega Drive", nes: "NES", sfc: "Super Nintendo", smc: "Super Nintendo",
  z64: "Nintendo 64", n64: "Nintendo 64", v64: "Nintendo 64", sms: "Master System", gg: "Game Gear", "32x": "Sega 32X", a26: "Atari 2600", a78: "Atari 7800", lnx: "Atari Lynx", lyx: "Atari Lynx",
  jag: "Atari Jaguar", j64: "Atari Jaguar", pce: "PC Engine", ngp: "Neo Geo Pocket", ngc: "Neo Geo Pocket", ws: "WonderSwan", wsc: "WonderSwan", vb: "Virtual Boy", vboy: "Virtual Boy", col: "ColecoVision", mx1: "MSX", mx2: "MSX2", rom: "MSX2", dsk: "MSX2", cas: "MSX2", cv: "ColecoVision", gb: "Game Boy", gbc: "Game Boy", gba: "Game Boy Advance", nds: "Nintendo DS"
};
/** Adivinha a plataforma pela extensão; ISO/BIN/CUE são ambíguos (devolve undefined). */
export function guessPlatform(files: { path: string }[]): string | undefined {
  // Um .zip guardado inteiro (sem HTML nem imagens) é um conjunto de ROMs de arcade.
  if (files.length === 1 && /\.zip$/i.test(files[0].path)) return "Arcade (MAME)";
  for (const f of files) { const p = EXT_PLATFORM[f.path.split(".").pop()?.toLowerCase() || ""]; if (p) return p; }
  return undefined;
}
export const coreFor = (platform: string): string | undefined => EMU_CORES[platform];

function safePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some(p => p === "..")) throw new Error("O arquivo contém um caminho inválido.");
  return normalized;
}
function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string,string> = {
    html:"text/html", htm:"text/html", js:"text/javascript", mjs:"text/javascript", css:"text/css",
    json:"application/json", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp",
    svg:"image/svg+xml", mp3:"audio/mpeg", ogg:"audio/ogg", wav:"audio/wav", mp4:"video/mp4",
    webm:"video/webm", wasm:"application/wasm", txt:"text/plain", xml:"application/xml",
    woff:"font/woff", woff2:"font/woff2", ttf:"font/ttf", ico:"image/x-icon"
  };
  return map[ext || ""] || "application/octet-stream";
}
function validate(files: GameFile[]) {
  if (!files.length) throw new Error("Não foram encontrados ficheiros no jogo.");
  if (files.length > MAX_FILES) throw new Error("O jogo excede o limite de 1500 ficheiros.");
  const total = files.reduce((n, f) => n + f.blob.size, 0);
  if (isRomGame(files)) { if (total > MAX_ROM) throw new Error("A imagem de disco excede o limite de 4 GB."); }
  else if (total > MAX_TOTAL) throw new Error("O jogo excede o limite de 300 MB.");
  const entry = files.find(f => f.path.toLowerCase() === "index.html") ||
    files.find(f => f.path.toLowerCase().endsWith("/index.html")) ||
    files.find(f => /\.html?$/i.test(f.path)) ||
    files.find(f => /\.(iso|cso|chd|pbp|img|mdf)$/i.test(f.path)) ||
    files.find(f => isRomPath(f.path));
  if (!entry) throw new Error("Não foi encontrado um ficheiro HTML de entrada nem uma imagem de disco (.iso).");
  return entry.path;
}
export function entryOf(files: GameFile[]) { return validate(files); }
export async function filesFromUpload(fileList: FileList | File[]): Promise<GameFile[]> {
  const files: GameFile[] = [];
  for (const file of Array.from(fileList)) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
      // Conjunto de ROMs de arcade (MAME/FBNeo): o ZIP tem de ficar inteiro, o nome do ficheiro é o nome do jogo.
      const names = Object.keys(zipped).filter(n => !n.endsWith("/"));
      if (files.length === 0 && Array.from(fileList).length === 1 && names.length && !names.some(n => /\.(html?|js|css|json|png|jpe?g|webp|svg|mp3|ogg|wasm)$/i.test(n) || ROM_RE.test(n) && !/\.zip$/i.test(n))) {
        files.push({ path: safePath(file.name.replace(/[^\w.-]+/g, "_")), blob: file, type: "application/zip" });
        continue;
      }
      for (const [path, data] of Object.entries(zipped)) {
        if (path.endsWith("/")) continue;
        const safe = safePath(path);
        files.push({ path: safe, blob: new Blob([data], { type: mimeFor(safe) }), type: mimeFor(safe) });
      }
    } else {
      const path = safePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
      files.push({ path, blob: file, type: file.type || mimeFor(path) });
    }
  }
  return files;
}
export function makeGame(input: Omit<Game, "id" | "addedAt" | "favorite" | "playCount" | "entry"> & { files: GameFile[] }): Game {
  const entry = validate(input.files);
  return { ...input, id: uuid(), entry, addedAt: Date.now(), favorite: false, playCount: 0 };
}
export function makePlayableDocument(game: Game) {
  const urls = new Map<string, string>();
  for (const file of game.files) urls.set(file.path, URL.createObjectURL(file.blob));
  const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  let html = game.files.find(f => f.path === game.entry)!.blob;
  return html.text().then(source => {
    const baseDir = game.entry.includes("/") ? game.entry.slice(0, game.entry.lastIndexOf("/") + 1) : "";
    const resolve = (raw: string) => {
      if (/^(https?:|data:|blob:|#|\/\/)/i.test(raw)) return raw;
      const clean = raw.split(/[?#]/)[0];
      const candidates = [baseDir + clean, clean, clean.replace(/^\.\//, "")];
      for (const c of candidates) if (urls.has(c)) return urls.get(c)!;
      return raw;
    };
    source = source.replace(/\b(src|href)=(["'])(.*?)\2/gi, (_m, attr, quote, value) => `${attr}=${quote}${escapeAttr(resolve(value))}${quote}`);
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; style-src 'self' 'unsafe-inline' blob: https:; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; connect-src https: wss:; font-src 'self' blob: data: https:; object-src 'none'; base-uri 'none'">`;
    const pad = `<script>addEventListener("message",function(e){var d=e.data;if(!d||d.gh!=="key"||e.source!==window.parent)return;var o={key:d.key,code:d.code,bubbles:true,cancelable:true};var ev=new KeyboardEvent(d.type==="u"?"keyup":"keydown",o);try{Object.defineProperty(ev,"keyCode",{get:function(){return d.kc}});Object.defineProperty(ev,"which",{get:function(){return d.kc}})}catch(x){}var t=document.querySelector("canvas")||document.activeElement||document.body;t.dispatchEvent(ev)});</script>`;
    if (/<head[^>]*>/i.test(source)) source = source.replace(/<head[^>]*>/i, m => m + csp + pad);
    else source = csp + pad + source;
    return { url: URL.createObjectURL(new Blob([source], { type: "text/html" })), urls: [...urls.values()] };
  });
}
