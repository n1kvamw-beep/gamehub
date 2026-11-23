import { uuid } from "./compat";
import { zipSync } from "fflate";
import { supabase } from "./supabase";
import type { Game, GameFile, Visibility } from "./types";
import { isRomGame } from "./importer";
import { r2Base, r2Put, r2Delete, r2Key, r2RomKey, isR2, isR2Rom, r2PublicUrl, r2RomUrl } from "./r2";

const BUCKET = "game-files";
const ROM_BUCKET = "rom-files";
type Stored = { bucket: string; path: string | null | undefined };

export type GameForm = {
  name: string; description: string; category: string; genre: string; platform: string; isPublic: boolean; visibility: Visibility;
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

async function upload(path: string, body: Blob, contentType: string, bucket = BUCKET) {
  const { error } = await need().storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Falha no envio do ficheiro: ${error.message}`);
}

async function removeFiles(items: Stored[]) {
  const r2 = items.filter(i => isR2(i.path)).map(i => r2Key(i.path as string));
  const roms = items.filter(i => isR2Rom(i.path)).map(i => r2RomKey(i.path as string));
  if (r2.length || roms.length) await r2Delete(r2, roms);
  items = items.filter(i => !isR2(i.path) && !isR2Rom(i.path));
  for (const bucket of [BUCKET, ROM_BUCKET]) {
    const list = items.filter(i => i.bucket === bucket && !!i.path).map(i => i.path as string);
    if (list.length) await need().storage.from(bucket).remove(list);
  }
}

// Cria ou atualiza um jogo: envia ZIP/capa para o Storage e grava a linha na tabela games.
export async function saveRemoteGame(input: { existing: Game | null; form: GameForm; files: GameFile[]; cover: string }) {
  const sb = need();
  const old = input.existing;
  const id = old?.id ?? uuid();
  let filePath = old?.remote?.filePath;
  let coverPath: string | null = old?.remote?.coverPath ?? null;
  const oldRestricted = !!old?.remote?.restricted;
  let restricted = oldRestricted;
  const uploaded: Stored[] = [];
  const obsolete: Stored[] = [];
  try {
    if (input.files.length) {
      // Uma única imagem de disco (.iso, etc.) vai tal como está; o resto vai num ZIP.
      const single = input.files.length === 1 && isRomGame(input.files);
      const body = single ? input.files[0].blob : await zipFiles(input.files);
      const ext = single ? (input.files[0].path.split(".").pop() || "iso").toLowerCase() : "zip";
      const path = `${id}/${Date.now()}.${ext}`;
      restricted = isRomGame(input.files);
      const type = single ? "application/octet-stream" : "application/zip";
      obsolete.push({ bucket: oldRestricted ? ROM_BUCKET : BUCKET, path: filePath });
      if (await r2Base()) {
        // Vai para o Cloudflare R2 (sem o limite de 50 MB do Supabase). ROMs ficam no bucket privado.
        const key = restricted ? `roms/${path}` : `games/${path}`;
        const stored = (restricted ? "r2rom:" : "r2:") + key;
        await r2Put(key, body, type, restricted);
        uploaded.push({ bucket: "r2", path: stored });
        filePath = stored;
      } else {
        const bucket = restricted ? ROM_BUCKET : BUCKET;
        await upload(path, body, type, bucket);
        uploaded.push({ bucket, path });
        filePath = path;
      }
    }
    if (input.cover.startsWith("data:")) {
      const blob = await (await fetch(input.cover)).blob();
      const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
      const path = `covers/${id}-${Date.now()}.${ext}`;
      obsolete.push({ bucket: BUCKET, path: coverPath });
      if (await r2Base()) {
        await r2Put(path, blob, blob.type || "image/png");
        uploaded.push({ bucket: "r2", path: "r2:" + path });
        coverPath = "r2:" + path;
      } else {
        await upload(path, blob, blob.type || "image/png");
        uploaded.push({ bucket: BUCKET, path });
        coverPath = path;
      }
    } else if (!input.cover) {
      obsolete.push({ bucket: BUCKET, path: coverPath });
      coverPath = null;
    }
    if (!filePath) throw new Error("Falta o ficheiro do jogo.");
    const row = {
      name: input.form.name, description: input.form.description, category: input.form.category,
      genre: input.form.genre, platform: input.form.platform, file_path: filePath,
      cover_path: coverPath, is_public: input.form.visibility === "public", visibility: input.form.visibility,
      ...(restricted || oldRestricted ? { restricted } : {}),
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
  await removeFiles([{ bucket: game.remote?.restricted ? ROM_BUCKET : BUCKET, path: game.remote?.filePath }, { bucket: BUCKET, path: game.remote?.coverPath }]);
}

export async function downloadRemoteGame(game: Game) {
  const path = game.remote?.filePath;
  if (!path) return;
  let data: Blob | null = null;
  if (isR2Rom(path)) {
    const res = await fetch(await r2RomUrl(game.id));
    if (res.ok) data = await res.blob();
  } else if (isR2(path)) {
    await r2Base();
    const res = await fetch(r2PublicUrl(path));
    if (res.ok) data = await res.blob();
  } else {
    data = (await need().storage.from(game.remote?.restricted ? ROM_BUCKET : BUCKET).download(path)).data;
  }
  if (!data) throw new Error("Não foi possível descarregar o jogo.");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${game.name.replace(/[^\w-]+/g, "_") || "jogo"}.${path.split(".").pop() || "zip"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Muda a visibilidade (público / família / privado) de vários jogos de uma vez.
export async function setGamesVisibility(ids: string[], visibility: Visibility) {
  if (!ids.length) return;
  const { error } = await need().from("games").update({ visibility, is_public: visibility === "public" }).in("id", ids);
  if (error) throw new Error(error.message);
}
