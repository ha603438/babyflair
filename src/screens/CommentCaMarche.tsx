// « Comment ça marche » (spec §3.9): static rules page. The copy is the final rating rule set (it supersedes the
// shorter spec §9 texts where they differ); the box shows the engine's real why-line format.

/** U+202F: narrow no-break space before « % » and as the thousands separator (spec §7). */
const NNBSP = '\u202F'

type Section = { title: string; text: string; box?: string }

const WHY_LINE = `Victoire 10-8 (en 10) · 50${NNBSP}% de chances · marge ×1,2 · part 55${NNBSP}% → +10,6`

const SECTIONS: Section[] = [
  {
    title: 'Le classement',
    text:
      `Tout le monde démarre à 1${NNBSP}000 points, invités compris : seul l'écart entre deux joueurs compte, ` +
      "pas le chiffre lui-même. Après chaque match, les gagnants prennent des points aux perdants. Le classement " +
      'se lit par points, puis par nombre de matchs, puis par prénom (sans tenir compte des majuscules ni des ' +
      'accents).',
  },
  {
    title: 'Les points',
    text:
      'Plus le résultat était improbable, plus ça bouge : 16 points de base pour un match à 50/50. Chaque but ' +
      `d'écart ajoute 10${NNBSP}% : un 10-9 compte ×1,1, un 10-5 ×1,5, un 10-0 ×2 ; un 5-0 compte ×1,5, parce ` +
      "qu'une partie en 5 en dit moins qu'une partie en 10. Gagner fait toujours monter, perdre fait toujours " +
      'descendre.',
    box: WHY_LINE,
  },
  {
    title: 'Les chances de gagner',
    text:
      "La force d'une équipe est la moyenne de ses deux joueurs, ou ton classement tout seul en 1 contre 1 ; " +
      `les deux formats comptent dans le même classement. En partie en 10, 100 points d'écart donnent environ ` +
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
      "Ton premier match compte ×3, puis de moins en moins, jusqu'à ton 21e match où tu bouges comme tout le " +
      'monde. Avant ton 10e match, tu portes un « ? » et tu apparais sous le classement, dans la section ' +
      'Débutants.',
  },
  {
    title: 'Avant et arrière',
    text:
      'En 2 contre 2, le premier joueur de chaque équipe est l’arrière, le second l’avant : le bouton « Inverser » ' +
      'les échange avant d’enregistrer. Ça ne change rien aux points, mais ça permet de voir qui est le meilleur à ' +
      'chaque poste, et si les Blancs ou les Noirs gagnent plus souvent.',
  },
  {
    title: 'Inactifs',
    text:
      'Sans match pendant 30 jours, tu passes dans la section Inactifs, sans perdre aucun point. Un match ' +
      'suffit pour revenir.',
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
    title: 'Modifier ou supprimer un match',
    text:
      "N'importe qui peut corriger ou supprimer n'importe quel match. Tout le classement est alors recalculé " +
      "depuis le tout premier match, et un match corrigé garde sa place dans l'historique.",
  },
  {
    title: 'Proposer un baby',
    text:
      'Depuis le classement, « Proposer un baby » envoie une notification à tous les téléphones qui ont activé ' +
      'les notifications dans Réglages. Chacun dit s’il est chaud ; dès que 4 joueurs sont là, « Former les ' +
      'équipes » compose les équipes les plus équilibrées selon le classement, tire les postes et les couleurs au ' +
      'sort, et ouvre le match. Sans 4 joueurs au bout de 5 minutes, l’appel est annulé.',
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
