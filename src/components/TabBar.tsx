import type { ReactNode } from 'react'
import type { Route } from '../router'
import { hrefOf } from '../router'
import { Bell, Clock, List, People, Trophy } from './icons'

export type TabName = 'classement' | 'match' | 'historique' | 'joueurs' | 'nouveautes'

export type TabBarProps = {
  current: Route['name']
  /** Fired when the user taps the tab of the screen he is already on (scroll to top / reset an empty draft, §2). */
  onReselect?: (tab: TabName) => void
  /** Unread count shown on the Nouveautés tab (hidden when 0). */
  newsBadge?: number
}

type Tab = { name: TabName; label: string; route: Route; icon: ReactNode }

const TABS: Tab[] = [
  { name: 'classement', label: 'Classement', route: { name: 'classement' }, icon: <Trophy /> },
  { name: 'match', label: 'Match', route: { name: 'match' }, icon: <List /> },
  { name: 'historique', label: 'Historique', route: { name: 'historique' }, icon: <Clock /> },
  { name: 'joueurs', label: 'Joueurs', route: { name: 'joueurs' }, icon: <People /> },
  { name: 'nouveautes', label: 'Nouveautés', route: { name: 'nouveautes' }, icon: <Bell /> },
]

// Pushed screens keep their section's tab highlighted so the user always knows where « back » leads.
function sectionOf(name: Route['name']): TabName {
  if (name === 'match' || name === 'match-edit') return 'match'
  if (name === 'historique' || name === 'match-detail') return 'historique'
  if (name === 'joueurs' || name === 'joueur' || name === 'reglages' || name === 'journal') return 'joueurs'
  if (name === 'nouveautes') return 'nouveautes'
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
              className={isActive ? 'tab tab-active' : 'tab'}
              href={hrefOf(tab.route)}
              aria-current={isActive ? 'page' : undefined}
              onClick={isSameScreen && onReselect ? () => onReselect(tab.name) : undefined}
            >
              <span className="tab-icon">
                {tab.icon}
                {tab.name === 'nouveautes' && newsBadge > 0 && (
                  <span className="tab-badge" aria-label={` nouveautés non lues`}>
                    {newsBadge}
                  </span>
                )}
              </span>
              <span className="tab-label">{tab.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
