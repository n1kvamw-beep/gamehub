import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { fetchNews, KIND_LABEL, lastSeen, markSeen, pushSupported, pushEnabled, enablePush, disablePush, type NewsItem } from "./news";

// Sino com as novidades do site e o botão para ativar as notificações no aparelho.
export default function NewsBell({ loggedIn, onNeedLogin }: { loggedIn: boolean; onNeedLogin: () => void }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(lastSeen);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetchNews().then(setItems); pushEnabled().then(setOn); }, [loggedIn]);
  const unread = items.filter(i => i.createdAt > seen).length;
  const toggle = () => { setOpen(o => !o); if (!open) { markSeen(); setSeen(Date.now()); } };
  async function togglePush() {
    setMsg("");
    if (!loggedIn) return onNeedLogin();
    try { if (on) { await disablePush(); setOn(false); } else { await enablePush(); setOn(true); setMsg("Notificações ativadas neste aparelho."); } }
    catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível alterar."); }
  }
  return <div className="news-wrap">
    <button className="icon-btn news-btn" onClick={toggle} title="Novidades" aria-label="Novidades">{on ? <BellRing size={19}/> : <Bell size={19}/>}{unread > 0 && <span className="news-badge">{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <><div className="news-backdrop" onClick={() => setOpen(false)}/><div className="news-panel">
      <div className="news-head"><strong>Novidades</strong>
        {pushSupported() && <button className="secondary-btn compact" onClick={togglePush}>{on ? <><BellOff size={14}/> Desativar avisos</> : <><BellRing size={14}/> Ativar avisos</>}</button>}
      </div>
      {msg && <p className="muted news-msg">{msg}</p>}
      {items.length === 0 ? <p className="muted news-msg">Ainda não há novidades.</p> : <ul>{items.map(i => <li key={i.id}>
        <span className={`news-kind k-${i.kind}`}>{KIND_LABEL[i.kind]}</span><b>{i.title}</b>{i.body && <p>{i.body}</p>}<small>{new Date(i.createdAt).toLocaleDateString("pt-PT")}</small>
      </li>)}</ul>}
    </div></>}
  </div>;
}
