import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteRemoteGame, setGamesVisibility } from "./admin";
import type { Game, Visibility } from "./types";

const LABELS: Record<Visibility, string> = { public: "Público", family: "Família", private: "Privado" };
const visOf = (g: Game): Visibility => g.visibility ?? (g.isPublic === false ? "private" : "public");

type Props = { games: Game[]; onEdit: (game: Game) => void; onChanged: () => Promise<void> };

// Tabela com todos os jogos: filtrar, mudar visibilidade, editar e apagar (um ou vários).
export default function AdminGames({ games, onEdit, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Visibility>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Visibility>("family");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => games.filter(g =>
    (filter === "all" || visOf(g) === filter) && g.name.toLowerCase().includes(query.trim().toLowerCase())
  ), [games, query, filter]);

  const allPicked = rows.length > 0 && rows.every(g => picked.has(g.id));
  function toggle(id: string) { setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setPicked(allPicked ? new Set() : new Set(rows.map(g => g.id))); }

  async function run(job: () => Promise<void>) {
    setBusy(true); setError("");
    try { await job(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir a ação."); }
    finally { setBusy(false); }
  }
  const changeOne = (g: Game, v: Visibility) => run(() => setGamesVisibility([g.id], v));
  const applyBulk = () => run(async () => { await setGamesVisibility([...picked], bulk); setPicked(new Set()); });
  const removeMany = (list: Game[]) => {
    if (!list.length) return;
    const text = list.length === 1 ? `Apagar "${list[0].name}"?` : `Apagar ${list.length} jogos?`;
    if (!confirm(`${text} Esta ação não pode ser desfeita.`)) return;
    return run(async () => {
      for (const g of list) await deleteRemoteGame(g);
      setPicked(new Set());
    });
  };

  return <div className="access-panel">
    <h2>Jogos</h2>
    <div className="games-toolbar">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar jogo..."/>
      <select value={filter} onChange={e => setFilter(e.target.value as "all" | Visibility)}>
        <option value="all">Todos</option>
        {(Object.keys(LABELS) as Visibility[]).map(v => <option key={v} value={v}>{LABELS[v]}</option>)}
      </select>
    </div>
    {picked.size > 0 && <div className="bulk-bar">
      <b>{picked.size} selecionados</b>
      <select value={bulk} onChange={e => setBulk(e.target.value as Visibility)}>
        {(Object.keys(LABELS) as Visibility[]).map(v => <option key={v} value={v}>{LABELS[v]}</option>)}
      </select>
      <button className="secondary-btn" disabled={busy} onClick={applyBulk}>Aplicar visibilidade</button>
      <button className="secondary-btn danger" disabled={busy} onClick={() => removeMany(games.filter(g => picked.has(g.id)))}><Trash2 size={15}/> Apagar</button>
    </div>}
    {error && <div className="form-error">{error}</div>}
    <div className="table-wrap">
      <table className="admin-table">
        <thead><tr>
          <th><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Selecionar todos"/></th>
          <th>Jogo</th><th>Visibilidade</th><th>Partidas</th><th>★</th><th>Adicionado</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(g => <tr key={g.id}>
            <td><input type="checkbox" checked={picked.has(g.id)} onChange={() => toggle(g.id)} aria-label={`Selecionar ${g.name}`}/></td>
            <td><strong>{g.name}</strong><small>{g.platform}</small></td>
            <td><select value={visOf(g)} disabled={busy} onChange={e => changeOne(g, e.target.value as Visibility)}>
              {(Object.keys(LABELS) as Visibility[]).map(v => <option key={v} value={v}>{LABELS[v]}</option>)}
            </select></td>
            <td>{g.stats?.plays ?? 0}</td>
            <td>{g.stats?.avg != null ? g.stats.avg.toFixed(1) : "–"}</td>
            <td>{new Date(g.addedAt).toLocaleDateString("pt-PT")}</td>
            <td className="row-actions">
              <button className="secondary-btn" title="Editar" onClick={() => onEdit(g)}><Pencil size={15}/></button>
              <button className="secondary-btn danger" title="Apagar" disabled={busy} onClick={() => removeMany([g])}><Trash2 size={15}/></button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {rows.length === 0 && <p className="chart-empty" style={{ padding: 12 }}>Nenhum jogo encontrado.</p>}
    </div>
  </div>;
}
