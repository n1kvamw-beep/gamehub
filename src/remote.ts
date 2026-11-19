import { supabase } from "./supabase";
import { filesFromUpload, entryOf } from "./importer";
import type { Game } from "./types";

const BUCKET = "game-files";
const META_KEY = "gamehub:remote-meta";

type Row = {
  id: string; name: string; description: string | null; category: string; genre: string;
  platform: string; file_path: string; cover_path: string | null; is_public: boolean; created_at: string;
};
type Meta = { favorite?: boolean; lastPlayed?: number; playCount?: number };

function readMeta(): Record<string, Meta> {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
}
// Favoritos e "jogado recentemente" dos jogos online ficam neste navegador até haver contas (Fase 5).
export function setRemoteMeta(id: string, patch: Meta) {
  try {
    const all = readMeta();
    all[id] = { ...all[id], ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch { /* sem armazenamento disponível */ }
}

function publicUrl(path: string) {
  return supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
}

export async function fetchRemoteGames(): Promise<Game[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("games")
    .select("id,name,description,category,genre,platform,file_path,cover_path,is_public,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const meta = readMeta();
  return ((data ?? []) as Row[]).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    category: r.category,
    genre: r.genre,
    platform: r.platform,
    cover: r.cover_path ? publicUrl(r.cover_path) : undefined,
    files: [],
    entry: "",
    addedAt: new Date(r.created_at).getTime(),
    favorite: !!meta[r.id]?.favorite,
    lastPlayed: meta[r.id]?.lastPlayed,
    playCount: meta[r.id]?.playCount ?? 0,
    isPublic: r.is_public,
    remote: { filePath: r.file_path, coverPath: r.cover_path },
  }));
}

// Descarrega o ZIP/HTML do jogo do Storage e prepara os ficheiros para jogar.
export async function loadRemoteGameFiles(game: Game): Promise<Game> {
  if (!game.remote) return game;
  const response = await fetch(publicUrl(game.remote.filePath));
  if (!response.ok) throw new Error("Não foi possível descarregar os ficheiros do jogo.");
  const blob = await response.blob();
  const name = game.remote.filePath.split("/").pop() || "index.html";
  const files = await filesFromUpload([new File([blob], name)]);
  return { ...game, files, entry: entryOf(files) };
}
