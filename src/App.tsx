import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Gamepad2, Search, Plus, Library, Heart, Clock3, Settings, Menu, X, Upload,
  Play, Maximize, Minimize, RotateCcw, ArrowLeft, Trash2, Pencil, Star,
  FolderOpen, Github, Link as LinkIcon, Gamepad, Sparkles, AlertCircle, CheckCircle2, Download, LogIn, LogOut
} from "lucide-react";
import { filesFromUpload, makePlayableDocument } from "./importer";
import { saveRemoteGame, deleteRemoteGame, downloadRemoteGame } from "./admin";
import { signIn, signUp, signOut, loadUser, onAuth, type AuthUser } from "./auth";
import { fetchRemoteGames, loadRemoteGameFiles, setRemoteMeta } from "./remote";
import type { Game, GameFile } from "./types";

type View = "home" | "library" | "favorites" | "recent" | "detail" | "player" | "settings";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const blank = { name: "", description: "", category: "Indie", genre: "Ação", platform: "HTML5", isPublic: true };
export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Game | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [genre, setGenre] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [pendingFiles, setPendingFiles] = useState<GameFile[]>([]);
  const [cover, setCover] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [playUrl, setPlayUrl] = useState("");
  const [blobUrls, setBlobUrls] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [importMode, setImportMode] = useState<"files" | "url" | "github">("files");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [user, setUser] = useState<AuthUser>(null);
  const isAdmin = user?.role === "admin";
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    let online: Game[] = [];
    try { online = await fetchRemoteGames(); } catch { setError("Não foi possível carregar os jogos online."); }
    setGames(online);
    return online;
  }
  useEffect(() => { refresh().catch(() => setError("Não foi possível carregar os jogos online.")); }, [user?.id]);
  useEffect(() => { if (!isAdmin && view === "settings") setView("home"); }, [isAdmin, view]);
  useEffect(() => {
    const run = () => { loadUser().then(setUser).catch(() => setUser(null)); };
    run();
    return onAuth(run);
  }, []);
  function openAuth() { setAuthName(""); setAuthPass(""); setAuthError(""); setAuthMode("login"); setAuthOpen(true); }
  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") await signIn(authName, authPass);
      else await signUp(authName, authPass);
      setAuthOpen(false); setAuthPass("");
    } catch (e) { setAuthError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setAuthBusy(false); }
  }
  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstallPrompt(null); setIsStandalone(true); setNotice("GameHub instalado neste dispositivo."); };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => setError("Não foi possível ativar o modo de aplicação instalável."));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => () => { if (playUrl) URL.revokeObjectURL(playUrl); blobUrls.forEach(URL.revokeObjectURL); }, [playUrl, blobUrls]);

  const filtered = useMemo(() => {
    let list = [...games];
    if (view === "favorites") list = list.filter(g => g.favorite);
    if (view === "recent") list = list.filter(g => g.lastPlayed).sort((a,b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    if (query.trim()) list = list.filter(g => g.name.toLowerCase().includes(query.toLowerCase()) || g.description.toLowerCase().includes(query.toLowerCase()));
    if (genre !== "Todos") list = list.filter(g => g.genre === genre);
    if (sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
    if (sort === "oldest") list.sort((a,b) => a.addedAt - b.addedAt);
    if (sort === "newest") list.sort((a,b) => b.addedAt - a.addedAt);
    return list;
  }, [games, view, query, genre, sort]);
  const recent = [...games].sort((a,b) => b.addedAt - a.addedAt).slice(0,4);
  const favorites = games.filter(g => g.favorite).slice(0,4);

  function openAdd() {
    setForm(blank); setPendingFiles([]); setCover(""); setEditing(false); setError(""); setImportMode("files");
    setSourceUrl(""); setGithubUrl(""); setModal(true);
  }
  function openEdit(game: Game) {
    if (!isAdmin) return;
    setSelected(game); setForm({ name: game.name, description: game.description, category: game.category, genre: game.genre, platform: game.platform, isPublic: game.isPublic !== false });
    setPendingFiles([]); setCover(game.cover || ""); setEditing(true); setError(""); setModal(true);
  }
  async function chooseFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError("");
    try { setPendingFiles(await filesFromUpload(list)); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao ler os ficheiros."); }
    finally { setBusy(false); }
  }
  async function importRemote(url: string, github = false) {
    setBusy(true); setError("");
    try {
      let normalized = url.trim();
      if (github) {
        const match = normalized.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
        if (!match) throw new Error("Introduz um URL válido de um repositório GitHub.");
        normalized = `https://codeload.github.com/${match[1]}/${match[2].replace(/\.git$/, "")}/zip/refs/heads/`;
        const meta = await fetch(`https://api.github.com/repos/${match[1]}/${match[2].replace(/\.git$/, "")}`);
        if (!meta.ok) throw new Error("Não foi possível consultar o repositório. Confirma se é público.");
        const data = await meta.json();
        const zip = await fetch(normalized + data.default_branch);
        if (!zip.ok) throw new Error("Não foi possível descarregar o ZIP do repositório.");
        const blob = await zip.blob();
        const file = new File([blob], "github-game.zip", { type: "application/zip" });
        setPendingFiles(await filesFromUpload([file]));
        if (!form.name) setForm(f => ({ ...f, name: data.name || "" }));
      } else {
        const response = await fetch(normalized);
        if (!response.ok) throw new Error("Não foi possível obter o URL. O servidor pode bloquear CORS.");
        const blob = await response.blob();
        if (blob.type.includes("html") || /\\.html?($|\\?)/i.test(normalized)) {
          const name = normalized.split("/").pop()?.split("?")[0] || "index.html";
          setPendingFiles([{ path: name.toLowerCase().endsWith(".html") ? name : "index.html", blob, type: "text/html" }]);
        } else if (/\\.zip($|\\?)/i.test(normalized) || blob.type.includes("zip")) {
          setPendingFiles(await filesFromUpload([new File([blob], "remote.zip")]));
        } else throw new Error("O URL deve apontar para um ficheiro HTML ou ZIP.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao importar."); }
    finally { setBusy(false); }
  }
  async function saveGame() {
    setError("");
    if (!isAdmin) return setError("Só o administrador pode gerir jogos.");
    if (!form.name.trim()) return setError("Indica o nome do jogo.");
    if (!pendingFiles.length && !(editing && selected)) return setError("Adiciona os ficheiros do jogo.");
    setBusy(true);
    try {
      await saveRemoteGame({ existing: editing ? selected : null, form: { ...form, name: form.name.trim() }, files: pendingFiles, cover });
      const fresh = await refresh();
      if (editing && selected) setSelected(fresh.find(g => g.id === selected.id) ?? null);
      setModal(false); setNotice(editing ? "Jogo atualizado." : "Jogo publicado.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível guardar o jogo."); }
    finally { setBusy(false); }
  }
  async function toggleFavorite(game: Game) {
    setRemoteMeta(game.id, { favorite: !game.favorite });
    const fresh = await refresh();
    if (selected?.id === game.id) setSelected(fresh.find(g => g.id === game.id) ?? selected);
  }
  async function deleteGame(game: Game) {
    if (!isAdmin) return;
    if (!confirm(`Eliminar "${game.name}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try {
      await deleteRemoteGame(game);
      setSelected(null); setView("library");
      await refresh();
      setNotice("Jogo eliminado."); setTimeout(() => setNotice(""), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível eliminar o jogo."); }
    finally { setBusy(false); }
  }
  async function downloadGame(game: Game) {
    setError("");
    try { await downloadRemoteGame(game); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível descarregar o jogo."); }
  }
  async function play(game: Game) {
    setBusy(true); setError("");
    try {
      if (playUrl) URL.revokeObjectURL(playUrl);
      blobUrls.forEach(URL.revokeObjectURL);
      const ready = await loadRemoteGameFiles(game);
      const result = await makePlayableDocument(ready);
      setPlayUrl(result.url); setBlobUrls(result.urls); setSelected(game); setView("player");
      setRemoteMeta(game.id, { lastPlayed: Date.now(), playCount: game.playCount + 1 });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível iniciar o jogo."); }
    finally { setBusy(false); }
  }
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await frame.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { setError("O navegador não permitiu o modo de ecrã inteiro."); }
  }
  function backToLibrary() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setView("detail"); }
  const title = view === "settings" ? "Configurações" : view === "favorites" ? "Os meus favoritos" : view === "recent" ? "Jogados recentemente" : view === "library" ? "A minha biblioteca" : "Descobrir jogos";
  const navItems: { id: View; label: string; icon: typeof Gamepad2 }[] = [
    { id:"home", label:"Início", icon:Gamepad2 }, { id:"library", label:"Biblioteca", icon:Library },
    { id:"favorites", label:"Favoritos", icon:Heart }, { id:"recent", label:"Recentes", icon:Clock3 }
  ];
  if (isAdmin) navItems.push({ id:"settings", label:"Configurações", icon:Settings });

  if (view === "player" && selected) return <main className="player-page">
    <header className="player-bar">
      <button className="icon-btn" onClick={backToLibrary} title="Voltar"><ArrowLeft /></button>
      <div className="player-title"><Gamepad2 size={19}/><strong>{selected.name}</strong><span className="live-dot"/> <small>A jogar</small></div>
      <div className="player-actions">
        <button className="icon-btn" onClick={() => frame.current?.contentWindow?.location.reload()} title="Reiniciar"><RotateCcw/></button>
        <button className="primary-btn compact" onClick={toggleFullscreen}>{isFullscreen ? <Minimize/> : <Maximize/>}<span>{isFullscreen ? "Sair do ecrã inteiro" : "Ecrã inteiro"}</span></button>
      </div>
    </header>
    <section className="game-stage"><iframe ref={frame} title={`Jogar ${selected.name}`} src={playUrl} sandbox="allow-scripts allow-pointer-lock allow-forms allow-modals allow-downloads" allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope; picture-in-picture" /></section>
    <footer className="player-footer"><span><span className="live-dot"/> Jogo em execução</span><span>Se o jogo não carregar, verifica os ficheiros e as dependências externas.</span></footer>
  </main>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Gamepad2 size={23}/></div><span>Game<span>Hub</span></span><button className="mobile-close icon-btn" onClick={() => setMobileNav(false)}><X/></button></div>
      <div className="side-label">MENU PRINCIPAL</div>
      <nav>{navItems.map(n => <button key={n.id} className={`nav-item ${view === n.id ? "active" : ""}`} onClick={() => {setView(n.id);setSelected(null);setMobileNav(false);}}><n.icon size={18}/>{n.label}{n.id === "library" && <span className="nav-count">{games.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="storage-card"><div className="storage-icon"><FolderOpen size={18}/></div><div><strong>Biblioteca online</strong><small>Guardada no Supabase</small></div><CheckCircle2 size={15} className="green"/></div><div className="profile"><div className="avatar">{user ? user.username.slice(0, 1).toUpperCase() : "G"}</div><div><strong>{user ? user.username : "Visitante"}</strong><small>{user ? (user.role === "admin" ? "Administrador" : "Utilizador") : "Sem sessão"}</small></div>{user ? <button className="icon-btn" title="Sair" onClick={() => { signOut(); }}><LogOut size={17}/></button> : <button className="icon-btn" title="Entrar" onClick={openAuth}><LogIn size={17}/></button>}</div></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)}><Menu/></button><div className="breadcrumbs">GameHub <span>/</span> {view === "detail" ? selected?.name : view === "player" ? "Jogador" : title}</div><div className="top-actions">{installPrompt && !isStandalone && <button className="install-btn" onClick={installApp}><Download size={16}/><span>Instalar app</span></button>}<label className="search-box"><Search size={17}/><input placeholder="Pesquisar jogos..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label>{isAdmin && <button className="primary-btn" onClick={openAdd}><Plus size={18}/>Adicionar jogo</button>}</div></header>
      {view === "detail" && selected ? <section className="content detail-content">
        <button className="back-link" onClick={() => setView("library")}><ArrowLeft size={16}/> Voltar à biblioteca</button>
        <div className="detail-hero">
          <div className="detail-cover">{selected.cover ? <img src={selected.cover}/> : <div className="cover-placeholder large"><Gamepad2 size={55}/></div>}</div>
          <div className="detail-info"><div className="eyebrow">{selected.category} <span>•</span> {selected.genre}{isAdmin && selected.isPublic === false && <> <span>•</span> Privado</>}</div><h1>{selected.name}</h1><p>{selected.description || "Sem descrição disponível."}</p><div className="game-meta"><span><Gamepad size={15}/>{selected.platform}</span><span><Clock3 size={15}/>{new Date(selected.addedAt).toLocaleDateString("pt-PT")}</span><span><Play size={15}/>{selected.playCount} sessões</span></div><div className="detail-buttons"><button className="primary-btn play-large" onClick={() => play(selected)} disabled={busy}><Play size={20} fill="currentColor"/>JOGAR AGORA</button><button className={`secondary-btn ${selected.favorite ? "is-fav" : ""}`} onClick={() => toggleFavorite(selected)}><Heart size={18} fill={selected.favorite ? "currentColor" : "none"}/></button>{isAdmin && <><button className="secondary-btn" title="Editar" onClick={() => openEdit(selected)}><Pencil size={18}/></button><button className="secondary-btn" title="Descarregar jogo" onClick={() => downloadGame(selected)}><Download size={18}/></button><button className="secondary-btn danger" title="Eliminar" onClick={() => deleteGame(selected)}><Trash2 size={18}/></button></>}</div></div>
        </div><div className="section-heading"><div><h2>Informações</h2><p>Detalhes guardados na tua biblioteca local.</p></div></div><div className="info-panel"><div><small>PLATAFORMA</small><strong>{selected.platform}</strong></div><div><small>CATEGORIA</small><strong>{selected.category}</strong></div><div><small>GÉNERO</small><strong>{selected.genre}</strong></div><div><small>ADICIONADO EM</small><strong>{new Date(selected.addedAt).toLocaleDateString("pt-PT")}</strong></div></div>
      </section> : <section className="content">
        {view === "home" && <><div className="welcome-banner"><div className="welcome-copy"><div className="eyebrow"><Sparkles size={14}/> A TUA COLEÇÃO PESSOAL</div><h1>Os teus jogos.<br/><span>O teu universo.</span></h1><p>Importa os teus projetos e joga diretamente no navegador.</p>{isAdmin && <button className="primary-btn" onClick={openAdd}><Plus size={18}/>Adicionar primeiro jogo</button>}</div><div className="banner-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="glow-controller"><Gamepad2 size={105}/></div><div className="float-chip chip-one"><Play size={14}/> PLAY</div><div className="float-chip chip-two"><Star size={14}/> YOUR GAMES</div></div></div>
          <div className="stats-row"><div className="stat-card"><div className="stat-icon purple"><Library/></div><div><strong>{games.length}</strong><small>Jogos na biblioteca</small></div></div><div className="stat-card"><div className="stat-icon pink"><Heart/></div><div><strong>{games.filter(g=>g.favorite).length}</strong><small>Favoritos</small></div></div><div className="stat-card"><div className="stat-icon blue"><Play/></div><div><strong>{games.reduce((n,g)=>n+g.playCount,0)}</strong><small>Partidas iniciadas</small></div></div></div>
          {games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Gamepad2 size={35}/></div><h2>{isAdmin ? "A biblioteca começa aqui" : "Ainda não há jogos"}</h2><p>{isAdmin ? "Adiciona um jogo HTML ou um ZIP. Fica guardado no Supabase e aparece para toda a gente." : "Volta mais tarde: ainda não foram publicados jogos."}</p>{isAdmin && <button className="primary-btn" onClick={openAdd}><Upload size={17}/>Importar um jogo</button>}</div> : <><GameSection title="Adicionados recentemente" subtitle="Os últimos jogos que chegaram à tua coleção." games={recent} onOpen={g=>{setSelected(g);setView("detail")}} onFavorite={toggleFavorite}/>{favorites.length>0 && <GameSection title="Os teus favoritos" subtitle="Os jogos que marcaste como especiais." games={favorites} onOpen={g=>{setSelected(g);setView("detail")}} onFavorite={toggleFavorite}/>}<GameSection title="Toda a biblioteca" subtitle="Continua a tua aventura." games={filtered.slice(0,8)} onOpen={g=>{setSelected(g);setView("detail")}} onFavorite={toggleFavorite}/></>}
        </>}
        {view === "settings" && <SettingsPanel games={games} user={user} onSignOut={() => { signOut(); }}/>}
        {view !== "home" && view !== "settings" && <><div className="page-heading"><div><div className="eyebrow">A TUA COLEÇÃO</div><h1>{title}</h1><p>{filtered.length} {filtered.length === 1 ? "jogo encontrado" : "jogos encontrados"}</p></div>{isAdmin && <button className="primary-btn" onClick={openAdd}><Plus size={18}/>Adicionar jogo</button>}</div><div className="filter-row"><label className="filter-select">Género <select value={genre} onChange={e=>setGenre(e.target.value)}><option>Todos</option>{["Ação","Aventura","Corrida","Puzzle","Estratégia","RPG","Simulação","Indie","Outro"].map(g=><option key={g}>{g}</option>)}</select></label><label className="filter-select">Ordenar por <select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="name">Nome (A–Z)</option></select></label></div><div className="game-grid">{filtered.map(g=><GameCard key={g.id} game={g} onOpen={()=>{setSelected(g);setView("detail")}} onFavorite={()=>toggleFavorite(g)}/>)}</div>{filtered.length===0 && <div className="empty-state compact-empty"><div className="empty-icon"><Search/></div><h2>Nenhum jogo encontrado</h2><p>Experimenta alterar a pesquisa ou os filtros.</p><button className="secondary-btn" onClick={()=>{setQuery("");setGenre("Todos")}}>Limpar filtros</button></div>}</>}
      </section>}
      {error && <div className="toast error"><AlertCircle size={17}/>{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
      {notice && <div className="toast success"><CheckCircle2 size={17}/>{notice}</div>}
    </main>
    {authOpen && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAuthOpen(false)}}><div className="modal">
      <div className="modal-head"><div><div className="eyebrow">{authMode === "login" ? "ÁREA DE MEMBROS" : "NOVA CONTA"}</div><h2>{authMode === "login" ? "Entrar" : "Criar conta"}</h2></div><button className="icon-btn" onClick={()=>setAuthOpen(false)}><X/></button></div>
      <form onSubmit={submitAuth}>
        <div className="form-grid"><label className="full">Utilizador<input value={authName} onChange={e=>setAuthName(e.target.value)} autoComplete="username" placeholder="o_teu_nome"/></label><label className="full">Senha<input type="password" value={authPass} onChange={e=>setAuthPass(e.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="••••••••"/></label></div>
        {authError && <div className="form-error"><AlertCircle size={15}/>{authError}</div>}
        <div className="modal-footer"><button type="button" className="secondary-btn" onClick={()=>{setAuthMode(authMode === "login" ? "signup" : "login");setAuthError("");}}>{authMode === "login" ? "Criar conta" : "Já tenho conta"}</button><button type="submit" className="primary-btn" disabled={authBusy || !authName.trim() || !authPass}>{authBusy ? "A aguardar..." : authMode === "login" ? "Entrar" : "Criar conta"}</button></div>
      </form>
    </div></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><div className="modal">
      <div className="modal-head"><div><div className="eyebrow">{editing ? "PERSONALIZAR" : "EXPANDIR A COLEÇÃO"}</div><h2>{editing ? "Editar jogo" : "Adicionar novo jogo"}</h2></div><button className="icon-btn" onClick={()=>setModal(false)}><X/></button></div>
      {!editing && <div className="import-tabs"><button className={importMode==="files"?"selected":""} onClick={()=>setImportMode("files")}><Upload size={16}/>Ficheiros</button><button className={importMode==="url"?"selected":""} onClick={()=>setImportMode("url")}><LinkIcon size={16}/>URL</button><button className={importMode==="github"?"selected":""} onClick={()=>setImportMode("github")}><Github size={16}/>GitHub</button></div>}
      {!editing && importMode==="files" && <div className="upload-zone" onClick={()=>fileInput.current?.click()}><input ref={fileInput} type="file" hidden multiple accept=".zip,.html,.htm,.js,.css,.json,.png,.jpg,.jpeg,.webp,.svg,.mp3,.ogg,.wasm" onChange={e=>chooseFiles(e.target.files)}/><input ref={folderInput} type="file" hidden multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={e=>chooseFiles(e.target.files)}/><div className="upload-icon"><Upload size={24}/></div><strong>{busy ? "A processar ficheiros..." : pendingFiles.length ? `${pendingFiles.length} ficheiros selecionados` : "Arrasta os ficheiros ou clica para selecionar"}</strong><small>ZIP com o jogo completo ou ficheiro HTML individual · Máx. 300 MB</small><span>ZIP · HTML · Recursos do jogo</span><button type="button" className="folder-pick" onClick={e=>{e.stopPropagation();folderInput.current?.click();}}>Ou selecionar uma pasta inteira</button></div>}
      {!editing && importMode==="url" && <div className="remote-import"><label>URL do jogo (HTML ou ZIP)</label><div className="inline-field"><input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://exemplo.com/jogo.zip"/><button className="secondary-btn" disabled={busy || !sourceUrl.trim()} onClick={()=>importRemote(sourceUrl)}>Importar</button></div><small>O servidor de origem tem de permitir pedidos CORS.</small></div>}
      {!editing && importMode==="github" && <div className="remote-import"><label>Repositório público do GitHub</label><div className="inline-field"><input value={githubUrl} onChange={e=>setGithubUrl(e.target.value)} placeholder="https://github.com/utilizador/jogo"/><button className="secondary-btn" disabled={busy || !githubUrl.trim()} onClick={()=>importRemote(githubUrl,true)}>Importar</button></div><small>Importa a branch principal e procura um ficheiro HTML.</small></div>}
      <div className="form-grid"><label className="full">Nome do jogo<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: O meu jogo"/></label><label className="full">Descrição<textarea rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Descreve brevemente o teu jogo..."/></label><label>Categoria<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["Indie","Aventura","Arcade","Projeto pessoal","Outro"].map(v=><option>{v}</option>)}</select></label><label>Género<select value={form.genre} onChange={e=>setForm({...form,genre:e.target.value})}>{["Ação","Aventura","Corrida","Puzzle","Estratégia","RPG","Simulação","Indie","Outro"].map(v=><option>{v}</option>)}</select></label><label>Plataforma<select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}>{["HTML5","WebGL","Three.js","Phaser","Outro"].map(v=><option>{v}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={form.isPublic} onChange={e=>setForm({...form,isPublic:e.target.checked})}/>Jogo público (visível para todos)</label><label>Capa do jogo<div className="cover-picker"><button type="button" className="secondary-btn" onClick={()=>coverInput.current?.click()}><Upload size={15}/>Escolher imagem</button><input ref={coverInput} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f){const reader=new FileReader();reader.onload=()=>setCover(String(reader.result));reader.readAsDataURL(f)}}}/>{cover && <img src={cover}/>}</div></label></div>
      {error && <div className="form-error"><AlertCircle size={15}/>{error}</div>}
      <div className="modal-footer"><span>{editing && !pendingFiles.length ? "Ficheiros atuais mantidos" : `${pendingFiles.length} ficheiros`} · Guardado no Supabase</span><button className="primary-btn" disabled={busy} onClick={saveGame}>{busy ? "A guardar..." : editing ? "Guardar alterações" : "Adicionar à biblioteca"}</button></div>
    </div></div>}
  </div>;
}

function GameSection({title,subtitle,games,onOpen,onFavorite}:{title:string;subtitle:string;games:Game[];onOpen:(g:Game)=>void;onFavorite:(g:Game)=>void}) {
  if (!games.length) return null;
  return <section className="game-section"><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="section-count">{games.length} jogos</span></div><div className="game-grid">{games.map(g=><GameCard key={g.id} game={g} onOpen={()=>onOpen(g)} onFavorite={()=>onFavorite(g)}/>)}</div></section>;
}
function GameCard({game,onOpen,onFavorite}:{game:Game;onOpen:()=>void;onFavorite:()=>void}) {
  return <article className="game-card"><button className="card-cover" onClick={onOpen}>{game.cover ? <img src={game.cover}/> : <div className="cover-placeholder"><Gamepad2 size={35}/><span>GAMEHUB</span></div>}<span className="card-play"><Play size={19} fill="currentColor"/></span><span className="card-category">{game.category}</span></button><div className="card-info"><div className="card-title-row"><button className="card-title" onClick={onOpen}>{game.name}</button><button className={`favorite-btn ${game.favorite?"active":""}`} onClick={onFavorite}><Heart size={17} fill={game.favorite?"currentColor":"none"}/></button></div><p>{game.description || "Sem descrição disponível."}</p><div className="card-meta"><span>{game.genre}</span><span>{game.platform}</span></div></div></article>;
}

function SettingsPanel({ games, user, onSignOut }: { games: Game[]; user: AuthUser; onSignOut: () => void }) {
  const publicCount = games.filter(g => g.isPublic !== false).length;
  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO</div><h1>Configurações</h1><p>Gestão do GameHub.</p></div></div>
    <div className="info-panel">
      <div><small>CONTA</small><strong>{user?.username}</strong></div>
      <div><small>PAPEL</small><strong>{user?.role === "admin" ? "Administrador" : "Utilizador"}</strong></div>
      <div><small>JOGOS ONLINE</small><strong>{games.length}</strong></div>
      <div><small>PÚBLICOS / PRIVADOS</small><strong>{publicCount} / {games.length - publicCount}</strong></div>
    </div>
    <div className="detail-buttons" style={{ marginTop: 20 }}><button className="secondary-btn" onClick={onSignOut}><LogOut size={17}/> Terminar sessão</button></div>
  </section>;
}
