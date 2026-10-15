// Onglet Stats : « Récap » (#/stats, par défaut), « Courbes » (#/courbes) et « Hall of Flair » (#/top), sur le modèle
// de NotifTabs (onglet de la cloche).
import { SegmentedControl } from '../components/SegmentedControl'
import { navigate } from '../router'

export type StatsSection = 'stats' | 'courbes' | 'top'

const OPTIONS = [
  { value: 'stats', label: 'Récap' },
  { value: 'courbes', label: 'Courbes' },
  { value: 'top', label: 'Hall of Flair' },
] as const satisfies readonly { value: StatsSection; label: string }[]

export function StatsTabs({ current }: { current: StatsSection }) {
  return (
    <div className="content stats-tabs">
      <SegmentedControl options={OPTIONS} value={current} onChange={(name) => navigate({ name })} aria-label="Stats" />
    </div>
  )
}
