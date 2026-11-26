import { useEffect, useState } from "react";
import { Play, Star, MessageCircle, Gamepad2, Trophy, Users, Medal } from "lucide-react";
import { fetchLeaderboard, type LeaderRow } from "./profile";
import Avatar from "./Avatar";
import type { Game } from "./types";

type PKey = "points" | "plays" | "games" | "followers";
const PTABS: { id: PKey; label: string }[] = [{ id: "points", label: "Pontos" }, { id: "plays", label: "Partidas" }, { id: "games", label: "Jogos" }, { id: "followers", label: "Seguidores" }];

// Classificação dos jogadores: pontos, partidas, jogos diferentes e seguidores.
function PlayersBoard({ meId, onOpenProfile }: { meId?: string; onOpenProfile: (username: string) => void }) {
  const [by, setBy] = useState<PKey>("points");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchLeaderboard().then(r => { setRows(r); setError(""); })
      .catch(e => { setRows([]); setError(e instanceof Error && e.message === "MISSING_SQL" ? "Falta correr o SQL da classificação no Supabase (supabase/gamehub-leaderboard.sql)." : "Não foi possível carregar a classificação."); });
  }, []);
  const list = [...(rows ?? [])].filter(r => r[by] > 0).sort((a, b) => b[by] - a[by]).slice(0, 50);
  const me = meId ? [...(rows ?? [])].sort((a, b) => b[by] - a[by]).findIndex(r => r.id === meId) : -1;
  return <>
    <div className="import-tabs lb-tabs">{PTABS.map(t => <button key={t.id} className={by === t.id ? "selected" : ""} onClick={() => setBy(t.id)}>{t.label}</button>)}</div>
    <p className="muted lb-note">Pontos = partidas + 3×avaliações + 5×comentários + 10×seguidores.{me >= 0 && <> A tua posição: <strong>#{me + 1}</strong>.</>}</p>
    {error && <div className="form-error"><span>{error}</span></div>}
    {rows && !error && list.length === 0 && <div className="empty-state compact-empty"><div className="empty-icon"><Trophy/></div><h2>Ainda não há classificação</h2><p>Joga, comenta e avalia para apareceres aqui.</p></div>}
    <div className="rank-list">
      {list.map((r, i) => <button key={r.id} className={`rank-item lb-row ${r.id === meId ? "me" : ""}`} onClick={() => onOpenProfile(r.username)}>
        <span className={`rank-pos ${i < 3 ? "medal m" + (i + 1) : ""}`}>{i < 3 ? <Medal size={20}/> : i + 1}</span>
        <Avatar name={r.username} url={r.avatar} size={42} accent={r.accent}/>
        <span className="rank-name"><strong>{r.displayName || r.username}{r.id === meId && " (tu)"}</strong><small>@{r.username}</small></span>
        <span className="rank-stats"><span><Trophy size={13}/>{r.points}</span><span><Play size={13}/>{r.plays}</span><span><Gamepad2 size={13}/>{r.games}</span><span><Users size={13}/>{r.followers}</span></span>
      </button>)}
    </div>
  </>;
}

export default function RankingPanel({ games, onOpen, meId, onOpenProfile }: { games: Game[]; onOpen: (game: Game) => void; meId?: string; onOpenProfile?: (username: string) => void }) {
  const [tab, setTab] = useState<"games" | "players">("games");
  const [by, setBy] = useState<"plays" | "rating">("plays");
  const list = [...games]
    .filter(g => by === "plays" ? (g.stats?.plays ?? 0) > 0 : (g.stats?.votes ?? 0) > 0)
    .sort((a, b) => by === "plays"
      ? (b.stats?.plays ?? 0) - (a.stats?.plays ?? 0)
      : (b.stats?.avg ?? 0) - (a.stats?.avg ?? 0) || (b.stats?.votes ?? 0) - (a.stats?.votes ?? 0))
    .slice(0, 20);
  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">COMUNIDADE</div><h1>Ranking</h1><p>{tab === "players" ? "Os jogadores mais ativos da comunidade." : by === "plays" ? "Os jogos mais jogados." : "Os jogos mais bem avaliados."}</p></div></div>
    <div className="import-tabs lb-main"><button className={tab === "games" ? "selected" : ""} onClick={() => setTab("games")}><Gamepad2 size={16}/>Jogos</button><button className={tab === "players" ? "selected" : ""} onClick={() => setTab("players")}><Trophy size={16}/>Jogadores</button></div>
    {tab === "players" ? <PlayersBoard meId={meId} onOpenProfile={n => onOpenProfile?.(n)}/> : <>
    <div className="import-tabs"><button className={by === "plays" ? "selected" : ""} onClick={() => setBy("plays")}><Play size={16}/>Mais jogados</button><button className={by === "rating" ? "selected" : ""} onClick={() => setBy("rating")}><Star size={16}/>Melhor avaliados</button></div>
    {list.length === 0 && <div className="empty-state compact-empty"><div className="empty-icon"><Gamepad2/></div><h2>Ainda não há dados</h2><p>{by === "plays" ? "Os jogos aparecem aqui assim que forem jogados." : "Os jogos aparecem aqui assim que receberem avaliações."}</p></div>}
    <div className="rank-list">
      {list.map((g, i) => <button key={g.id} className="rank-item" onClick={() => onOpen(g)}>
        <span className="rank-pos">{i + 1}</span>
        <span className="rank-cover">{g.cover ? <img src={g.cover} alt=""/> : <Gamepad2 size={20}/>}</span>
        <span className="rank-name"><strong>{g.name}</strong><small>{g.genre}</small></span>
        <span className="rank-stats"><span><Play size={13}/>{g.stats?.plays ?? 0}</span><span><Star size={13}/>{g.stats?.avg != null ? g.stats.avg.toFixed(1) : "–"} ({g.stats?.votes ?? 0})</span><span><MessageCircle size={13}/>{g.stats?.comments ?? 0}</span></span>
      </button>)}
    </div>
    </>}
  </section>;
}
