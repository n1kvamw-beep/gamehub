import { useEffect, useState } from "react";
import { CloudUpload, CheckCircle2, AlertCircle } from "lucide-react";
import type { Game } from "./types";
import { r2Base } from "./r2";
import { migrateGame, needsMigration } from "./migrate";

export default function StoragePanel({ games, onChanged }: { games: Game[]; onChanged: () => Promise<void> }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const pending = games.filter(needsMigration);
  const inR2 = games.filter(g => g.remote?.filePath.startsWith("r2:")).length;
  const rom = games.filter(g => g.remote?.filePath.startsWith("r2rom:")).length;

  useEffect(() => { r2Base().then(b => setReady(!!b)); }, []);

  async function run() {
    setBusy(true); setLog([]);
    let done = 0;
    for (const g of pending) {
      setLog(l => [...l, `A mover "${g.name}" (${done + 1}/${pending.length})...`]);
      try { await migrateGame(g); done++; setLog(l => [...l.slice(0, -1), `✓ ${g.name}`]); }
      catch (e) { setLog(l => [...l.slice(0, -1), `✗ ${g.name}: ${e instanceof Error ? e.message : "erro"}`]); break; }
    }
    await onChanged();
    setBusy(false);
  }

  return <>
    <div className="info-panel">
      <div><small>CLOUDFLARE R2</small><strong>{ready === null ? "A verificar..." : ready ? "Ligado" : "Não configurado"}</strong></div>
      <div><small>NO CLOUDFLARE</small><strong>{inR2}</strong></div>
      <div><small>AINDA NO SUPABASE</small><strong>{pending.length}</strong></div>
      <div><small>ROMS PRIVADAS (CLOUDFLARE)</small><strong>{rom}</strong></div>
    </div>
    <div className="section-heading" style={{ marginTop: 24 }}><div><h2>Migrar para o Cloudflare</h2><p>Copia os ficheiros e capas dos jogos, confirma que chegaram e só depois apaga do Supabase. Os jogos novos já vão direto para o Cloudflare.</p></div></div>
    {ready === false && <div className="form-error"><AlertCircle size={15}/><span>Faltam as variáveis R2_* no Vercel (ou falta um redeploy).</span></div>}
    {pending.length === 0 && ready && <p className="muted"><CheckCircle2 size={14}/> Todos os jogos normais já estão no Cloudflare.</p>}
    <button className="primary-btn" disabled={busy || !ready || pending.length === 0} onClick={run}><CloudUpload size={17}/>{busy ? "A migrar..." : `Migrar ${pending.length} jogo(s)`}</button>
    <div className="comment-list">{log.map((l, i) => <div className="comment" key={i}><p>{l}</p></div>)}</div>
  </>;
}
