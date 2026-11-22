import { useEffect, useState, type FormEvent } from "react";
import { Star, Trash2, MessageCircle } from "lucide-react";
import type { Game } from "./types";
import type { AuthUser } from "./auth";
import Avatar from "./Avatar";
import { fetchComments, addComment, deleteComment, fetchMyRating, setRating, type Comment } from "./social";

type Props = { game: Game; user: AuthUser; onNeedLogin: () => void; onChanged: () => void; onOpenProfile: (name: string) => void };

export default function GameSocial({ game, user, onNeedLogin, onChanged, onOpenProfile }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [mine, setMine] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setComments(await fetchComments(game.id));
      setMine(user ? await fetchMyRating(game.id) : 0);
    } catch { setError("Não foi possível carregar os comentários."); }
  }
  useEffect(() => { setError(""); load(); }, [game.id, user?.id]);

  async function rate(stars: number) {
    if (!user) return onNeedLogin();
    try { await setRating(game.id, stars); setMine(stars); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível avaliar."); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return onNeedLogin();
    if (!text.trim()) return;
    setBusy(true); setError("");
    try { await addComment(game.id, text); setText(""); await load(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível comentar."); }
    finally { setBusy(false); }
  }
  async function remove(comment: Comment) {
    if (!confirm("Apagar este comentário?")) return;
    try { await deleteComment(comment.id); await load(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível apagar."); }
  }

  const shown = hover || mine;
  return <div className="social">
    <div className="section-heading"><div><h2>A tua avaliação</h2><p>{user ? (mine ? `Deste ${mine} de 5 estrelas.` : "Ainda não avaliaste este jogo.") : "Entra na tua conta para avaliar."}</p></div></div>
    <div className="star-row" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={n <= shown ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => rate(n)} title={`${n} estrelas`}><Star size={24} fill={n <= shown ? "currentColor" : "none"}/></button>)}
    </div>
    <div className="section-heading" style={{ marginTop: 28 }}><div><h2>Comentários</h2><p>{comments.length} {comments.length === 1 ? "comentário" : "comentários"}</p></div></div>
    <form className="comment-form" onSubmit={submit}>
      <textarea rows={2} maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder={user ? "Escreve um comentário..." : "Entra na tua conta para comentar"} onFocus={() => { if (!user) onNeedLogin(); }}/>
      <button className="primary-btn" type="submit" disabled={busy || !text.trim()}><MessageCircle size={16}/>Comentar</button>
    </form>
    {error && <div className="form-error"><span>{error}</span></div>}
    <div className="comment-list">
      {comments.map(c => <div className="comment" key={c.id}>
        <Avatar name={c.username} avatarKey={c.avatar} size={32}/>
        <div><button className="link-name" onClick={() => onOpenProfile(c.username)}>{c.username}</button> <small>{new Date(c.created_at).toLocaleDateString("pt-PT")}</small><p>{c.body}</p></div>
        {(user?.id === c.user_id || user?.role === "admin") && <button className="icon-btn" title="Apagar" onClick={() => remove(c)}><Trash2 size={15}/></button>}
      </div>)}
    </div>
  </div>;
}
