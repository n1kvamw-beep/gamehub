// Sala online: o anfitrião corre o jogo (emulador) e envia o vídeo/áudio por WebRTC;
// o convidado envia os botões como jogador 2 pelo canal do comando. A ligação inicial passa pelo Supabase Realtime.
export const roomChannel = (code: string) => `gamehub-room-${code.trim().toUpperCase()}`;
export const ROOM_EVENT = "r";
export const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
];
export type RoomMsg =
  | { t: "join"; id: string }
  | { t: "offer"; id: string; sdp: RTCSessionDescriptionInit }
  | { t: "answer"; id: string; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; id: string; to: "host" | "guest"; c: RTCIceCandidateInit };
