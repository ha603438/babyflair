-- BabyFlair : annonces d'écart. Avant le match, chaque équipe peut annoncer « on gagne d'au moins N buts »
-- (bet_a pour les Blancs, bet_b pour les Noirs) ; null = pas d'annonce.
alter table public.matches add column if not exists bet_a smallint;
alter table public.matches add column if not exists bet_b smallint;
alter table public.matches drop constraint if exists matches_bet_a_check;
alter table public.matches add constraint matches_bet_a_check check (bet_a is null or (bet_a >= 1 and bet_a <= target));
alter table public.matches drop constraint if exists matches_bet_b_check;
alter table public.matches add constraint matches_bet_b_check check (bet_b is null or (bet_b >= 1 and bet_b <= target));
