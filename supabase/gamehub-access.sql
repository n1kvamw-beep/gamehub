-- GameHub: visibilidade (público / família / privado), ROMs privadas e apagar contas.
-- Correr uma vez no Supabase > SQL Editor. É seguro repetir.

-- 1) Colunas
alter table public.profiles add column if not exists approved boolean not null default false;
alter table public.games    add column if not exists restricted boolean not null default false;
alter table public.games    add column if not exists visibility text;
update public.games set visibility = case when restricted then 'family' when is_public then 'public' else 'private' end
  where visibility is null;
alter table public.games alter column visibility set default 'private';
alter table public.games alter column visibility set not null;
alter table public.games drop constraint if exists games_visibility_check;
alter table public.games add constraint games_visibility_check check (visibility in ('public','family','private'));

-- 2) Funções de verificação
create or replace function public.gh_is_admin() returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.gh_is_approved() returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where id = auth.uid() and (approved or role = 'admin')) $$;

create or replace function public.gh_can_read_file(p_name text) returns boolean
language sql security definer set search_path = public stable
as $$ select public.gh_is_admin() or exists (
  select 1 from public.games g where g.file_path = p_name
  and (g.visibility = 'public' or (g.visibility = 'family' and public.gh_is_approved()))) $$;

grant execute on function public.gh_is_admin() to anon, authenticated;
grant execute on function public.gh_is_approved() to anon, authenticated;
grant execute on function public.gh_can_read_file(text) to anon, authenticated;

-- 3) Ninguém (exceto o admin) pode aprovar-se a si próprio nem mudar o papel
create or replace function public.gh_protect_profile() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.gh_is_admin() then
    new.approved := old.approved;
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists gh_protect_profile on public.profiles;
create trigger gh_protect_profile before update on public.profiles
for each row execute function public.gh_protect_profile();

drop policy if exists gh_admin_update_profiles on public.profiles;
create policy gh_admin_update_profiles on public.profiles for update
  using (public.gh_is_admin()) with check (public.gh_is_admin());

-- 4) Quem vê cada jogo: público = todos; família = aprovados; privado = só admin
drop policy if exists gh_rom_select on public.games;
drop policy if exists gh_vis_select on public.games;
drop policy if exists gh_vis_restrict on public.games;
create policy gh_vis_select on public.games for select
  using (visibility = 'public' or (visibility = 'family' and public.gh_is_approved()));
create policy gh_vis_restrict on public.games as restrictive for select
  using (visibility = 'public' or public.gh_is_admin() or (visibility = 'family' and public.gh_is_approved()));

-- 5) Bucket privado para ROMs/ISO
insert into storage.buckets (id, name, public)
values ('rom-files', 'rom-files', false)
on conflict (id) do update set public = false;

drop policy if exists gh_rom_read   on storage.objects;
drop policy if exists gh_rom_insert on storage.objects;
drop policy if exists gh_rom_update on storage.objects;
drop policy if exists gh_rom_delete on storage.objects;

create policy gh_rom_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'rom-files' and public.gh_can_read_file(name));
create policy gh_rom_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rom-files' and public.gh_is_admin());
create policy gh_rom_update on storage.objects for update to authenticated
  using (bucket_id = 'rom-files' and public.gh_is_admin());
create policy gh_rom_delete on storage.objects for delete to authenticated
  using (bucket_id = 'rom-files' and public.gh_is_admin());

-- 6) Apagar contas (só o admin; não apaga admins nem a própria conta)
create or replace function public.gh_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.gh_is_admin() then raise exception 'Só o administrador pode apagar contas.'; end if;
  if target = auth.uid() then raise exception 'Não podes apagar a tua própria conta.'; end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Não é possível apagar um administrador.';
  end if;
  begin delete from public.favorites  where user_id = target; exception when others then null; end;
  begin delete from public.follows    where follower_id = target or followee_id = target; exception when others then null; end;
  begin delete from public.user_games where user_id = target; exception when others then null; end;
  begin delete from public.comments   where user_id = target; exception when others then null; end;
  begin delete from public.ratings    where user_id = target; exception when others then null; end;
  delete from public.profiles where id = target;
  delete from auth.users where id = target;
end $$;

revoke all on function public.gh_delete_user(uuid) from public, anon;
grant execute on function public.gh_delete_user(uuid) to authenticated;
