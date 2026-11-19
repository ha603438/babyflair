-- BabyFlair : règlement du bureau. Un joueur propose une règle (rules), chacun vote « d'accord » / « pas d'accord »
-- (rule_votes, un vote par joueur et par règle, modifiable à tout moment). À exécuter après notifications.sql.

create table if not exists public.rules (
  id uuid primary key,
  text text not null check (char_length(btrim(text)) between 3 and 280),
  created_by uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.rule_votes (
  rule_id uuid not null references public.rules (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  voted_at timestamptz not null default now(),
  primary key (rule_id, player_id)
);

alter table public.rules enable row level security;
alter table public.rule_votes enable row level security;

drop policy if exists office_rules on public.rules;
create policy office_rules on public.rules
  for all to anon, authenticated using (public.office_ok()) with check (public.office_ok());

drop policy if exists office_rule_votes on public.rule_votes;
create policy office_rule_votes on public.rule_votes
  for all to anon, authenticated using (public.office_ok()) with check (public.office_ok());
