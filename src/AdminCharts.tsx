import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import type { Game } from "./types";
import { r2Usage, type R2Usage } from "./r2";

const fmtBytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`;
const LABELS: Record<string, string> = { games: "Jogos", covers: "Capas", roms: "ROMs privadas", avatars: "Perfis (fotos)", outros: "Outros" };

// Espaço usado no Cloudflare R2 (plano grátis: 10 GB).
function StorageCard() {
  const [u, setU] = useState<R2Usage | "err" | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { r2Usage().then(setU).catch(e => { setMsg(e instanceof Error ? e.message : ""); setU("err"); }); }, []);
  if (u === null) return <div className="chart-card"><h3>Armazenamento (Cloudflare R2)</h3><p className="chart-empty">A calcular…</p></div>;
  if (u === "err") return <div className="chart-card"><h3>Armazenamento (Cloudflare R2)</h3><p className="chart-empty">Não consegui ler o espaço. {msg}</p></div>;
  const sum: Record<string, { bytes: number; count: number }> = {};
  const add = (g: Record<string, { bytes: number; count: number }>) => { for (const [k, v] of Object.entries(g)) { if (k === "error") continue; const e = sum[k] || (sum[k] = { bytes: 0, count: 0 }); e.bytes += v.bytes; e.count += v.count; } };
  add(u.files as never); add(u.roms as never);
  const used = Object.values(sum).reduce((n, v) => n + v.bytes, 0);
  const files = Object.values(sum).reduce((n, v) => n + v.count, 0);
  const pct = Math.min(100, (used / u.limitBytes) * 100);
  const romErr = "error" in u.roms && typeof u.roms.error === "string" ? u.roms.error : "";
  return <div className="chart-card" style={{ gridColumn: "1 / -1" }}>
    <h3>Armazenamento (Cloudflare R2)</h3>
    <p style={{ margin: "4px 0 8px" }}><b>{fmtBytes(used)}</b> usados de {fmtBytes(u.limitBytes)} · livres <b>{fmtBytes(Math.max(0, u.limitBytes - used))}</b> · {files} ficheiros</p>
    <div className="bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><div className="bar-fill" style={{ width: `${pct}%`, background: pct > 85 ? "#ef4444" : undefined }}/></div>
    <ul className="legend" style={{ marginTop: 10 }}>{Object.entries(sum).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v], i) =>
      <li key={k}><span className="dot" style={{ background: COLORS[i % COLORS.length] }}/>{LABELS[k] || k} ({v.count})<b>{fmtBytes(v.bytes)}</b></li>)}</ul>
    {romErr && <p className="chart-empty">{romErr}</p>}
  </div>;
}

const COLORS = ["#2fc977", "#ef81c2", "#79b9ff", "#52d69b", "#f2b84b", "#b47dff"];
type Row = { label: string; value: number };

function Bars({ title, rows, unit = "" }: { title: string; rows: Row[]; unit?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="chart-card">
    <h3>{title}</h3>
    {rows.length === 0 ? <p className="chart-empty">Sem dados ainda.</p> :
      <ul className="bars">{rows.map(r => <li key={r.label}>
        <span className="bar-label" title={r.label}>{r.label}</span>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }}/></span>
        <span className="bar-value">{r.value}{unit}</span>
      </li>)}</ul>}
  </div>;
}

function Donut({ title, parts }: { title: string; parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return <div className="chart-card">
    <h3>{title}</h3>
    {total === 0 ? <p className="chart-empty">Sem dados ainda.</p> : <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={`${title}: ${parts.map(p => `${p.label} ${p.value}`).join(", ")}`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#1c2133" strokeWidth="14"/>
        {parts.filter(p => p.value > 0).map(p => {
          const len = (p.value / total) * C;
          const el = <circle key={p.label} cx="50" cy="50" r={R} fill="none" stroke={p.color} strokeWidth="14"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)"/>;
          offset += len;
          return el;
        })}
        <text x="50" y="55" textAnchor="middle" className="donut-total">{total}</text>
      </svg>
      <ul className="legend">{parts.map(p => <li key={p.label}><span className="dot" style={{ background: p.color }}/>{p.label}<b>{p.value}</b></li>)}</ul>
    </div>}
  </div>;
}

function Columns({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="chart-card">
    <h3>{title}</h3>
    <div className="columns">{rows.map(r => <div key={r.label} className="col">
      <span className="col-value">{r.value}</span>
      <span className="col-bar" style={{ height: `${Math.max(4, (r.value / max) * 100)}%` }}/>
      <span className="col-label">{r.label}</span>
    </div>)}</div>
  </div>;
}

const top = (rows: Row[], n: number) => [...rows].sort((a, b) => b.value - a.value).slice(0, n);

// Painel só para o admin: visão geral do site a partir dos dados que a app já carrega.
export default function AdminCharts({ games }: { games: Game[] }) {
  const [members, setMembers] = useState<{ family: number; none: number } | null>(null);
  const [players, setPlayers] = useState<Row[]>([]);
  const [daily, setDaily] = useState<Row[] | "missing" | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.from("profiles").select("role,approved");
      if (error) return; // antes de correr o SQL a coluna approved pode não existir
      const users = ((data ?? []) as { role: string; approved: boolean }[]).filter(u => u.role !== "admin");
      setMembers({ family: users.filter(u => u.approved).length, none: users.filter(u => !u.approved).length });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const [ug, pr] = await Promise.all([
        supabase.from("user_games").select("user_id,plays").limit(5000),
        supabase.from("profiles").select("id,username"),
      ]);
      if (!ug.error && !pr.error) {
        const names = new Map(((pr.data ?? []) as { id: string; username: string }[]).map(p => [p.id, p.username]));
        const totals = new Map<string, number>();
        for (const r of (ug.data ?? []) as { user_id: string; plays: number | null }[]) totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + Number(r.plays ?? 0));
        setPlayers(top([...totals].map(([id, value]) => ({ label: names.get(id) ?? "?", value })), 8));
      }
      const since = new Date(); since.setDate(since.getDate() - 13); since.setHours(0, 0, 0, 0);
      const ev = await supabase.from("play_events").select("created_at").gte("created_at", since.toISOString()).limit(20000);
      if (ev.error) { setDaily("missing"); return; }
      const times = ((ev.data ?? []) as { created_at: string }[]).map(e => new Date(e.created_at));
      const days: Row[] = [];
      for (let i = 13; i >= 0; i--) {
        const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
        days.push({ label: String(day.getDate()), value: times.filter(t => t.toDateString() === day.toDateString()).length });
      }
      setDaily(days);
    })();
  }, []);

  const d = useMemo(() => {
    const plays = games.reduce((n, g) => n + (g.stats?.plays ?? 0), 0);
    const comments = games.reduce((n, g) => n + (g.stats?.comments ?? 0), 0);
    const votes = games.reduce((n, g) => n + (g.stats?.votes ?? 0), 0);
    const weighted = games.reduce((n, g) => n + (g.stats?.avg ?? 0) * (g.stats?.votes ?? 0), 0);
    const platforms: Record<string, number> = {};
    for (const g of games) platforms[g.platform] = (platforms[g.platform] ?? 0) + 1;
    const vis = { public: 0, family: 0, private: 0 };
    for (const g of games) vis[g.visibility ?? (g.isPublic === false ? "private" : "public")]++;
    const now = new Date();
    const months: Row[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = m.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
      const value = games.filter(g => { const a = new Date(g.addedAt); return a.getFullYear() === m.getFullYear() && a.getMonth() === m.getMonth(); }).length;
      months.push({ label, value });
    }
    return {
      plays, comments, votes, avg: votes ? weighted / votes : null, vis, months,
      byPlatform: top(Object.entries(platforms).map(([label, value]) => ({ label, value })), 8),
      topPlays: top(games.filter(g => (g.stats?.plays ?? 0) > 0).map(g => ({ label: g.name, value: g.stats!.plays })), 8),
      topRated: top(games.filter(g => (g.stats?.votes ?? 0) > 0).map(g => ({ label: g.name, value: Number((g.stats!.avg ?? 0).toFixed(1)) })), 6),
      topComments: top(games.filter(g => (g.stats?.comments ?? 0) > 0).map(g => ({ label: g.name, value: g.stats!.comments })), 6),
    };
  }, [games]);

  return <div className="admin-charts">
    <h2>Visão geral</h2>
    <div className="admin-stats">
      <div><small>JOGOS</small><strong>{games.length}</strong></div>
      <div><small>UTILIZADORES</small><strong>{members ? members.family + members.none : "–"}</strong></div>
      <div><small>PARTIDAS</small><strong>{d.plays}</strong></div>
      <div><small>AVALIAÇÃO MÉDIA</small><strong>{d.avg == null ? "–" : `${d.avg.toFixed(1)} ★`}</strong></div>
      <div><small>COMENTÁRIOS</small><strong>{d.comments}</strong></div>
    </div>
    <div className="chart-grid">
      <StorageCard/>
      <Donut title="Quem pode ver os jogos" parts={[
        { label: "Público", value: d.vis.public, color: COLORS[3] },
        { label: "Família", value: d.vis.family, color: COLORS[0] },
        { label: "Privado", value: d.vis.private, color: COLORS[1] },
      ]}/>
      {members && <Donut title="Utilizadores" parts={[
        { label: "Família", value: members.family, color: COLORS[0] },
        { label: "Sem acesso", value: members.none, color: COLORS[2] },
      ]}/>}
      <Columns title="Jogos adicionados (últimos 6 meses)" rows={d.months}/>
      {daily === "missing"
        ? <div className="chart-card"><h3>Partidas por dia</h3><p className="chart-empty">Falta correr supabase/gamehub-stats.sql no Supabase.</p></div>
        : daily && <Columns title="Partidas por dia (últimos 14 dias)" rows={daily}/>}
      <Bars title="Quem joga mais (partidas)" rows={players}/>
      <Bars title="Jogos por plataforma" rows={d.byPlatform}/>
      <Bars title="Mais jogados (partidas)" rows={d.topPlays}/>
      <Bars title="Melhor avaliados" rows={d.topRated} unit=" ★"/>
      <Bars title="Mais comentados" rows={d.topComments}/>
    </div>
  </div>;
}
