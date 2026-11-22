-- GameHub: registo diário de partidas para os gráficos do admin.
-- Correr DEPOIS de gamehub-access.sql, no Supabase > SQL Editor. É seguro repetir.

create table if not exists public.play_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists play_events_created_idx on public.play_events (created_at);

alter table public.play_events enable row level security;

drop policy if exists gh_events_insert on public.play_events;
drop policy if exists gh_events_select on public.play_events;

-- Qualquer pessoa regista a sua própria partida; só o admin lê.
create policy gh_events_insert on public.play_events for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid());
create policy gh_events_select on public.play_events for select to authenticated
  using (public.gh_is_admin());
