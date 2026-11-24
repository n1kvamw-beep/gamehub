import { useState } from "react";
import { LogOut } from "lucide-react";
import type { Game } from "./types";
import type { AuthUser } from "./auth";
import AdminCharts from "./AdminCharts";
import AdminGames from "./AdminGames";
import UsersPanel from "./UsersPanel";
import StoragePanel from "./StoragePanel";
import AdminNews from "./AdminNews";
import ActivityPanel from "./ActivityPanel";

const TABS = [["overview", "Visão geral"], ["games", "Jogos"], ["users", "Utilizadores"], ["activity", "Atividade"], ["storage", "Armazenamento"], ["news", "Novidades"], ["account", "Conta"]] as const;
type Tab = typeof TABS[number][0];

type Props = {
  games: Game[]; user: AuthUser; onSignOut: () => void;
  onEdit: (game: Game) => void; onChanged: () => Promise<void>;
};

// Painel único do admin: gráficos, tabela de jogos, utilizadores e conta.
export default function AdminPanel({ games, user, onSignOut, onEdit, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const vis = (g: Game) => g.visibility ?? (g.isPublic === false ? "private" : "public");
  const count = (v: string) => games.filter(g => vis(g) === v).length;
  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO</div><h1>Painel de admin</h1><p>Gere jogos e utilizadores e vê como o site está a ser usado.</p></div></div>
    <div className="admin-tabs" role="tablist">
      {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === "overview" && <AdminCharts games={games}/>}
    {tab === "games" && <AdminGames games={games} onEdit={onEdit} onChanged={onChanged}/>}
    {tab === "users" && <UsersPanel meId={user?.id ?? ""}/>}
    {tab === "activity" && <ActivityPanel/>}
    {tab === "news" && <AdminNews/>}
    {tab === "storage" && <StoragePanel games={games} onChanged={onChanged}/>}
    {tab === "account" && <>
      <div className="info-panel">
        <div><small>CONTA</small><strong>{user?.username}</strong></div>
        <div><small>PAPEL</small><strong>{user?.role === "admin" ? "Administrador" : "Utilizador"}</strong></div>
        <div><small>JOGOS</small><strong>{games.length}</strong></div>
        <div><small>PÚBLICO / FAMÍLIA / PRIVADO</small><strong>{count("public")} / {count("family")} / {count("private")}</strong></div>
      </div>
      <div className="detail-buttons" style={{ marginTop: 20 }}><button className="secondary-btn" onClick={onSignOut}><LogOut size={17}/> Terminar sessão</button></div>
    </>}
  </section>;
}
