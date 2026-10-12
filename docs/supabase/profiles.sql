-- BabyFlair : profils déclaratifs et journal des matchs. À exécuter après schema.sql et notifications.sql.
-- L'app envoie l'en-tête x-player-id (le profil choisi sur le téléphone). Un trigger s'en sert pour savoir qui a
-- saisi, modifié, supprimé ou rétabli un match, et l'inscrit dans match_events. Aucune écriture directe du journal
-- depuis le navigateur : seul le trigger y écrit.

alter table public.matches add column if not exists created_by uuid references public.players (id) on delete set null;
alter table public.matches add column if not exists updated_by uuid references public.players (id) on delete set null;

create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null check (action in ('created', 'updated', 'deleted', 'restored')),
  match_id uuid not null,
  actor_id uuid references public.players (id) on delete set null,
  before jsonb,
  after jsonb
);
create index if not exists match_events_at_idx on public.match_events (at desc);

alter table public.match_events enable row level security;
drop policy if exists office_events_read on public.match_events;
create policy office_events_read on public.match_events
  for select to anon, authenticated using (public.office_ok());

-- Profil déclaré par la requête (en-tête x-player-id), ou null s'il est absent, invalide ou inconnu.
create or replace function public.request_actor() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  raw text := current_setting('request.headers', true)::json ->> 'x-player-id';
  actor uuid;
begin
  if raw is null or raw = '' then return null; end if;
  begin
    actor := raw::uuid;
  exception when others then
    return null;
  end;
  if not exists (select 1 from public.players where id = actor) then return null; end if;
  return actor;
end;
$$;

create or replace function public.matches_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := public.request_actor();
  was_deleted boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, actor);
    select exists (select 1 from public.match_events where match_id = new.id and action = 'deleted') into was_deleted;
    insert into public.match_events (action, match_id, actor_id, after)
      values (case when was_deleted then 'restored' else 'created' end, new.id, actor, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    new.updated_by := coalesce(actor, new.updated_by);
    insert into public.match_events (action, match_id, actor_id, before, after)
      values ('updated', new.id, actor, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.match_events (action, match_id, actor_id, before) values ('deleted', old.id, actor, to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists matches_audit on public.matches;
create trigger matches_audit before insert or update or delete on public.matches
  for each row execute function public.matches_audit();
