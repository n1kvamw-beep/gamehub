import { supabase } from "./supabase";
import { filesFromUpload, entryOf } from "./importer";
import type { Game, Visibility } from "./types";
import { r2Base, isR2, isR2Rom, r2PublicUrl, r2RomUrl } from "./r2";

const BUCKET = "game-files";
const META_KEY = "gamehub:remote-meta";

type Row = {
  id: string; name: string; description: string | null; category: string; genre: string;
  platform: string; file_path: string; cover_path: string | null; is_public: boolean; created_at: string; restricted?: boolean | null; visibility?: string | null;
};
type Meta = { favorite?: boolean; lastPlayed?: number; playCount?: number };

function readMeta(): Record<string, Meta> {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
}
// "Jogado recentemente" e contagem de partidas ficam neste navegador.
export function setRemoteMeta(id: string, patch: Meta) {
  try {
    const all = readMeta();
    all[id] = { ...all[id], ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch { /* sem armazenamento disponível */ }
}

function publicUrl(path: string) {
  if (isR2(path)) return r2PublicUrl(path);
  return supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Favoritos guardados na conta (tabela favorites, protegida por RLS: cada pessoa só vê os seus).
async function fetchFavoriteIds(): Promise<Set<string>> {
  if (!supabase || !(await currentUserId())) return new Set();
  const { data, error } = await supabase.from("favorites").select("game_id");
  if (error) return new Set();
  return new Set(((data ?? []) as { game_id: string }[]).map(r => r.game_id));
}

export async function setFavorite(gameId: string, on: boolean) {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  const userId = await currentUserId();
  if (!userId) throw new Error("Entra na tua conta para guardar favoritos.");
  const { error } = on
    ? await supabase.from("favorites").upsert({ user_id: userId, game_id: gameId }, { onConflict: "user_id,game_id", ignoreDuplicates: true })
    : await supabase.from("favorites").delete().eq("user_id", userId).eq("game_id", gameId);
  if (error) throw new Error(error.message);
}

type Stats = { plays: number; votes: number; avg: number | null; comments: number };
async function fetchStats(): Promise<Record<string, Stats>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from("game_stats").select("game_id,plays,votes,avg_stars,comments");
  if (error) return {};
  const out: Record<string, Stats> = {};
  for (const r of (data ?? []) as { game_id: string; plays: number | null; votes: number | null; avg_stars: number | null; comments: number | null }[]) {
    out[r.game_id] = { plays: Number(r.plays ?? 0), votes: Number(r.votes ?? 0), avg: r.avg_stars == null ? null : Number(r.avg_stars), comments: Number(r.comments ?? 0) };
  }
  return out;
}

function visOf(r: Row): Visibility {
  return r.visibility === "family" || r.visibility === "private" || r.visibility === "public" ? r.visibility : (r.is_public ? "public" : "private");
}

export async function fetchRemoteGames(): Promise<Game[]> {
  if (!supabase) return [];
  await r2Base();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const meta = readMeta();
  const favs = await fetchFavoriteIds();
  const stats = await fetchStats();
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
    favorite: favs.has(r.id),
    lastPlayed: meta[r.id]?.lastPlayed,
    playCount: meta[r.id]?.playCount ?? 0,
    isPublic: visOf(r) === "public",
    visibility: visOf(r),
    stats: stats[r.id],
    remote: { filePath: r.file_path, coverPath: r.cover_path, restricted: !!r.restricted },
  }));
}

// ROMs restritas ficam num bucket privado: o link é assinado e só funciona para utilizadores aprovados.
export async function remoteFileUrl(game: Game): Promise<string> {
  if (!game.remote) return "";
  if (isR2Rom(game.remote.filePath)) return r2RomUrl(game.id);
  if (!game.remote.restricted) return publicUrl(game.remote.filePath);
  if (!supabase) throw new Error("O Supabase não está configurado.");
  const { data, error } = await supabase.storage.from("rom-files").createSignedUrl(game.remote.filePath, 6 * 3600);
  if (error || !data) throw new Error("Sem permissão para este jogo. Pede ao administrador para te aprovar.");
  return data.signedUrl;
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
