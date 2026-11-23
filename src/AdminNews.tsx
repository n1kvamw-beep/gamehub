import { useEffect, useState } from "react";
import { fetchNews, publishNews, deleteNews, KIND_LABEL, type NewsItem, type NewsKind } from "./news";

// Admin: publicar novidades (jogo novo, mecânicas, bugs…) e avisar quem ativou as notificações.
export default function AdminNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [kind, setKind] = useState<NewsKind>("jogo");
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const load = () => fetchNews(50).then(setItems);
  useEffect(() => { load(); }, []);
  async function submit() {
    setBusy(true); setMsg("");
    try {
      const r = await publishNews({ kind, title, body, push: send });
      setMsg(r ? `Publicado. Notificação enviada a ${r.sent} de ${r.total} aparelhos.` : "Publicado.");
      setTitle(""); setBody(""); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro ao publicar."); }
    setBusy(false);
  }
  return <div className="admin-news">
    <h2>Novidades</h2>
    <div className="form-grid">
      <label>Tipo<select value={kind} onChange={e => setKind(e.target.value as NewsKind)}>{(Object.keys(KIND_LABEL) as NewsKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
      <label>Título<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Novo jogo: Sonic 3"/></label>
      <label className="full">Mensagem<textarea rows={3} maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder="O que mudou?"/></label>
    </div>
    <label className="check-row"><input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)}/> Enviar também notificação push</label>
    <button className="primary-btn" disabled={busy || !title.trim()} onClick={submit}>{busy ? "A publicar…" : "Publicar"}</button>
    {msg && <p className="muted">{msg}</p>}
    <ul className="news-admin-list">{items.map(i => <li key={i.id}><span>{KIND_LABEL[i.kind]} · <b>{i.title}</b> <small>{new Date(i.createdAt).toLocaleDateString("pt-PT")}</small></span>
      <button className="secondary-btn danger compact" onClick={async () => { await deleteNews(i.id); load(); }}>Apagar</button></li>)}</ul>
  </div>;
}
