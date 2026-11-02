import type { ReactNode } from 'react'
import type { Route } from '../router'
import { hrefOf } from '../router'
import { BarChart, Bell, Clock, Plus, Trophy } from './icons'

export type TabName = 'classement' | 'match' | 'historique' | 'stats' | 'nouveautes'

export type TabBarProps = {
  current: Route['name']
  /** Fired when the user taps the tab of the screen he is already on (scroll to top / reset an empty draft, §2). */
  onReselect?: (tab: TabName) => void
  /** Unread count shown on the Nouveautés tab (hidden when 0). */
  newsBadge?: number
}

type Tab = { name: TabName; label: string; route: Route; icon: ReactNode }

// Match, the app's main action, sits in the middle as a raised round « + » (.tab--cta).
const TABS: Tab[] = [
  { name: 'classement', label: 'Classement', route: { name: 'classement' }, icon: <Trophy /> },
  { name: 'historique', label: 'Historique', route: { name: 'historique' }, icon: <Clock /> },
  { name: 'match', label: 'Match', route: { name: 'match' }, icon: <Plus size={26} /> },
  { name: 'stats', label: 'Stats', route: { name: 'stats' }, icon: <BarChart /> },
  { name: 'nouveautes', label: 'Nouveautés', route: { name: 'nouveautes' }, icon: <Bell /> },
]

function tabClass(tab: Tab, active: boolean): string {
  const classes = ['tab']
  if (tab.name === 'match') classes.push('tab--cta')
  if (active) classes.push('tab-active')
  return classes.join(' ')
}

function TabContent({ tab, newsBadge }: { tab: Tab; newsBadge: number }) {
  if (tab.name === 'match') {
    return (
      <span className="tab-cta">
        {tab.icon}
        <span className="tab-cta__label">{tab.label}</span>
      </span>
    )
  }
  return (
    <>
      <span className="tab-icon">
        {tab.icon}
        {tab.name === 'nouveautes' && newsBadge > 0 && (
          <span className="tab-badge" aria-label={`${newsBadge} nouveautés non lues`}>
            {newsBadge}
          </span>
        )}
      </span>
      <span className="tab-label">{tab.label}</span>
    </>
  )
}

// Pushed screens keep their section's tab highlighted so the user always knows where « back » leads. The three Stats
// segments (Récap, Courbes, Hall of Flair) are its roots; Réglages opens from the Stats header.
function sectionOf(name: Route['name']): TabName {
  if (name === 'match' || name === 'match-edit') return 'match'
  if (name === 'historique' || name === 'match-detail') return 'historique'
  if (name === 'stats' || name === 'courbes' || name === 'top' || name === 'reglages') return 'stats'
  if (name === 'journal') return 'nouveautes'
  if (name === 'nouveautes') return 'nouveautes'
  // classement, appel, joueurs, joueur, duo, comment-ca-marche
  return 'classement'
}

export function TabBar({ current, onReselect, newsBadge = 0 }: TabBarProps) {
  const active = sectionOf(current)

  return (
    <nav className="tabbar" aria-label="Navigation principale">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const isActive = tab.name === active
          const isSameScreen = tab.name === current
          return (
            <a
              key={tab.name}
              className={tabClass(tab, isActive)}
              href={hrefOf(tab.route)}
              aria-current={isActive ? 'page' : undefined}
              onClick={isSameScreen && onReselect ? () => onReselect(tab.name) : undefined}
            >
              <TabContent tab={tab} newsBadge={newsBadge} />
            </a>
          )
        })}
      </div>
    </nav>
  )
}
