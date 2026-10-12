// Nouveautés : la liste succincte des mises à jour de l'app ; la visite marque tout comme lu (pastille de l'onglet).
import { useEffect, useState } from 'react'
import { CHANGELOG, latestChangelogId, unseenEntries } from '../changelog'
import { fmtDayHeader } from '../format'
import { useAppState } from '../store'

export function Nouveautes() {
  const { store, dispatch } = useAppState()
  const unseen = new Set(unseenEntries(store.settings).map((entry) => entry.id))
  const latest = latestChangelogId()
  const [now] = useState(() => new Date())

  useEffect(() => {
    if (latest === undefined || store.settings.seenChangelogId === latest) return
    dispatch({ type: 'setSetting', patch: { seenChangelogId: latest } })
  }, [latest, store.settings.seenChangelogId, dispatch])

  return (
    <div className="content news">
      {CHANGELOG.map((entry) => (
        <section key={entry.id} className={unseen.has(entry.id) ? 'news-entry news-entry--new' : 'news-entry'}>
          <p className="news-date">{fmtDayHeader(`${entry.date}T12:00:00`, now)}</p>
          <h2 className="news-title">{entry.title}</h2>
          <ul className="news-list">
            {entry.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
