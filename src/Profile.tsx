import { useEffect, useState } from "react";
import { Gamepad2, UserPlus, UserCheck, ShieldCheck, Pencil, X, Users } from "lucide-react";
import type { AuthUser } from "./auth";
import { fetchProfile, setFollow, coverUrl, listFollow, type PublicProfile, type PersonHit } from "./profile";
import Avatar from "./Avatar";
import ProfileEditor from "./ProfileEditor";

type Props = { username: string; user: AuthUser; onNeedLogin: () => void; onOpenGame: (id: string) => void; onOpenProfile?: (username: string) => void; onProfileChanged?: () => void };

export default function ProfilePanel({ username, user, onNeedLogin, onOpenGame, onOpenProfile, onProfileChanged }: Props) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [listKind, setListKind] = useState<null | "followers" | "following">(null);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [listState, setListState] = useState<"loading" | "ok" | "error">("loading");

  async function openList(kind: "followers" | "following") {
    if (!p) return;
    setListKind(kind); setListState("loading"); setPeople([]);
    try { setPeople(await listFollow(p.id, kind)); setListState("ok"); } catch { setListState("error"); }
  }
  async function toggleOther(h: PersonHit) {
    if (!user) return onNeedLogin();
    setPeople(l => l.map(x => x.id === h.id ? { ...x, iFollow: !x.iFollow } : x));
    try { await setFollow(h.id, !h.iFollow); load(); }
    catch { setPeople(l => l.map(x => x.id === h.id ? { ...x, iFollow: h.iFollow } : x)); }
  }

  async function load() {
    try { const r = await fetchProfile(username); setP(r); setState(r ? "ok" : "missing"); }
    catch { setState("missing"); }
  }
  useEffect(() => { setState("loading"); setError(""); load(); }, [username, user?.id]);

  async function toggle() {
    if (!p) return;
    if (!user) return onNeedLogin();
    if (followBusy) return;
    setFollowBusy(true);
    try { await setFollow(p.id, !p.iFollow); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível seguir."); }
    finally { setFollowBusy(false); }
  }

  if (state === "loading") return <section className="content"><p>A carregar perfil...</p></section>;
  if (!p) return <section className="content"><div className="empty-state compact-empty"><div className="empty-icon"><Gamepad2/></div><h2>Perfil não encontrado</h2></div></section>;
  const isMe = user?.id === p.id;
  return <section className="content profile-page">
    <div className="profile-card" style={{ ["--accent" as string]: p.accent }}>
      <div className="profile-banner" style={p.banner ? { backgroundImage: `url(${p.banner})` } : undefined}/>
      <div className="profile-main">
        <div className="profile-avatar">{p.avatar ? <img src={p.avatar} alt=""/> : <span>{p.username.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="profile-actions">
          {isMe
            ? <button className="secondary-btn" onClick={() => setEditing(true)}><Pencil size={15}/>Editar perfil</button>
            : <button className={p.iFollow ? "secondary-btn" : "primary-btn"} onClick={toggle}>{p.iFollow ? <><UserCheck size={16}/>A seguir</> : <><UserPlus size={16}/>Seguir</>}</button>}
        </div>
        <h1>{p.displayName || p.username} {p.role === "admin" && <span className="badge"><ShieldCheck size={13}/>Admin</span>}</h1>
        <div className="profile-handle">@{p.username}{p.pronouns && <> · {p.pronouns}</>}</div>
        {p.status && <div className="profile-status">{p.status}</div>}
        <div className="profile-counts"><button type="button" className="count-btn" onClick={() => openList("followers")}><strong>{p.followers}</strong> seguidores</button><button type="button" className="count-btn" onClick={() => openList("following")}><strong>{p.following}</strong> a seguir</button><span><strong>{p.games.length}</strong> jogos</span></div>
        {(p.bio || p.since) && <div className="profile-about">
          {p.bio && <><small>SOBRE MIM</small><p>{p.bio}</p></>}
          {p.since && <><small>MEMBRO DESDE</small><p>{new Date(p.since).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}</p></>}
        </div>}
      </div>
    </div>
    {listKind && <div className="modal-backdrop" onClick={() => setListKind(null)}><div className="follow-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={listKind === "followers" ? "Seguidores" : "A seguir"}>
      <div className="follow-head"><h3>{listKind === "followers" ? "Seguidores" : "A seguir"}</h3><button className="icon-btn" onClick={() => setListKind(null)} aria-label="Fechar"><X size={18}/></button></div>
      {listState === "loading" && <p className="muted">A carregar…</p>}
      {listState === "error" && <p className="muted">Não foi possível carregar a lista.</p>}
      {listState === "ok" && people.length === 0 && <div className="empty-state compact-empty"><div className="empty-icon"><Users/></div><h2>{listKind === "followers" ? "Ainda sem seguidores" : "Ainda não segue ninguém"}</h2></div>}
      <div className="rank-list">{people.map(h => <div key={h.id} className="rank-item person">
        <button className="person-main" onClick={() => { setListKind(null); onOpenProfile?.(h.username); }}>
          <Avatar name={h.username} url={h.avatar} size={44} accent={h.accent}/>
          <span className="rank-name"><strong>{h.displayName || h.username}</strong><small>@{h.username}</small></span>
        </button>
        {user?.id !== h.id && <button className={h.iFollow ? "secondary-btn" : "primary-btn"} onClick={() => toggleOther(h)}>{h.iFollow ? <><UserCheck size={15}/>A seguir</> : <><UserPlus size={15}/>Seguir</>}</button>}
      </div>)}</div>
    </div></div>}
    {error && <div className="form-error"><span>{error}</span></div>}
    <div className="section-heading"><div><h2>Jogos jogados</h2><p>Os jogos públicos que {isMe ? "jogaste" : p.username + " jogou"}.</p></div></div>
    {p.games.length === 0 && <p className="muted">Ainda não jogou nenhum jogo.</p>}
    <div className="rank-list">
      {p.games.map(g => <button key={g.game_id} className="rank-item" onClick={() => onOpenGame(g.game_id)}>
        <span className="rank-cover">{coverUrl(g.cover_path) ? <img src={coverUrl(g.cover_path)!} alt=""/> : <Gamepad2 size={20}/>}</span>
        <span className="rank-name"><strong>{g.name}</strong><small>Último jogo: {new Date(g.last_played).toLocaleDateString("pt-PT")}</small></span>
        <span className="rank-stats"><span>{g.plays} {g.plays === 1 ? "partida" : "partidas"}</span></span>
      </button>)}
    </div>
    {editing && <ProfileEditor profile={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onProfileChanged?.(); }}/>}
  </section>;
}
