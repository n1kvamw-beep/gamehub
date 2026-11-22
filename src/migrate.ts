import { supabase } from "./supabase";
import type { Game } from "./types";
import { isR2, r2Base, r2Put, r2Verify } from "./r2";

const BUCKET = "game-files";

export const needsMigration = (g: Game) => !!g.remote && !g.remote.restricted && !isR2(g.remote.filePath);

async function move(path: string, key: string): Promise<string> {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível ler ${path} do Supabase (${res.status}).`);
  const blob = await res.blob();
  await r2Put(key, blob, blob.type || "application/octet-stream");
  if (!(await r2Verify(key, blob.size))) throw new Error(`O ficheiro ${key} não chegou completo ao Cloudflare. Verifica o endereço público e o CORS do bucket.`);
  return "r2:" + key;
}

// Copia o jogo para o R2, confirma, aponta a base de dados para lá e só depois apaga do Supabase.
export async function migrateGame(game: Game) {
  if (!supabase || !game.remote || !needsMigration(game)) return;
  if (!(await r2Base())) throw new Error("O Cloudflare R2 não está configurado no Vercel.");
  const oldFile = game.remote.filePath;
  const oldCover = game.remote.coverPath && !isR2(game.remote.coverPath) ? game.remote.coverPath : null;
  const file = await move(oldFile, `games/${game.id}/${oldFile.split("/").pop()}`);
  const cover = oldCover ? await move(oldCover, oldCover) : game.remote.coverPath ?? null;
  const { error } = await supabase.from("games").update({ file_path: file, cover_path: cover }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([oldFile, ...(oldCover ? [oldCover] : [])]);
}
