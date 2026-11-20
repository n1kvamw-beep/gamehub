import { supabase } from "./supabase";

export type Comment = { id: string; user_id: string; username: string; body: string; created_at: string };

function need() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  return supabase;
}
async function userId() {
  const { data } = await need().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Entra na tua conta para participar.");
  return id;
}

export async function fetchComments(gameId: string): Promise<Comment[]> {
  const { data, error } = await need().from("comments")
    .select("id,user_id,username,body,created_at")
    .eq("game_id", gameId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Comment[];
}

export async function addComment(gameId: string, body: string) {
  const id = await userId();
  const { error } = await need().from("comments").insert({ game_id: gameId, user_id: id, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteComment(commentId: string) {
  const { error } = await need().from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}

export async function fetchMyRating(gameId: string): Promise<number> {
  const { data } = await need().auth.getSession();
  if (!data.session) return 0;
  const { data: row } = await need().from("ratings").select("stars").eq("game_id", gameId).maybeSingle();
  return (row?.stars as number | undefined) ?? 0;
}

export async function setRating(gameId: string, stars: number) {
  const id = await userId();
  const { error } = await need().from("ratings").upsert({ user_id: id, game_id: gameId, stars }, { onConflict: "user_id,game_id" });
  if (error) throw new Error(error.message);
}

// Conta uma partida no ranking global (falha em silêncio).
export async function registerPlay(gameId: string) {
  try { await need().rpc("register_play", { p_game: gameId }); } catch { /* ignorado */ }
}
