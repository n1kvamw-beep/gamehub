import { useEffect, useState } from "react";
import { Gamepad2, UserPlus, UserCheck, ShieldCheck } from "lucide-react";
import type { AuthUser } from "./auth";
import { fetchProfile, setFollow, coverUrl, type PublicProfile } from "./profile";

type Props = { username: string; user: AuthUser; onNeedLogin: () => void; onOpenGame: (id: string) => void };

export default function ProfilePanel({ username, user, onNeedLogin, onOpenGame }: Props) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [error, setError] = useState("");

  async function load() {
    try { const r = await fetchProfile(username); setP(r); setState(r ? "ok" : "missing"); }
    catch { setState("missing"); }
  }
  useEffect(() => { setState("loading"); setError(""); load(); }, [username, user?.id]);

  async function toggle() {
    if (!p) return;
    if (!user) return onNeedLogin();
    try { await setFollow(p.id, !p.iFollow); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível seguir."); }
  }

  if (state === "loading") return <section className="content"><p>A carregar perfil...</p></section>;
  if (!p) return <section className="content"><div className="empty-state compact-empty"><div className="empty-icon"><Gamepad2/></div><h2>Perfil não encontrado</h2></div></section>;
  const isMe = user?.id === p.id;
  return <section className="content">
    <div className="profile-head">
      <div className="avatar big">{p.username.slice(0, 1).toUpperCase()}</div>
      <div className="profile-info">
        <h1>{p.username} {p.role === "admin" && <span className="badge"><ShieldCheck size={13}/>Admin</span>}</h1>
        <div className="profile-counts"><span><strong>{p.followers}</strong> seguidores</span><span><strong>{p.following}</strong> a seguir</span><span><strong>{p.games.length}</strong> jogos</span></div>
      </div>
      {!isMe && <button className={p.iFollow ? "secondary-btn" : "primary-btn"} onClick={toggle}>{p.iFollow ? <><UserCheck size={16}/>A seguir</> : <><UserPlus size={16}/>Seguir</>}</button>}
    </div>
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
  </section>;
}
