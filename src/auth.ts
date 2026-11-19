import { supabase } from "./supabase";

export type AuthUser = { id: string; username: string; role: "admin" | "user" } | null;

// O Supabase usa email para entrar. Aqui o utilizador só escreve o nome; o email é interno.
const DOMAIN = "gamehub.app";
const toEmail = (username: string) => `${username.trim().toLowerCase()}@${DOMAIN}`;

function checkName(username: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) throw new Error("O utilizador deve ter 3 a 20 letras, números ou _.");
}
function need() {
  if (!supabase) throw new Error("O Supabase não está configurado.");
  return supabase;
}

export async function signIn(username: string, password: string) {
  checkName(username);
  const { error } = await need().auth.signInWithPassword({ email: toEmail(username), password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? "Utilizador ou senha errados." : error.message);
}

export async function signUp(username: string, password: string) {
  checkName(username);
  if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const { data, error } = await need().auth.signUp({ email: toEmail(username), password });
  if (error) throw new Error(/already/i.test(error.message) ? "Esse utilizador já existe." : error.message);
  if (!data.session) throw new Error("Conta criada, mas a confirmação de email está ligada no Supabase. Desliga-a para entrar.");
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function loadUser(): Promise<AuthUser> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username,role").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    username: (profile?.username as string | undefined) ?? user.email?.split("@")[0] ?? "",
    role: profile?.role === "admin" ? "admin" : "user",
  };
}

export function onAuth(callback: () => void) {
  if (!supabase) return () => {};
  // setTimeout evita chamar o Supabase de dentro do próprio callback.
  const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(callback, 0); });
  return () => data.subscription.unsubscribe();
}
