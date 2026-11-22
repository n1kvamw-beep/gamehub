import { useEffect, useState } from "react";
import { Trash2, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "./supabase";

type Member = { id: string; username: string; role: string; approved: boolean };
type Usage = { plays: number; games: number; last: string | null };

const SQL_HINT = "Falta correr os ficheiros SQL no Supabase (supabase/gamehub-access.sql e gamehub-admin.sql).";

// Gestão de utilizadores: Família, admin, repor senha, apagar e ver a atividade de cada pessoa.
export default function UsersPanel({ meId }: { meId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    if (!supabase) return;
    const [pr, ug] = await Promise.all([
      supabase.from("profiles").select("id,username,role,approved").order("username"),
      supabase.from("user_games").select("user_id,plays,last_played").limit(5000),
    ]);
    if (pr.error) { setError(/approved/i.test(pr.error.message) ? SQL_HINT : pr.error.message); return; }
    setError("");
    setMembers((pr.data ?? []) as Member[]);
    const map: Record<string, Usage> = {};
    for (const r of (ug.data ?? []) as { user_id: string; plays: number | null; last_played: string | null }[]) {
      const u = map[r.user_id] ?? { plays: 0, games: 0, last: null };
      u.plays += Number(r.plays ?? 0); u.games += 1;
      if (r.last_played && (!u.last || r.last_played > u.last)) u.last = r.last_played;
      map[r.user_id] = u;
    }
    setUsage(map);
  }
  useEffect(() => { load(); }, []);

  async function act(m: Member, job: () => PromiseLike<{ error: { message: string } | null }>, done: string, after?: () => void) {
    setBusyId(m.id); setError(""); setNotice("");
    const { error: e } = await job();
    setBusyId("");
    if (e) { setError(/could not find|does not exist|schema cache/i.test(e.message) ? SQL_HINT : e.message); return; }
    setNotice(done);
    if (after) after(); else load();
  }

  const toggleFamily = (m: Member) => act(m, () => supabase!.from("profiles").update({ approved: !m.approved }).eq("id", m.id), "Atualizado.");
  const toggleAdmin = (m: Member) => {
    const make = m.role !== "admin";
    if (!confirm(make ? `Tornar "${m.username}" administrador? Poderá gerir tudo no site.` : `Remover o papel de administrador a "${m.username}"?`)) return;
    return act(m, () => supabase!.from("profiles").update({ role: make ? "admin" : "user" }).eq("id", m.id), "Papel atualizado.");
  };
  const resetPassword = (m: Member) => {
    const pwd = prompt(`Nova senha para "${m.username}" (mínimo 8 caracteres):`);
    if (!pwd) return;
    if (pwd.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    return act(m, () => supabase!.rpc("gh_set_password", { target: m.id, new_password: pwd }), `Senha de "${m.username}" alterada.`, () => {});
  };
  const remove = (m: Member) => {
    if (!confirm(`Apagar a conta "${m.username}"? Esta ação não pode ser desfeita.`)) return;
    return act(m, () => supabase!.rpc("gh_delete_user", { target: m.id }), "Conta apagada.");
  };

  return <div className="access-panel">
    <h2>Utilizadores</h2>
    <p>«Família» vê os jogos marcados como Família. Aqui podes também dar ou tirar o papel de admin, repor senhas e apagar contas.</p>
    {error && <div className="form-error">{error}</div>}
    {notice && !error && <p className="notice-ok">{notice}</p>}
    {!error && members.length === 0 && <p className="access-empty">Ainda não há utilizadores registados.</p>}
    <ul className="users-list">
      {members.map(m => {
        const u = usage[m.id];
        const mine = m.id === meId;
        const admin = m.role === "admin";
        return <li key={m.id}>
          <div className="user-main">
            <strong>{m.username}{admin && <span className="badge">Admin</span>}{mine && <span className="badge soft">Tu</span>}</strong>
            <small>{u ? `${u.plays} partidas · ${u.games} jogos${u.last ? ` · último: ${new Date(u.last).toLocaleDateString("pt-PT")}` : ""}` : "Sem partidas"}</small>
          </div>
          <div className="access-actions">
            {!admin && <label className="check-row"><input type="checkbox" checked={m.approved} disabled={busyId === m.id} onChange={() => toggleFamily(m)}/>{m.approved ? "Família" : "Sem acesso"}</label>}
            {!mine && <>
              <button className="secondary-btn" title={admin ? "Remover admin" : "Tornar admin"} disabled={busyId === m.id} onClick={() => toggleAdmin(m)}>{admin ? <ShieldOff size={15}/> : <ShieldCheck size={15}/>}</button>
              {!admin && <button className="secondary-btn" title="Repor senha" disabled={busyId === m.id} onClick={() => resetPassword(m)}><KeyRound size={15}/></button>}
              {!admin && <button className="secondary-btn danger" title="Apagar conta" disabled={busyId === m.id} onClick={() => remove(m)}><Trash2 size={15}/></button>}
            </>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
