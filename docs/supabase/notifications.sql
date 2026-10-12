-- BabyFlair : appels à jouer (« Proposer un baby ») et abonnements aux notifications. À exécuter après schema.sql.

create table if not exists public.calls (
  id uuid primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid not null references public.players (id) on delete cascade,
  closed_at timestamptz
);

create table if not exists public.call_players (
  call_id uuid not null references public.calls (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (call_id, player_id)
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.calls enable row level security;
alter table public.call_players enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists office_calls on public.calls;
create policy office_calls on public.calls
  for all to anon, authenticated using (public.office_ok()) with check (public.office_ok());

drop policy if exists office_call_players on public.call_players;
create policy office_call_players on public.call_players
  for all to anon, authenticated using (public.office_ok()) with check (public.office_ok());

-- Les téléphones créent et retirent leur propre abonnement ; seule la fonction serveur (service role) les lit.
drop policy if exists office_push_write on public.push_subscriptions;
create policy office_push_write on public.push_subscriptions
  for insert to anon, authenticated with check (public.office_ok());
drop policy if exists office_push_delete on public.push_subscriptions;
create policy office_push_delete on public.push_subscriptions
  for delete to anon, authenticated using (public.office_ok());
drop policy if exists office_push_update on public.push_subscriptions;
create policy office_push_update on public.push_subscriptions
  for update to anon, authenticated using (public.office_ok()) with check (public.office_ok());

alter publication supabase_realtime add table public.calls, public.call_players;

-- Abonnement / désabonnement passant par des fonctions : la table n'a pas de règle de lecture (personne ne peut lister
-- les abonnements), or un upsert ou un delete filtré en ont besoin. Ces fonctions vérifient le code du bureau, puis
-- écrivent avec les droits du propriétaire.
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_player_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.office_ok() then return false; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, player_id)
    values (p_endpoint, p_p256dh, p_auth, p_player_id)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, player_id = excluded.player_id;
  return true;
end;
$$;

create or replace function public.unregister_push(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.office_ok() then return false; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  return true;
end;
$$;

grant execute on function public.register_push(text, text, text, uuid) to anon, authenticated;
grant execute on function public.unregister_push(text) to anon, authenticated;
