// Onglet de la cloche : « Nouveautés » (mises à jour de l'app) et « Journal d'activité » (mode partagé).
import { SegmentedControl } from '../components/SegmentedControl'
import { navigate } from '../router'
import { useAppState } from '../store'

type Section = 'nouveautes' | 'journal'

const OPTIONS = [
  { value: 'nouveautes', label: 'Nouveautés' },
  { value: 'journal', label: "Journal d'activité" },
] as const satisfies readonly { value: Section; label: string }[]

export function NotifTabs({ current }: { current: Section }) {
  const { sync } = useAppState()
  if (sync.mode !== 'shared') return null
  return (
    <div className="content notif-tabs">
      <SegmentedControl options={OPTIONS} value={current} onChange={(name) => navigate({ name })} aria-label="Section" />
    </div>
  )
}
