-- GameHub: acesso restrito às ROMs/ISO (correr uma vez no Supabase > SQL Editor)

-- 1) Colunas novas
alter table public.profiles add column if not exists approved boolean not null default false;
alter table public.games    add column if not exists restricted boolean not null default false;

-- 2) Funções de verificação
create or replace function public.gh_is_admin() returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.gh_is_approved() returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.profiles where id = auth.uid() and (approved or role = 'admin')) $$;

grant execute on function public.gh_is_admin() to authenticated;
grant execute on function public.gh_is_approved() to authenticated;

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

-- 4) O admin pode aprovar utilizadores; aprovados veem as linhas restritas
drop policy if exists gh_admin_update_profiles on public.profiles;
create policy gh_admin_update_profiles on public.profiles for update
  using (public.gh_is_admin()) with check (public.gh_is_admin());

drop policy if exists gh_rom_select on public.games;
create policy gh_rom_select on public.games for select
  using (restricted and public.gh_is_approved());

-- 5) Bucket privado para os ficheiros das ROMs/ISO
insert into storage.buckets (id, name, public)
values ('rom-files', 'rom-files', false)
on conflict (id) do update set public = false;

drop policy if exists gh_rom_read   on storage.objects;
drop policy if exists gh_rom_insert on storage.objects;
drop policy if exists gh_rom_update on storage.objects;
drop policy if exists gh_rom_delete on storage.objects;

create policy gh_rom_read on storage.objects for select to authenticated
  using (bucket_id = 'rom-files' and public.gh_is_approved());
create policy gh_rom_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rom-files' and public.gh_is_admin());
create policy gh_rom_update on storage.objects for update to authenticated
  using (bucket_id = 'rom-files' and public.gh_is_admin());
create policy gh_rom_delete on storage.objects for delete to authenticated
  using (bucket_id = 'rom-files' and public.gh_is_admin());
