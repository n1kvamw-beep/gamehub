import { unzipSync } from "fflate";
import type { Game, GameFile } from "./types";

const MAX_FILES = 1500;
const MAX_TOTAL = 300 * 1024 * 1024;

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
  if (total > MAX_TOTAL) throw new Error("O jogo excede o limite de 300 MB.");
  const entry = files.find(f => f.path.toLowerCase() === "index.html") ||
    files.find(f => f.path.toLowerCase().endsWith("/index.html")) ||
    files.find(f => /\.html?$/i.test(f.path));
  if (!entry) throw new Error("Não foi encontrado um ficheiro HTML de entrada (por exemplo, index.html).");
  return entry.path;
}
export function entryOf(files: GameFile[]) { return validate(files); }
export async function filesFromUpload(fileList: FileList | File[]): Promise<GameFile[]> {
  const files: GameFile[] = [];
  for (const file of Array.from(fileList)) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
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
  return { ...input, id: crypto.randomUUID(), entry, addedAt: Date.now(), favorite: false, playCount: 0 };
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
    if (/<head[^>]*>/i.test(source)) source = source.replace(/<head[^>]*>/i, m => m + csp);
    else source = csp + source;
    return { url: URL.createObjectURL(new Blob([source], { type: "text/html" })), urls: [...urls.values()] };
  });
}
