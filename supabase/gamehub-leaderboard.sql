-- GameHub: classificação dos jogadores (só números agregados; não mostra que jogos cada pessoa joga).
create or replace function public.gh_leaderboard()
returns table (user_id uuid, plays bigint, games bigint, followers bigint, comments bigint, ratings bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce((select sum(ug.plays) from public.user_games ug where ug.user_id = p.id), 0)::bigint,
    (select count(*) from public.user_games ug where ug.user_id = p.id and ug.plays > 0),
    (select count(*) from public.follows f where f.followee_id = p.id),
    (select count(*) from public.comments c where c.user_id = p.id),
    (select count(*) from public.ratings r where r.user_id = p.id)
  from public.profiles p
  where coalesce(p.role, '') <> 'admin';
$$;
revoke all on function public.gh_leaderboard() from public;
grant execute on function public.gh_leaderboard() to anon, authenticated;
