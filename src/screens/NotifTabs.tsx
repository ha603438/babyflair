// Onglet de la cloche : « Nouveautés » (mises à jour de l'app), « Règlement » (règles du bureau, votées) et « Journal »
// (journal d'activité), ces deux derniers en mode partagé seulement.
import { SegmentedControl } from '../components/SegmentedControl'
import { pendingVotes, segmentLabel } from '../rules/rules'
import { useRules } from '../rules/useRules'
import { navigate } from '../router'
import { useAppState } from '../store'

type Section = 'nouveautes' | 'reglement' | 'journal'

export function NotifTabs({ current }: { current: Section }) {
  const { sync } = useAppState()
  const { rules, votes, playerId, now } = useRules()
  if (sync.mode !== 'shared') return null
  // « Règlement (2) »: the rules waiting for this phone's vote.
  const options = [
    { value: 'nouveautes', label: 'Nouveautés' },
    { value: 'reglement', label: segmentLabel(pendingVotes(rules, votes, playerId, now)) },
    { value: 'journal', label: 'Journal' },
  ] as const satisfies readonly { value: Section; label: string }[]
  return (
    <div className="content notif-tabs">
      <SegmentedControl options={options} value={current} onChange={(name) => navigate({ name })} aria-label="Section" />
    </div>
  )
}
