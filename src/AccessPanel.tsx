import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Member = { id: string; username: string; role: string; approved: boolean };

// Só o admin vê este painel: aprova quem pode ver e jogar as ROMs/ISO.
export default function AccessPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    if (!supabase) return;
    const { data, error: e } = await supabase.from("profiles").select("id,username,role,approved").order("username");
    if (e) { setError(/approved/i.test(e.message) ? "Falta correr o ficheiro SQL de acesso no Supabase (coluna approved)." : e.message); return; }
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

  return <div className="access-panel">
    <h2>Acesso às ROMs e ISO</h2>
    <p>Só os utilizadores aprovados veem e jogam os jogos de emulador (PSP, Game Boy, Nintendo, Mega Drive…).</p>
    {error && <div className="form-error">{error}</div>}
    {!error && members.length === 0 && <p className="access-empty">Ainda não há utilizadores registados.</p>}
    <ul>
      {members.map(m => <li key={m.id}>
        <span>{m.username}</span>
        <label className="check-row"><input type="checkbox" checked={m.approved} disabled={busyId === m.id} onChange={() => toggle(m)}/>{m.approved ? "Aprovado" : "Sem acesso"}</label>
      </li>)}
    </ul>
  </div>;
}
