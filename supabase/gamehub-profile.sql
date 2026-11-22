-- GameHub: perfil personalizável (avatar, banner, nome, sobre mim, cor, estado).
-- Correr uma vez no Supabase > SQL Editor. É seguro repetir.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists status_text text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists banner_path text;
alter table public.profiles add column if not exists accent_color text;

alter table public.profiles drop constraint if exists profiles_custom_check;
alter table public.profiles add constraint profiles_custom_check check (
  (display_name is null or char_length(display_name) <= 32) and
  (pronouns is null or char_length(pronouns) <= 20) and
  (status_text is null or char_length(status_text) <= 60) and
  (bio is null or char_length(bio) <= 300) and
  (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$') and
  (avatar_path is null or (avatar_path like 'avatars/%' and char_length(avatar_path) <= 200)) and
  (banner_path is null or (banner_path like 'avatars/%' and char_length(banner_path) <= 200))
);

-- Funções usadas para impedir que alguém mude o próprio papel (repetidas aqui por segurança)
create or replace function public.gh_is_admin() returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
grant execute on function public.gh_is_admin() to anon, authenticated;

alter table public.profiles add column if not exists approved boolean not null default false;

create or replace function public.gh_protect_profile() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.gh_is_admin() then
    new.approved := old.approved;
    new.role := old.role;
    new.username := old.username;
  end if;
  return new;
end $$;
drop trigger if exists gh_protect_profile on public.profiles;
create trigger gh_protect_profile before update on public.profiles
for each row execute function public.gh_protect_profile();

-- Cada pessoa edita só o seu próprio perfil; o perfil é legível por todos
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles for select using (true);
