import { imageUrl } from "./r2";

// Avatar redondo: imagem do perfil ou a inicial do nome.
export default function Avatar({ name, avatarKey, url, size = 34, accent }: { name: string; avatarKey?: string | null; url?: string; size?: number; accent?: string }) {
  const src = url ?? imageUrl(avatarKey);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4), ...(accent ? { background: accent } : {}) };
  return <div className="avatar" style={style}>{src ? <img src={src} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}/> : name.slice(0, 1).toUpperCase()}</div>;
}
