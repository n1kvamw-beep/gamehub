-- GameHub: repor a senha de um utilizador a partir do painel de admin.
-- Correr DEPOIS de gamehub-access.sql, no Supabase > SQL Editor. É seguro repetir.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.gh_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions
as $$
begin
  if not public.gh_is_admin() then raise exception 'Só o administrador pode repor senhas.'; end if;
  if length(new_password) < 8 then raise exception 'A senha deve ter pelo menos 8 caracteres.'; end if;
  if target <> auth.uid() and exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Não é possível repor a senha de outro administrador.';
  end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
  if not found then raise exception 'Utilizador não encontrado.'; end if;
end $$;

revoke all on function public.gh_set_password(uuid, text) from public, anon;
grant execute on function public.gh_set_password(uuid, text) to authenticated;
