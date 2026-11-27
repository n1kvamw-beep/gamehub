import { useEffect, useMemo, useState } from "react";
import { Radio, Play, Bell } from "lucide-react";
import { supabase } from "./supabase";
import { watchPlaying, type Playing } from "./activity";
import { inactiveCount, remindInactive } from "./news";

type Ev = { id: number; game_id: string; user_id: string | null; created_at: string };
type UG = { user_id: string; game_id: string; plays: number; last_played: string | null };

const ago = (iso: string | number) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-PT");
};

// Atividade: quem está a jogar agora, histórico recente e partidas de cada pessoa em cada jogo.
export default function ActivityPanel() {
  const [live, setLive] = useState<Playing[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [ug, setUg] = useState<UG[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [games, setGames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [, tick] = useState(0);
  const [days, setDays] = useState(7);
  const [count, setCount] = useState<number | null>(null);
  const [rTitle, setRTitle] = useState("Sentimos a tua falta");
  const [rBody, setRBody] = useState("Há jogos e novidades à tua espera no GameHub. Volta e joga uma partida.");
  const [rMsg, setRMsg] = useState("");
  const [rBusy, setRBusy] = useState(false);
  useEffect(() => { setCount(null); inactiveCount(days).then(r => setCount(r.users)).catch(() => setCount(null)); }, [days]);
  async function sendReminder() {
    if (!confirm(`Enviar o lembrete a ${count ?? "todas as"} pessoa(s) sem jogar há ${days} dias?`)) return;
    setRBusy(true); setRMsg("");
    try { const r = await remindInactive(days, rTitle, rBody); setRMsg(`Lembrete enviado a ${r.sent} aparelho(s) de ${r.users} pessoa(s).`); }
    catch (e) { setRMsg(e instanceof Error ? e.message : "Falha ao enviar."); }
    finally { setRBusy(false); }
  }

  async function load() {
    if (!supabase) return;
    const [pr, gm, ev, u] = await Promise.all([
      supabase.from("profiles").select("id,username,display_name"),
      supabase.from("games").select("id,name"),
      supabase.from("play_events").select("id,game_id,user_id,created_at").order("created_at", { ascending: false }).limit(60),
      supabase.from("user_games").select("user_id,game_id,plays,last_played").limit(5000),
    ]);
    const err = pr.error || gm.error || ev.error || u.error;
    if (err) { setError(/play_events/i.test(err.message) ? "Falta correr supabase/gamehub-stats.sql no Supabase." : err.message); }
    else setError("");
    const n: Record<string, string> = {};
    for (const r of (pr.data ?? []) as { id: string; username: string; display_name?: string | null }[]) n[r.id] = r.display_name || r.username;
    setNames(n);
    const g: Record<string, string> = {};
    for (const r of (gm.data ?? []) as { id: string; name: string }[]) g[r.id] = r.name;
    setGames(g);
    setEvents((ev.data ?? []) as Ev[]);
    setUg((u.data ?? []) as UG[]);
  }
  useEffect(() => { load().catch(() => setError("Não foi possível carregar a atividade.")); const t = window.setInterval(() => { load().catch(() => {}); tick(x => x + 1); }, 20000); return () => window.clearInterval(t); }, []);
  useEffect(() => watchPlaying(setLive), []);

  const perUser = useMemo(() => {
    const m = new Map<string, { total: number; rows: UG[] }>();
    for (const r of ug) { const e = m.get(r.user_id) ?? { total: 0, rows: [] }; e.total += Number(r.plays ?? 0); e.rows.push(r); m.set(r.user_id, e); }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [ug]);
  const who = (id: string | null) => (id ? names[id] ?? "Utilizador" : "Visitante");

  return <div className="access-panel">
    <h2>Atividade</h2>
    <p>Quem está a jogar agora e quantas vezes cada pessoa entrou em cada jogo.</p>
    {error && <div className="form-error">{error}</div>}

    <h3 className="act-h"><Bell size={16}/> Lembrar quem não joga há tempo</h3>
    <div className="remind-card">
      <label>Sem jogar há <select value={days} onChange={e => setDays(Number(e.target.value))}>{[3, 7, 14, 30, 60].map(d => <option key={d} value={d}>{d} dias</option>)}</select></label>
      <small>{count == null ? "A contar…" : `${count} ${count === 1 ? "pessoa recebe" : "pessoas recebem"} (só quem ativou os avisos).`}</small>
      <input value={rTitle} maxLength={80} onChange={e => setRTitle(e.target.value)} placeholder="Título"/>
      <textarea rows={2} value={rBody} maxLength={160} onChange={e => setRBody(e.target.value)} placeholder="Mensagem"/>
      <button className="primary-btn" disabled={rBusy || !count || !rTitle.trim()} onClick={sendReminder}><Bell size={16}/>{rBusy ? "A enviar…" : "Enviar lembrete"}</button>
      {rMsg && <p className="notice-ok">{rMsg}</p>}
    </div>

    <h3 className="act-h"><Radio size={16}/> A jogar agora <span className="badge">{live.length}</span></h3>
    {live.length === 0 ? <p className="access-empty">Ninguém está a jogar neste momento.</p> :
      <ul className="users-list">{live.map((p, i) => <li key={i}><div className="user-main"><strong>{p.user}</strong><small>{p.name} · {ago(p.since)}</small></div><span className="live-dot"/></li>)}</ul>}

    <h3 className="act-h"><Play size={16}/> Partidas por pessoa</h3>
    {perUser.length === 0 ? <p className="access-empty">Ainda não há partidas registadas.</p> :
      <ul className="users-list">{perUser.map(([id, e]) => <li key={id} className="act-user">
        <button className="act-row" onClick={() => setOpen(open === id ? "" : id)}>
          <div className="user-main"><strong>{who(id)}</strong><small>{e.total} {e.total === 1 ? "partida" : "partidas"} · {e.rows.length} {e.rows.length === 1 ? "jogo" : "jogos"}</small></div>
          <span>{open === id ? "▲" : "▼"}</span>
        </button>
        {open === id && <ul className="act-games">{e.rows.sort((a, b) => b.plays - a.plays).map(r => <li key={r.game_id}><span>{games[r.game_id] ?? "Jogo removido"}</span><span><b>{r.plays}</b>{r.last_played ? ` · ${ago(r.last_played)}` : ""}</span></li>)}</ul>}
      </li>)}</ul>}

    <h3 className="act-h">Últimas partidas</h3>
    {events.length === 0 ? <p className="access-empty">Sem registos ainda.</p> :
      <ul className="users-list">{events.map(e => <li key={e.id}><div className="user-main"><strong>{who(e.user_id)}</strong><small>{games[e.game_id] ?? "Jogo removido"} · {ago(e.created_at)}</small></div></li>)}</ul>}
  </div>;
}
