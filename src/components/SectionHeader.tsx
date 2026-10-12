import { fmtInt } from '../format'

export type SectionHeaderProps = {
  title: string
  /** Shown after « · », e.g. « classés après 10 matchs ». */
  subtitle?: string
  count?: number
}

function headerText(title: string, subtitle: string | undefined): string {
  if (!subtitle) return title
  return `${title} · ${subtitle}`
}

/** 12 px / 600 uppercase --text-3 caption, padding 24 16 8 (spec §3.1, §5). */
export function SectionHeader({ title, subtitle, count }: SectionHeaderProps) {
  return (
    <h2 className="section-header">
      <span className="section-header-title">{headerText(title, subtitle)}</span>
      {count !== undefined && <span className="section-header-count num">{fmtInt(count)}</span>}
    </h2>
  )
}
