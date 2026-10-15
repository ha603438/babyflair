// Nouveautés : une entrée par mise en ligne, une ligne par changement. Ajouter la plus récente EN TÊTE ;
// l'onglet affiche une pastille tant que l'entrée la plus récente n'a pas été vue sur ce téléphone.
import type { Settings } from './types'

export type ChangelogEntry = { id: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-15-8',
    date: '2026-10-15',
    title: 'Du flair partout',
    items: [
      '«\u202FProposer un baby\u202F» devient «\u202FJe flaire un baby\u202F».',
      'Le Flair-o-mètre donne les chances de chaque équipe avant de valider un match.',
      'Les inactifs sont «\u202FPartis prendre l’flair\u202F», les règles s’appellent «\u202FFlair Play\u202F» et le duo le plus fidèle a «\u202FUn flair de famille\u202F».',
    ],
  },
  {
    id: '2026-10-15-7',
    date: '2026-10-15',
    title: 'Onglet Stats',
    items: [
      'Nouvel onglet Stats\u202F: «\u202FRécap\u202F» des derniers jours, «\u202FCourbes\u202F» ' +
        'et «\u202FHall of Flair\u202F».',
      'Les joueurs passent dans Réglages\u202F: «\u202FAjouter un joueur\u202F» et «\u202FTous les joueurs\u202F».',
      'Le classement s’allège\u202F: il ne garde que «\u202FProposer un baby\u202F».',
    ],
  },
  {
    id: '2026-10-15-6',
    date: '2026-10-15',
    title: 'Le Château de cartes',
    items: ['Nouveau record au Hall of Flair\u202F: le plus de comebacks subis (mené 4-0, perdu 4-5).'],
  },
  {
    id: '2026-10-15-5',
    date: '2026-10-15',
    title: 'Hall of Flair',
    items: [
      '«\u202FTop stats\u202F» devient le «\u202FHall of Flair\u202F»\u202F: le Sniper, le Mur, le Chat noir, le Hold-up…',
      'Tous les ex æquo d’un podium sont affichés, avec le même rang.',
      'Nouveau record «\u202FLe Clasico\u202F»\u202F: les deux duos qui se sont le plus affrontés.',
    ],
  },
  {
    id: '2026-10-15-4',
    date: '2026-10-15',
    title: 'Hall of Flair',
    items: [
      '«\u202F🏅 Hall of Flair\u202F» sous le classement\u202F: les records de tous les temps, invités compris.',
      'Meilleurs avant et arrière, séries, fanny et comebacks, exploits, records de points, duos et rivalités.',
    ],
  },
  {
    id: '2026-10-15-3',
    date: '2026-10-15',
    title: 'Trois classements',
    items: [
      'Le classement a trois onglets : « Mixte » (le classement principal), « 2V2 » (les duos) et « 1V1 ».',
      'Chaque duo a sa fiche : points, positions, fanny et comebacks, bête noire, derniers matchs.',
      'Duos et 1V1 : classé après 3 matchs.',
    ],
  },
  {
    id: '2026-10-15-2',
    date: '2026-10-15',
    title: 'Filtres dans l’historique',
    items: ['L’historique se filtre par format (« 2V2 » ou « 1V1 ») et par joueur.'],
  },
  {
    id: '2026-10-15-1',
    date: '2026-10-15',
    title: 'Qui est chaud ?',
    items: [
      'L’appel montre qui est chaud, qui ne l’est pas et qui n’a pas encore répondu.',
      'Tu peux changer d’avis tant que l’appel est ouvert : « Proposer un baby » le rouvre.',
    ],
  },
  {
    id: '2026-10-13-4',
    date: '2026-10-13',
    title: 'Bonus fanny et comeback',
    items: [
      'Un fanny compte ×1,2 et un comeback ×1,25 : les gagnants prennent plus, les perdants perdent plus.',
      'Le classement est recalculé sur tout l’historique.',
    ],
  },
  {
    id: '2026-10-13-3',
    date: '2026-10-13',
    title: 'Classement allégé',
    items: ['Le rappel d’export disparaît du classement : l’export reste dans Réglages.'],
  },
  {
    id: '2026-10-13-2',
    date: '2026-10-13',
    title: 'Courbes du classement',
    items: [
      "« 📈 Courbes » sous le classement : l'évolution des points de chacun, match après match.",
      'Touche les noms pour afficher ou masquer une courbe (8 maximum) ; glisse le doigt pour lire chaque match.',
    ],
  },
  {
    id: '2026-10-13-1',
    date: '2026-10-13',
    title: "Journal d'activité",
    items: [
      'Mises à jour fiables : un bandeau « Nouvelle version disponible » apparaît tout seul, et le double-tap sur le blason détecte enfin les nouvelles versions.',
      "Sous la cloche, l'onglet « Journal d'activité » trace qui a modifié, supprimé ou rétabli un match.",
      'Le filtre « Tout » ajoute les matchs saisis.',
    ],
  },
  {
    id: '2026-10-12-8',
    date: '2026-10-12',
    title: 'Fanny et comebacks',
    items: [
      'Case « Comeback » sous le score quand les vainqueurs gagnent 5-4 après avoir été menés 0-4.',
      'Pastilles fanny et comeback dans l’historique, et leur bilan sur la page de chaque joueur.',
    ],
  },
  {
    id: '2026-10-12-7',
    date: '2026-10-12',
    title: 'Nouveau match en un tap',
    items: [
      'Historique plus lisible : Blancs à gauche, Noirs à droite, chaque joueur en entier avec ses points.',
      'Bouton « ＋ Match » en haut de chaque onglet.', '« Proposer un baby » devient un lien plus discret sous le classement.'],
  },
  {
    id: '2026-10-12-6',
    date: '2026-10-12',
    title: 'Meilleur allié et némésis',
    items: ['Sur la page de chaque joueur : son meilleur allié et sa némésis (à partir de 3 matchs ensemble ou face à face).'],
  },
  {
    id: '2026-10-12-5',
    date: '2026-10-12',
    title: 'Profils',
    items: [
      'Choisis ton profil au premier lancement : il signe tes matchs et tes réponses aux appels.',
      'Mode invité pour tout voir sans rien modifier ; Réglages › Journal des modifications dit qui a fait quoi.',
      '« Proposer un baby » sans choisir son nom, et on répond « Chauuud 🔥 » en un geste.',
    ],
  },
  {
    id: '2026-10-12-4',
    date: '2026-10-12',
    title: 'Proposer un baby',
    items: [
      'Un appel sans 4 joueurs au bout de 5 minutes est annulé.',
      'Celui qui propose le baby ne reçoit plus sa propre notification.',
      '« Proposer un baby » sur le classement : une notification part sur tous les téléphones abonnés.',
      'Chacun répond « Je suis chaud » ; à 4, « Former les équipes » compose des équipes équilibrées et ouvre le match.',
      'Réglages › Notifications pour recevoir les appels (sur iOS, app installée sur l’écran d’accueil).',
    ],
  },
  {
    id: '2026-10-12-3',
    date: '2026-10-12',
    title: 'Mises à jour et nouveautés',
    items: [
      'Après un match, « Match suivant : les gagnants restent » pré-remplit l’équipe gagnante.',
      'Avant et arrière dans chaque équipe, bilan par poste sur la page joueur, victoires Blancs contre Noirs sur le classement.',
      'Partie en 5 par défaut.',
      'Saisie du score simplifiée : un sélecteur par équipe, un seul geste.',
      'Les équipes deviennent Blancs et Noirs.',
      'Onglet Nouveautés : la liste des mises à jour de l’app.',
      'En-tête avec le blason et le nom BabyFlair sur chaque onglet.',
      'Double-tap sur le blason pour forcer la mise à jour de l’app.',
      'Date de version affichée dans Réglages.',
      'Icône d’app corrigée (logo plein cadre).',
    ],
  },
  {
    id: '2026-10-12-2',
    date: '2026-10-12',
    title: 'Identité BabyFlair',
    items: ['Logo et couleurs bleu, blanc, rouge dans toute l’app.', 'Blason dans l’en-tête de chaque onglet.'],
  },
  {
    id: '2026-10-12-1',
    date: '2026-10-12',
    title: 'Classement partagé',
    items: [
      'Les joueurs et les matchs sont partagés entre tous les téléphones.',
      'Code du bureau demandé une fois par téléphone.',
      'Synchronisation automatique à l’ouverture et toutes les 20 secondes.',
    ],
  },
  {
    id: '2026-10-11-1',
    date: '2026-10-11',
    title: 'Première version',
    items: ['Saisie des matchs 1v1 et 2v2, en 5 ou en 10.', 'Classement BabyElo, historique, pages joueur, export JSON.'],
  },
]

/** Entries newer than the last one seen on this phone (all of them before the first visit). */
export function unseenEntries(settings: Pick<Settings, 'seenChangelogId'>, entries: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  const seen = settings.seenChangelogId
  if (seen === undefined) return entries
  const index = entries.findIndex((entry) => entry.id === seen)
  if (index === -1) return entries
  return entries.slice(0, index)
}

export function latestChangelogId(entries: ChangelogEntry[] = CHANGELOG): string | undefined {
  return entries[0]?.id
}
