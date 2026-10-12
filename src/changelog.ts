// Nouveautés : une entrée par mise en ligne, une ligne par changement. Ajouter la plus récente EN TÊTE ;
// l'onglet affiche une pastille tant que l'entrée la plus récente n'a pas été vue sur ce téléphone.
import type { Settings } from './types'

export type ChangelogEntry = { id: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
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
