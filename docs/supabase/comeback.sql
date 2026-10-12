-- BabyFlair : case « Comeback » sur un match (vainqueurs menés 0-4 qui gagnent 5-4). Sans effet sur les points.
alter table public.matches add column if not exists comeback boolean not null default false;
