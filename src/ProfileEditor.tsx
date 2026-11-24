import { useRef, useState } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import type { PublicProfile } from "./profile";
import { updateMyProfile } from "./profile";
import { r2PutImage, r2DeleteImage, imageUrl } from "./r2";
import { resizeImage } from "./image";

const COLORS = ["#2fc977", "#5865f2", "#3ba55d", "#faa61a", "#ed4245", "#eb459e", "#00b0f4", "#f47b67", "#43b581", "#99aab5"];

type Props = { profile: PublicProfile; onClose: () => void; onSaved: () => void };

export default function ProfileEditor({ profile, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [pronouns, setPronouns] = useState(profile.pronouns);
  const [status, setStatus] = useState(profile.status);
  const [bio, setBio] = useState(profile.bio);
  const [accent, setAccent] = useState(profile.accent);
  const [avatarKey, setAvatarKey] = useState(profile.avatarKey);
  const [bannerKey, setBannerKey] = useState(profile.bannerKey);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const avatarSrc = avatarBlob ? URL.createObjectURL(avatarBlob) : imageUrl(avatarKey);
  const bannerSrc = bannerBlob ? URL.createObjectURL(bannerBlob) : imageUrl(bannerKey);

  async function pick(file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return;
    setError("");
    try {
      const blob = await resizeImage(file, kind === "avatar" ? 256 : 960, kind === "avatar" ? 256 : 320);
      if (kind === "avatar") { setAvatarBlob(blob); setAvatarKey(null); } else { setBannerBlob(blob); setBannerKey(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível usar a imagem."); }
  }

  async function save() {
    setBusy(true); setError("");
    try {
      let aKey = avatarKey, bKey = bannerKey;
      if (avatarBlob) aKey = await r2PutImage("avatar", avatarBlob);
      if (bannerBlob) bKey = await r2PutImage("banner", bannerBlob);
      await updateMyProfile(profile.id, { displayName, pronouns, status, bio, accent, avatarKey: aKey, bannerKey: bKey });
      // Só depois de gravar é que se apagam as imagens antigas.
      if (profile.avatarKey && profile.avatarKey !== aKey) await r2DeleteImage(profile.avatarKey);
      if (profile.bannerKey && profile.bannerKey !== bKey) await r2DeleteImage(profile.bannerKey);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível guardar."); setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal profile-editor">
      <div className="modal-head"><div><div className="eyebrow">O TEU PERFIL</div><h2>Personalizar perfil</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div>
      <div className="pe-preview">
        <div className="pe-banner" style={{ background: bannerSrc ? `center/cover url(${bannerSrc})` : accent }}/>
        <div className="pe-avatar" style={{ borderColor: accent }}>{avatarSrc ? <img src={avatarSrc} alt=""/> : <span>{profile.username.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="pe-names"><strong>{displayName || profile.username}</strong><small>@{profile.username}{pronouns && ` · ${pronouns}`}</small>{status && <em>{status}</em>}</div>
      </div>
      <div className="pe-actions">
        <input ref={avatarInput} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0], "avatar"); e.target.value = ""; }}/>
        <input ref={bannerInput} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0], "banner"); e.target.value = ""; }}/>
        <button className="secondary-btn" onClick={() => avatarInput.current?.click()}><Upload size={15}/>Avatar</button>
        {(avatarSrc) && <button className="secondary-btn" onClick={() => { setAvatarBlob(null); setAvatarKey(null); }}><Trash2 size={15}/></button>}
        <button className="secondary-btn" onClick={() => bannerInput.current?.click()}><Upload size={15}/>Banner</button>
        {(bannerSrc) && <button className="secondary-btn" onClick={() => { setBannerBlob(null); setBannerKey(null); }}><Trash2 size={15}/></button>}
      </div>
      <div className="form-grid">
        <label>Nome a mostrar<input value={displayName} maxLength={32} onChange={e => setDisplayName(e.target.value)} placeholder={profile.username}/></label>
        <label>Pronomes<input value={pronouns} maxLength={20} onChange={e => setPronouns(e.target.value)} placeholder="ele/dele, ela/dela..."/></label>
        <label className="full">Estado<input value={status} maxLength={60} onChange={e => setStatus(e.target.value)} placeholder="O que estás a jogar ou a sentir?"/></label>
        <label className="full">Sobre mim ({bio.length}/300)<textarea rows={4} maxLength={300} value={bio} onChange={e => setBio(e.target.value)} placeholder="Conta um pouco sobre ti..."/></label>
        <div className="full pe-colors"><small>COR DO PERFIL</small>
          <div>{COLORS.map(c => <button key={c} type="button" className={c === accent ? "on" : ""} style={{ background: c }} onClick={() => setAccent(c)} aria-label={c}/>)}
            <input type="color" value={accent} onChange={e => setAccent(e.target.value)} title="Outra cor"/></div>
        </div>
      </div>
      {error && <div className="form-error"><span>{error}</span></div>}
      <div className="modal-footer"><span>As imagens são cortadas ao centro e comprimidas.</span><button className="primary-btn" disabled={busy} onClick={save}>{busy ? "A guardar..." : "Guardar perfil"}</button></div>
    </div>
  </div>;
}
