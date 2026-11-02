// « Comment ça marche » (spec §3.9): static rules page. The copy is the final rating rule set (it supersedes the
// shorter spec §9 texts where they differ); the box shows the engine's real why-line format.

/** U+202F: narrow no-break space before « % » and as the thousands separator (spec §7). */
const NNBSP = '\u202F'

type Section = { title: string; text: string; box?: string }

const WHY_LINE = `Victoire 10-8 (en 10) · 50${NNBSP}% de chances · marge ×1,2 · part 55${NNBSP}% → +10,6`

/** The engine's why line of the « Annonces » example: equal teams, the Blancs announce +4 and win 10-5. */
export const BET_WHY_LINE =
  `Victoire 10-5 (en 10) · 50${NNBSP}% de chances · marge ×1,5 · part 50${NNBSP}% · ` +
  `annonce +4 réussie (23${NNBSP}% de chances) +12,4 → +24,4`

const SECTIONS: Section[] = [
  {
    title: 'Le classement',
    text:
      `Dans chaque classement, tout le monde démarre à 1${NNBSP}000 points, invités compris : seul l'écart entre ` +
      "deux joueurs compte, pas le chiffre lui-même. Après chaque match, les gagnants prennent des points aux " +
      'perdants. Le classement se lit par points, puis par nombre de matchs, puis par prénom (sans tenir compte des ' +
      'majuscules ni des accents).',
  },
  {
    title: 'Trois classements séparés',
    text:
      `Trois onglets, trois classements qui ne se mélangent pas, chacun recalculé depuis le tout premier match avec ` +
      `ses seuls matchs. «${NNBSP}2V2 mixte${NNBSP}», le classement principal, note chaque joueur sur les matchs ` +
      `en 2 contre 2, quel que soit son coéquipier${NNBSP}; on y est classé après 10 matchs. ` +
      `«${NNBSP}Équipes${NNBSP}» note chaque duo comme une seule équipe, avec ses propres points. ` +
      `«${NNBSP}1V1${NNBSP}» ne compte que les matchs en 1 contre 1. Dans ces deux-là, on est classé après 3 ` +
      `matchs. Un match en 1 contre 1 ne compte donc que pour le 1V1${NNBSP}: il ne change rien en 2V2 mixte, et ` +
      `un match en 2 contre 2 ne change rien en 1V1.`,
  },
  {
    title: 'Les points',
    text:
      'Plus le résultat était improbable, plus ça bouge : 16 points de base pour un match à 50/50. Chaque but ' +
      `d'écart ajoute 10${NNBSP}% : un 10-9 compte ×1,1, un 10-5 ×1,5, un 10-0 ×2 ; un 5-0 compte ×1,5, parce ` +
      "qu'une partie en 5 en dit moins qu'une partie en 10. Gagner fait toujours monter, perdre fait toujours " +
      'descendre, annonces comprises.',
    box: WHY_LINE,
  },
  {
    title: 'Les chances de gagner',
    text:
      "La force d'une équipe est la moyenne des points 2V2 mixte de ses deux joueurs ; en 1 contre 1, ce sont " +
      `tes points 1V1. En partie en 10, 100 points d'écart donnent environ ` +
      `64${NNBSP}% de chances, 200 points 76${NNBSP}%, 400 points 91${NNBSP}% ; en partie en 5 le hasard pèse ` +
      `plus, donc 60${NNBSP}%, 69${NNBSP}% et 83${NNBSP}%.`,
  },
  {
    title: "Pourquoi mon coéquipier n'a pas gagné pareil ?",
    text:
      'Entre coéquipiers, les points se partagent au plus 55/45 : la plus grosse part va à celui pour qui le ' +
      "résultat est la plus grande surprise, c'est-à-dire le moins bien classé quand on gagne et le mieux " +
      "classé quand on perd. À niveau égal, c'est moitié-moitié.",
  },
  {
    title: 'Débutants',
    text:
      "Dans chaque classement, ton premier match compte ×3, puis de moins en moins, jusqu'à ton 21e match où tu " +
      'bouges comme tout le monde. En 2V2 mixte, avant ton 10e match en 2 contre 2, tu portes un « ? » et tu ' +
      'apparais sous le classement, dans la section « Pas encore classés » ; en Équipes et en 1V1, 3 matchs ' +
      'suffisent pour être classé.',
  },
  {
    title: 'Avant et arrière',
    text:
      'En 2 contre 2, le premier joueur de chaque équipe est l’arrière, le second l’avant : le bouton « Inverser » ' +
      'les échange avant d’enregistrer. Ça ne change rien aux points, mais ça permet de voir qui est le meilleur à ' +
      'chaque poste, et si les Blancs ou les Noirs gagnent plus souvent.',
  },
  {
    title: 'Fanny et comeback',
    text:
      "Un fanny, c'est gagner sans encaisser un seul but (5-0). Un comeback, c'est gagner 5-4 après avoir été " +
      "mené 0-4 : coche la case sous le score au moment de l'enregistrer. Les deux comptent un peu plus : ×1,2 pour un " +
      'fanny, ×1,25 pour un comeback, aussi bien pour les gagnants que pour les perdants.',
  },
  {
    title: 'Annonces',
    text:
      `Avant de jouer, chaque équipe peut annoncer «${NNBSP}on gagne d’au moins N buts${NNBSP}» (2 au minimum, ` +
      `+1 voudrait juste dire «${NNBSP}on gagne${NNBSP}»)${NNBSP}: sur la ` +
      `feuille de match, «${NNBSP}🎯 Annoncer un écart${NNBSP}» sous son équipe (couilles sur la table, donc). Tout ` +
      `dépend des chances de réussir, calculées d’après le classement du match (1V1 en 1 contre 1, 2V2 mixte en 2 ` +
      `contre 2). Réussie (victoire avec au moins N buts d’écart)${NNBSP}: chacun de ses joueurs gagne en plus 16 × ` +
      `les chances de la rater, donc une annonce osée rapporte gros. Victoire trop courte${NNBSP}: pas de ` +
      `pénalité, la victoire rapporte juste un peu moins, 20${NNBSP}% de ses points de base en moins par but ` +
      `manquant (10${NNBSP}% dans une partie en 10)${NNBSP}; une victoire ne fait jamais perdre de points. ` +
      `Défaite${NNBSP}: chacun perd en plus 16 × les chances de la réussir. L’équipe d’en face n’est pas touchée, ` +
      `et le bonus ou la pénalité s’ajoute tel quel (pas de partage entre coéquipiers, ni ×débutant). ` +
      `Exemple${NNBSP}: deux équipes de même niveau en 10, les Blancs annoncent +4, soit 23${NNBSP}% de chances. ` +
      `Gagné 10-6 ou mieux${NNBSP}: +12,4 chacun en plus${NNBSP}; gagné 10-8 (2 buts manquants)${NNBSP}: +7,7 au ` +
      `lieu de +9,6${NNBSP}; perdu${NNBSP}: −3,6 chacun en plus. Le détail du calcul est dans chaque match de ` +
      `l’historique. Les stats des annonces sont sur la carte «${NNBSP}🎯 Annonces${NNBSP}» des fiches joueur et ` +
      `duo, dans la section «${NNBSP}Couilles sur la table${NNBSP}» du Hall of Flair et dans l’«${NNBSP}Annonce du ` +
      `jour${NNBSP}» du Récap.`,
    box: BET_WHY_LINE,
  },
  {
    title: 'Partis prendre l’flair',
    text:
      'Sans match pendant 30 jours dans un classement, tu y pars prendre l’flair (la section des inactifs), sans ' +
      'perdre aucun point. Un match suffit pour revenir.',
  },
  {
    title: 'Égalités',
    text: "À points égaux, celui qui a joué le plus de matchs est devant, puis l'ordre alphabétique.",
  },
  {
    title: 'Le petit nombre à droite',
    text: "Dans le classement, c'est ce que tu as gagné ou perdu sur les 7 derniers jours.",
  },
  {
    title: "L'onglet Stats",
    text:
      `Toutes les stats sont dans l’onglet Stats. «${NNBSP}Récap${NNBSP}» résume les derniers jours de ` +
      `matchs${NNBSP}: joueur et duo du jour, hold-up, fanny, comebacks, nouveau n°1… «${NNBSP}Courbes${NNBSP}» ` +
      `trace les points de chacun, match après match, en 2V2 mixte, en Équipes ou en 1V1${NNBSP}: touche les noms ` +
      'pour comparer jusqu’à 8 joueurs, et glisse le doigt sur le graphique pour lire chaque match. ' +
      `«${NNBSP}Hall of Flair${NNBSP}» rassemble les records de tous les temps.`,
  },
  {
    title: 'Les joueurs',
    text:
      'Pour ajouter un collègue ou retrouver la liste de tous les joueurs, passe par Réglages › Joueurs (la roue ' +
      'crantée en haut de l’onglet Stats).',
  },
  {
    title: 'Modifier ou supprimer un match',
    text:
      "N'importe qui peut corriger ou supprimer n'importe quel match. Les classements sont alors recalculés " +
      "depuis le tout premier match, et un match corrigé garde sa place dans l'historique.",
  },
  {
    title: 'Ton profil',
    text:
      'Tu le choisis au premier lancement, dans la liste des joueurs (ou tu te crées si tu n’y es pas). Il signe ' +
      'les matchs que tu saisis, modifies ou supprimes, et tes réponses aux appels : Réglages › Journal des ' +
      'modifications dit qui a fait quoi. En mode invité, tu vois tout mais tu ne modifies rien. Tu peux en ' +
      'changer dans Réglages › Mon profil.',
  },
  {
    title: 'Je flaire un baby',
    text:
      'Depuis le classement, « Je flaire un baby » envoie, au nom de ton profil, une notification à tous les ' +
      'téléphones qui ont activé les notifications dans Réglages. Chacun répond « Chauuud 🔥 » ou « Non je fais ' +
      'semblant de bosser » ; dès que 4 joueurs sont là, « Former les équipes » compose les équipes les plus ' +
      'équilibrées selon le classement 2V2 mixte, tire les postes et les couleurs au sort, et ouvre le match. ' +
      'L’appel liste les « Chauds », les « Pas chauds » et ceux qui n’ont pas encore répondu, et chacun peut ' +
      'changer d’avis tant qu’il reste ouvert. Sans 4 joueurs au bout de 5 minutes, l’appel est annulé.',
  },
  {
    title: 'Tes données',
    text: 'Tout reste sur cet appareil. Exporte régulièrement depuis Réglages pour garder une copie.',
  },
]

export function CommentCaMarche() {
  return (
    <div className="content">
      <article className="rules">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rules-section">
            <h2 className="rules-h">{section.title}</h2>
            <p>{section.text}</p>
            {section.box !== undefined && <p className="rules-box">{section.box}</p>}
          </section>
        ))}
      </article>
    </div>
  )
}
