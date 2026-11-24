import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { enablePush, pushEnabled, pushSupported } from "./news";

const KEY = "gh-notify-later";
const later = () => { try { return Number(localStorage.getItem(KEY)) > Date.now(); } catch { return false; } };

// Faixa que convida quem entra no site a ativar as notificações de novidades.
export default function NotifyPrompt({ loggedIn, onNeedLogin }: { loggedIn: boolean; onNeedLogin: () => void }) {
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!pushSupported() || Notification.permission === "denied" || later()) return;
    pushEnabled().then(on => setShow(!on));
  }, [loggedIn]);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)); } catch { /* ignora */ } setShow(false); };
  async function enable() {
    setMsg("");
    if (!loggedIn) return onNeedLogin();
    try { await enablePush(); setShow(false); } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível ativar."); }
  }
  return <div className="notify-prompt" role="dialog" aria-label="Ativar notificações">
    <BellRing size={22}/>
    <div><strong>Queres saber das novidades?</strong><span>{msg || (loggedIn ? "Avisamos-te de jogos novos, mecânicas e correções." : "Entra na tua conta e ativa os avisos de jogos novos, mecânicas e correções.")}</span></div>
    <button className="primary-btn compact" onClick={enable}>{loggedIn ? "Ativar" : "Entrar e ativar"}</button>
    <button className="icon-btn" onClick={dismiss} title="Agora não" aria-label="Agora não"><X size={16}/></button>
  </div>;
}
