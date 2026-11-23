import { supabase } from "./supabase";
import { r2Base, isR2, r2PublicUrl, imageUrl } from "./r2";

export type PublicProfile = {
  id: string; username: string; role: string;
  displayName: string; pronouns: string; status: string; bio: string; accent: string;
  avatar: string; banner: string; avatarKey: string | null; bannerKey: string | null; since: string | null;
  followers: number; following: number; iFollow: boolean;
  games: { game_id: string; name: string; cover_path: string | null; plays: number; last_played: string }[];
};

function need() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  return supabase;
}

export async function fetchProfile(username: string): Promise<PublicProfile | null> {
  const sb = need();
  await r2Base();
  const { data: p } = await sb.from("profiles").select("*").ilike("username", username).maybeSingle();
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
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { id: p.id as string, username: p.username as string, role: p.role as string,
    displayName: str(p.display_name), pronouns: str(p.pronouns), status: str(p.status_text), bio: str(p.bio), accent: str(p.accent_color) || "#7865f5",
    avatar: imageUrl(p.avatar_path), banner: imageUrl(p.banner_path), avatarKey: (p.avatar_path as string | null) ?? null, bannerKey: (p.banner_path as string | null) ?? null,
    since: typeof p.created_at === "string" ? p.created_at : null, followers: fo.count ?? 0, following: fi.count ?? 0, iFollow: !!mine.data, games };
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

export type ProfileEdit = {
  displayName: string; pronouns: string; status: string; bio: string; accent: string;
  avatarKey: string | null; bannerKey: string | null;
};

export async function updateMyProfile(id: string, e: ProfileEdit) {
  const { error } = await need().from("profiles").update({
    display_name: e.displayName.trim() || null, pronouns: e.pronouns.trim() || null, status_text: e.status.trim() || null,
    bio: e.bio.trim() || null, accent_color: e.accent, avatar_path: e.avatarKey, banner_path: e.bannerKey,
  }).eq("id", id);
  if (error) throw new Error(/profiles_custom_check|column/.test(error.message) ? "Falta correr o SQL do perfil no Supabase (supabase/gamehub-profile.sql)." : error.message);
}

export function coverUrl(path: string | null) {
  if (path && isR2(path)) return r2PublicUrl(path);
  if (!path || !supabase) return null;
  return supabase.storage.from("game-files").getPublicUrl(path).data.publicUrl;
}

export type PersonHit = { id: string; username: string; displayName: string; status: string; accent: string; avatar: string; iFollow: boolean };

// Procura utilizadores (sem texto: os mais recentes). Se as colunas novas ainda não existirem, procura só pelo utilizador.
export async function searchPeople(query: string): Promise<PersonHit[]> {
  const sb = need();
  await r2Base();
  const q = query.trim().replace(/[,()*%_\\]/g, " ").trim();
  const run = (cols: string) => {
    let req = sb.from("profiles").select("*").neq("role", "admin").limit(30);
    if (q) req = req.or(cols.split(",").map(c => `${c}.ilike.%${q}%`).join(","));
    return req.order("username", { ascending: true });
  };
  let res = await run("username,display_name");
  if (res.error) res = await run("username");
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as Record<string, unknown>[];
  const { data: s } = await sb.auth.getSession();
  const me = s.session?.user.id;
  let followed = new Set<string>();
  if (me && rows.length) {
    const { data: f } = await sb.from("follows").select("followee_id").eq("follower_id", me).in("followee_id", rows.map(r => r.id as string));
    followed = new Set(((f ?? []) as { followee_id: string }[]).map(x => x.followee_id));
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return rows.map(r => ({
    id: r.id as string, username: str(r.username), displayName: str(r.display_name), status: str(r.status_text),
    accent: str(r.accent_color) || "#7865f5", avatar: imageUrl(r.avatar_path as string | null), iFollow: followed.has(r.id as string),
  }));
}
