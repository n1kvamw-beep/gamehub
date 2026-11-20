import { supabase } from "./supabase";

export type PublicProfile = {
  id: string; username: string; role: string;
  followers: number; following: number; iFollow: boolean;
  games: { game_id: string; name: string; cover_path: string | null; plays: number; last_played: string }[];
};

function need() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  return supabase;
}

export async function fetchProfile(username: string): Promise<PublicProfile | null> {
  const sb = need();
  const { data: p } = await sb.from("profiles").select("id,username,role").ilike("username", username).maybeSingle();
  if (!p) return null;
  const { data: s } = await sb.auth.getSession();
  const me = s.session?.user.id;
  const [fo, fi, mine, ug] = await Promise.all([
    sb.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", p.id),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id),
    me ? sb.from("follows").select("followee_id").eq("follower_id", me).eq("followee_id", p.id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("user_games").select("game_id,plays,last_played,games(name,cover_path)").eq("user_id", p.id).order("last_played", { ascending: false }).limit(60),
  ]);
  type Row = { game_id: string; plays: number; last_played: string; games: { name: string; cover_path: string | null } | { name: string; cover_path: string | null }[] | null };
  const games = ((ug.data ?? []) as Row[]).flatMap(r => {
    const g = Array.isArray(r.games) ? r.games[0] : r.games;
    return g ? [{ game_id: r.game_id, name: g.name, cover_path: g.cover_path, plays: r.plays, last_played: r.last_played }] : [];
  });
  return { id: p.id as string, username: p.username as string, role: p.role as string, followers: fo.count ?? 0, following: fi.count ?? 0, iFollow: !!mine.data, games };
}

export async function setFollow(targetId: string, on: boolean) {
  const sb = need();
  const { data } = await sb.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Entra na tua conta para seguir.");
  const { error } = on
    ? await sb.from("follows").insert({ follower_id: me, followee_id: targetId })
    : await sb.from("follows").delete().eq("follower_id", me).eq("followee_id", targetId);
  if (error) throw new Error(error.message);
}

export function coverUrl(path: string | null) {
  if (!path || !supabase) return null;
  return supabase.storage.from("game-files").getPublicUrl(path).data.publicUrl;
}
