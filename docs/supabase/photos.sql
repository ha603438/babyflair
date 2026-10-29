-- BabyFlair : photo de profil des joueurs (lien vers la photo Slack, 192 px). Vide = initiales.
alter table public.players add column if not exists photo_url text;
alter table public.players drop constraint if exists players_photo_url_check;
alter table public.players add constraint players_photo_url_check
  check (photo_url is null or (photo_url like 'https://%' and char_length(photo_url) <= 500));
