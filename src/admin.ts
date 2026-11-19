import { zipSync } from "fflate";
import { supabase } from "./supabase";
import type { Game, GameFile } from "./types";

const BUCKET = "game-files";

export type GameForm = {
  name: string; description: string; category: string; genre: string; platform: string; isPublic: boolean;
};

function need() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  return supabase;
}

async function zipFiles(files: GameFile[]): Promise<Blob> {
  const data: Record<string, Uint8Array> = {};
  for (const file of files) data[file.path] = new Uint8Array(await file.blob.arrayBuffer());
  return new Blob([zipSync(data)], { type: "application/zip" });
}

async function upload(path: string, body: Blob, contentType: string) {
  const { error } = await need().storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Falha no envio do ficheiro: ${error.message}`);
}

async function removeFiles(paths: Array<string | null | undefined>) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await need().storage.from(BUCKET).remove(list);
}

// Cria ou atualiza um jogo: envia ZIP/capa para o Storage e grava a linha na tabela games.
export async function saveRemoteGame(input: { existing: Game | null; form: GameForm; files: GameFile[]; cover: string }) {
  const sb = need();
  const old = input.existing;
  const id = old?.id ?? crypto.randomUUID();
  let filePath = old?.remote?.filePath;
  let coverPath: string | null = old?.remote?.coverPath ?? null;
  const uploaded: string[] = [];
  const obsolete: Array<string | null | undefined> = [];
  try {
    if (input.files.length) {
      const zip = await zipFiles(input.files);
      const path = `${id}/${Date.now()}.zip`;
      await upload(path, zip, "application/zip");
      uploaded.push(path);
      obsolete.push(filePath);
      filePath = path;
    }
    if (input.cover.startsWith("data:")) {
      const blob = await (await fetch(input.cover)).blob();
      const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
      const path = `covers/${id}-${Date.now()}.${ext}`;
      await upload(path, blob, blob.type || "image/png");
      uploaded.push(path);
      obsolete.push(coverPath);
      coverPath = path;
    } else if (!input.cover) {
      obsolete.push(coverPath);
      coverPath = null;
    }
    if (!filePath) throw new Error("Falta o ficheiro do jogo.");
    const row = {
      name: input.form.name, description: input.form.description, category: input.form.category,
      genre: input.form.genre, platform: input.form.platform, file_path: filePath,
      cover_path: coverPath, is_public: input.form.isPublic,
    };
    const { error } = old
      ? await sb.from("games").update(row).eq("id", id)
      : await sb.from("games").insert({ id, ...row });
    if (error) throw new Error(error.message);
    await removeFiles(obsolete);
  } catch (e) {
    await removeFiles(uploaded).catch(() => {});
    throw e;
  }
}

export async function deleteRemoteGame(game: Game) {
  const { error } = await need().from("games").delete().eq("id", game.id);
  if (error) throw new Error(error.message);
  await removeFiles([game.remote?.filePath, game.remote?.coverPath]);
}

export async function downloadRemoteGame(game: Game) {
  const path = game.remote?.filePath;
  if (!path) return;
  const { data, error } = await need().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Não foi possível descarregar o jogo.");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${game.name.replace(/[^\w-]+/g, "_") || "jogo"}.${path.split(".").pop() || "zip"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
