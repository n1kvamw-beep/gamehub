import { useState } from "react";
import { Play, Star, MessageCircle, Gamepad2 } from "lucide-react";
import type { Game } from "./types";

export default function RankingPanel({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const [by, setBy] = useState<"plays" | "rating">("plays");
  const list = [...games]
    .filter(g => by === "plays" ? (g.stats?.plays ?? 0) > 0 : (g.stats?.votes ?? 0) > 0)
    .sort((a, b) => by === "plays"
      ? (b.stats?.plays ?? 0) - (a.stats?.plays ?? 0)
      : (b.stats?.avg ?? 0) - (a.stats?.avg ?? 0) || (b.stats?.votes ?? 0) - (a.stats?.votes ?? 0))
    .slice(0, 20);
  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">COMUNIDADE</div><h1>Ranking</h1><p>{by === "plays" ? "Os jogos mais jogados." : "Os jogos mais bem avaliados."}</p></div></div>
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
  </section>;
}
