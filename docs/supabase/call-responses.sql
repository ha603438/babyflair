-- BabyFlair : réponse à une proposition de baby (« Chauuud » = 'in', « Non je fais semblant de bosser » = 'out').
-- Seules les réponses 'in' occupent une des 4 places.
alter table public.call_players add column if not exists response text not null default 'in';
alter table public.call_players drop constraint if exists call_players_response_check;
alter table public.call_players add constraint call_players_response_check check (response in ('in', 'out'));
