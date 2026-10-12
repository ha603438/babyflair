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
