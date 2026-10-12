# BabyFlair

Classement Elo du baby-foot du bureau. Application web mobile (PWA) en TypeScript, React et Vite, 100 % locale :
aucun serveur, aucune donnée ne quitte l'appareil.

## Démarrer

```sh
npm install
npm run dev -- --host   # puis ouvrir l'URL affichée depuis un téléphone sur le même Wi-Fi
```

Autres commandes : `npm run build` (dossier `dist/` à servir en statique), `npm run preview`, `npm test`, `npm run lint`,
`npm run generate-icons` (régénère les icônes PWA à partir de `public/icon.svg`).

## Installer sur un téléphone

Ouvrir l'URL dans Safari (iOS) ou Chrome (Android), puis « Ajouter à l'écran d'accueil ». L'app s'ouvre alors en plein
écran et fonctionne hors ligne.

Attention iOS : si l'app n'est **pas** installée sur l'écran d'accueil, Safari peut effacer les données d'un site non
visité pendant 7 jours. Installer l'app évite ce problème. Dans tous les cas, exporter régulièrement depuis Réglages.

## Comment ça marche

- Les joueurs, les matchs et les réglages sont stockés dans le navigateur (clé `babyflair.v1` de `localStorage`).
- Le classement est recalculé à chaque fois à partir de l'historique complet des matchs (`src/rating/`), ce qui permet de
  corriger ou supprimer n'importe quel match sans incohérence.
- Les règles du classement (BabyElo v2 : moyenne d'équipe, multiplicateur d'écart de score, part 55/45 entre
  coéquipiers, multiplicateur débutant) sont décrites dans l'écran « Comment ça marche » de l'app et implémentées dans
  `src/rating/engine.ts`, vérifié par `src/rating/test-vectors.json`.
- Export / import JSON depuis Réglages : le fichier contient tout (joueurs, matchs, réglages) et servira à migrer vers un
  petit serveur local quand plusieurs téléphones devront saisir des matchs.

## Mode partagé

Par défaut l'app est locale. Pour que plusieurs téléphones partagent le même classement :

1. Créer un projet Supabase (offre gratuite) et exécuter `docs/supabase/schema.sql` dans son éditeur SQL, après avoir
   remplacé `OFFICE_CODE` par la phrase secrète du bureau.
2. Dans le dépôt GitHub, Settings › Secrets and variables › Actions › Variables : créer `VITE_SUPABASE_URL` (URL du
   projet) et `VITE_SUPABASE_ANON_KEY` (clé « anon », publique par construction). Le workflow Pages les injecte au
   build ; en local, les mettre dans un fichier `.env.development.local` (voir `.env.example` ; ce nom évite de les charger dans les tests).
3. Donner le code du bureau aux collègues : à l'ouverture, l'app le demande une fois par téléphone et le mémorise.

Fonctionnement : joueurs et matchs sont un cache de la base (rechargé à l'ouverture, au retour sur l'app et toutes
les 20 s) ; chaque saisie est appliquée localement puis envoyée au serveur, qui a le dernier mot. Les réglages restent
sur le téléphone. « Tout effacer » devient « Déconnecter cet appareil » et ne touche pas au serveur ; l'import remplace
les données du serveur. Sans les deux variables, rien ne change : l'app reste 100 % locale.

## Structure

```
src/
  rating/      moteur de classement (pur) + adaptateur + hook useReplay
  store/       état de l'app (reducer, persistance localStorage, brouillon de match, toasts)
  screens/     les neuf écrans (classement, match, historique, détail, joueurs, joueur, réglages, règles)
  components/  composants d'interface génériques
  styles/      jetons de design et feuilles de style par groupe
  stats.ts     statistiques dérivées pour l'interface (série, partenaire préféré, validation d'import)
  format.ts    formatage français (nombres, dates, deltas)
  router.ts    routeur par hash (#/…)
```
