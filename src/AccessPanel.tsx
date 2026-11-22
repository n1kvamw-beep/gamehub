import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "./supabase";

type Member = { id: string; username: string; role: string; approved: boolean };

// Só o admin vê este painel: marca quem é "Família" (vê os jogos marcados como Família) e apaga contas.
export default function AccessPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    if (!supabase) return;
    const { data, error: e } = await supabase.from("profiles").select("id,username,role,approved").order("username");
    if (e) { setError(/approved/i.test(e.message) ? "Falta correr o ficheiro SQL no Supabase (supabase/gamehub-access.sql)." : e.message); return; }
    setError("");
    setMembers(((data ?? []) as Member[]).filter(m => m.role !== "admin"));
  }
  useEffect(() => { load(); }, []);

  async function toggle(m: Member) {
    if (!supabase) return;
    setBusyId(m.id);
    const { error: e } = await supabase.from("profiles").update({ approved: !m.approved }).eq("id", m.id);
    setBusyId("");
    if (e) { setError(e.message); return; }
    setMembers(list => list.map(x => x.id === m.id ? { ...x, approved: !m.approved } : x));
  }

  async function remove(m: Member) {
    if (!supabase) return;
    if (!confirm(`Apagar a conta "${m.username}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(m.id); setError("");
    const { error: e } = await supabase.rpc("gh_delete_user", { target: m.id });
    setBusyId("");
    if (e) { setError(/gh_delete_user/i.test(e.message) && /find|exist/i.test(e.message) ? "Falta correr o ficheiro SQL no Supabase (supabase/gamehub-access.sql)." : e.message); return; }
    setMembers(list => list.filter(x => x.id !== m.id));
  }

  return <div className="access-panel">
    <h2>Utilizadores</h2>
    <p>Quem for «Família» vê e joga os jogos marcados como Família. Aqui também podes apagar contas.</p>
    {error && <div className="form-error">{error}</div>}
    {!error && members.length === 0 && <p className="access-empty">Ainda não há utilizadores registados.</p>}
    <ul>
      {members.map(m => <li key={m.id}>
        <span>{m.username}</span>
        <span className="access-actions">
          <label className="check-row"><input type="checkbox" checked={m.approved} disabled={busyId === m.id} onChange={() => toggle(m)}/>{m.approved ? "Família" : "Sem acesso"}</label>
          <button className="secondary-btn danger" title="Apagar conta" disabled={busyId === m.id} onClick={() => remove(m)}><Trash2 size={15}/></button>
        </span>
      </li>)}
    </ul>
  </div>;
}
