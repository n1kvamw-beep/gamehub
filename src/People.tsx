import { useEffect, useState } from "react";
import { Search, UserPlus, UserCheck, Users } from "lucide-react";
import type { AuthUser } from "./auth";
import { searchPeople, setFollow, type PersonHit } from "./profile";
import Avatar from "./Avatar";

type Props = { user: AuthUser; onNeedLogin: () => void; onOpenProfile: (username: string) => void };

// Pesquisa de utilizadores (por nome de utilizador ou nome a mostrar) para ver o perfil e seguir.
export default function PeoplePanel({ user, onNeedLogin, onOpenProfile }: Props) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Espera um pouco depois de escreveres para não pesquisar a cada letra.
    const t = setTimeout(() => {
      searchPeople(q).then(r => { if (alive) { setList(r); setError(""); } })
        .catch(() => { if (alive) setError("Não foi possível pesquisar."); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, user?.id]);

  async function toggle(p: PersonHit) {
    if (!user) return onNeedLogin();
    setList(l => l.map(x => x.id === p.id ? { ...x, iFollow: !x.iFollow } : x));
    try { await setFollow(p.id, !p.iFollow); }
    catch (e) {
      setList(l => l.map(x => x.id === p.id ? { ...x, iFollow: p.iFollow } : x));
      setError(e instanceof Error ? e.message : "Não foi possível seguir.");
    }
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">COMUNIDADE</div><h1>Pessoas</h1><p>Procura utilizadores para ver o perfil e seguir.</p></div></div>
    <div className="search-box people-search"><Search size={16}/><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome ou utilizador..." maxLength={40}/></div>
    {error && <div className="form-error"><span>{error}</span></div>}
    {!loading && list.length === 0 && <div className="empty-state compact-empty"><div className="empty-icon"><Users/></div><h2>Ninguém encontrado</h2><p>Tenta outro nome.</p></div>}
    <div className="rank-list">
      {list.map(p => <div key={p.id} className="rank-item person">
        <button className="person-main" onClick={() => onOpenProfile(p.username)}>
          <Avatar name={p.username} url={p.avatar} size={44} accent={p.accent}/>
          <span className="rank-name"><strong>{p.displayName || p.username}</strong><small>@{p.username}{p.status ? ` · ${p.status}` : ""}</small></span>
        </button>
        {user?.id !== p.id && <button className={p.iFollow ? "secondary-btn" : "primary-btn"} onClick={() => toggle(p)}>{p.iFollow ? <><UserCheck size={15}/>A seguir</> : <><UserPlus size={15}/>Seguir</>}</button>}
      </div>)}
    </div>
  </section>;
}
