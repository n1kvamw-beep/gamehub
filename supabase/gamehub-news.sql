-- GameHub: novidades do site + notificações push. Correr uma vez no Supabase > SQL Editor. É seguro repetir.

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'outro' check (kind in ('jogo','mecanica','bug','outro')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 500),
  game_id uuid,
  created_at timestamptz not null default now()
);
alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to anon, authenticated using (true);
drop policy if exists news_admin on public.news;
create policy news_admin on public.news for all to authenticated using (public.gh_is_admin()) with check (public.gh_is_admin());

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for select to authenticated using (user_id = auth.uid() or public.gh_is_admin());
drop policy if exists push_del on public.push_subs;
create policy push_del on public.push_subs for delete to authenticated using (user_id = auth.uid() or public.gh_is_admin());

-- Guardar / remover a subscrição do próprio utilizador (um aparelho pode mudar de conta).
create or replace function public.gh_save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  insert into public.push_subs(endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
create or replace function public.gh_drop_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;
grant execute on function public.gh_save_push(text, text, text) to authenticated;
grant execute on function public.gh_drop_push(text) to authenticated;
