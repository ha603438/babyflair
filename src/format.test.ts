import { describe, expect, it } from 'vitest'
import {
  daysSince,
  fmtDateLine,
  fmtDayHeader,
  fmtDelta,
  fmtInt,
  fmtMultiplier,
  fmtOrdinal,
  fmtPercent,
  fmtRelative,
  fmtRelativeDay,
  fmtScore,
  fmtTime,
  plural,
} from './format'

const NNBSP = ' '
// ICU binds the unit to its number with a no-break space: « il y a 12 min ».
const NBSP = ' '
const MINUS = '−'
const EN_DASH = '–'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Local-time constructors keep the expectations independent of the machine's time zone.
function local(year: number, month: number, day: number, hour = 12, minute = 0, second = 0): Date {
  return new Date(year, month - 1, day, hour, minute, second)
}

function iso(date: Date): string {
  return date.toISOString()
}

function before(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString()
}

describe('fmtInt', () => {
  it('groups thousands with a narrow no-break space', () => {
    expect(fmtInt(1026)).toBe(`1${NNBSP}026`)
    expect(fmtInt(1234567)).toBe(`1${NNBSP}234${NNBSP}567`)
  })

  it('leaves small numbers alone', () => {
    expect(fmtInt(0)).toBe('0')
    expect(fmtInt(7)).toBe('7')
    expect(fmtInt(999)).toBe('999')
  })

  it('uses the true minus sign for negatives', () => {
    expect(fmtInt(-9)).toBe(`${MINUS}9`)
    expect(fmtInt(-1026)).toBe(`${MINUS}1${NNBSP}026`)
  })

  it('rounds to an integer and never prints minus zero', () => {
    expect(fmtInt(1.4)).toBe('1')
    expect(fmtInt(1.5)).toBe('2')
    expect(fmtInt(-0)).toBe('0')
    expect(fmtInt(-0.4)).toBe('0')
  })
})

describe('fmtDelta', () => {
  it('signs positives, negatives and zero', () => {
    expect(fmtDelta(16)).toBe('+16')
    expect(fmtDelta(-9)).toBe(`${MINUS}9`)
    expect(fmtDelta(0)).toBe('±0')
  })

  it('groups thousands', () => {
    expect(fmtDelta(1026)).toBe(`+1${NNBSP}026`)
    expect(fmtDelta(-1026)).toBe(`${MINUS}1${NNBSP}026`)
  })

  it('treats values that round to zero as zero', () => {
    expect(fmtDelta(0.4)).toBe('±0')
    expect(fmtDelta(-0.4)).toBe('±0')
    expect(fmtDelta(0.6)).toBe('+1')
    expect(fmtDelta(-0.6)).toBe(`${MINUS}1`)
  })
})

describe('fmtPercent', () => {
  it('formats a ratio with a narrow no-break space before %', () => {
    expect(fmtPercent(0.28)).toBe(`28${NNBSP}%`)
    expect(fmtPercent(0.6)).toBe(`60${NNBSP}%`)
  })

  it('handles the bounds and rounding', () => {
    expect(fmtPercent(0)).toBe(`0${NNBSP}%`)
    expect(fmtPercent(1)).toBe(`100${NNBSP}%`)
    expect(fmtPercent(0.333)).toBe(`33${NNBSP}%`)
    expect(fmtPercent(0.999)).toBe(`100${NNBSP}%`)
  })
})

describe('fmtMultiplier', () => {
  it('uses a comma decimal after the multiplication sign', () => {
    expect(fmtMultiplier(1.1)).toBe('×1,1')
    expect(fmtMultiplier(0.9)).toBe('×0,9')
  })

  it('always shows at least one decimal and at most two', () => {
    expect(fmtMultiplier(1)).toBe('×1,0')
    expect(fmtMultiplier(1.25)).toBe('×1,25')
    expect(fmtMultiplier(1.256)).toBe('×1,26')
  })
})

describe('fmtOrdinal', () => {
  it('writes 1er then Ne', () => {
    expect(fmtOrdinal(1)).toBe('1er')
    expect(fmtOrdinal(2)).toBe('2e')
    expect(fmtOrdinal(3)).toBe('3e')
    expect(fmtOrdinal(11)).toBe('11e')
    expect(fmtOrdinal(21)).toBe('21e')
  })

  it('groups large ranks', () => {
    expect(fmtOrdinal(1026)).toBe(`1${NNBSP}026e`)
  })
})

describe('fmtTime', () => {
  it('formats HH:MM in 24-hour time', () => {
    expect(fmtTime(iso(local(2026, 10, 6, 12, 42)))).toBe('12:42')
    expect(fmtTime(iso(local(2026, 10, 6, 0, 5)))).toBe('00:05')
    expect(fmtTime(iso(local(2026, 10, 6, 23, 59)))).toBe('23:59')
  })

  it('returns an empty string for an invalid date', () => {
    expect(fmtTime('pas une date')).toBe('')
  })
})

describe('fmtRelativeDay', () => {
  const now = local(2026, 10, 11, 12, 0)

  it('names the calendar day, never hours or minutes', () => {
    const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' })
    expect(fmtRelativeDay(iso(local(2026, 10, 11, 11, 55)), now)).toBe(rtf.format(0, 'day'))
    expect(fmtRelativeDay(iso(local(2026, 10, 10, 23, 0)), now)).toBe(rtf.format(-1, 'day'))
    expect(fmtRelativeDay(iso(local(2026, 10, 7, 9, 0)), now)).toBe(rtf.format(-4, 'day'))
  })

  it('returns an empty string for an invalid date', () => {
    expect(fmtRelativeDay('pas une date', now)).toBe('')
  })
})

describe('fmtRelative', () => {
  const now = local(2026, 10, 11, 12, 0)

  it('says « à l\'instant » under a minute', () => {
    expect(fmtRelative(before(now, 0), now)).toBe("à l'instant")
    expect(fmtRelative(before(now, 30_000), now)).toBe("à l'instant")
    expect(fmtRelative(before(now, 59_999), now)).toBe("à l'instant")
  })

  it('counts minutes under an hour', () => {
    expect(fmtRelative(before(now, MINUTE_MS), now)).toBe(`il y a 1${NBSP}min`)
    expect(fmtRelative(before(now, 12 * MINUTE_MS), now)).toBe(`il y a 12${NBSP}min`)
    expect(fmtRelative(before(now, HOUR_MS - 1), now)).toBe(`il y a 59${NBSP}min`)
  })

  it('counts hours under a day', () => {
    expect(fmtRelative(before(now, HOUR_MS), now)).toBe(`il y a 1${NBSP}h`)
    expect(fmtRelative(before(now, 3 * HOUR_MS), now)).toBe(`il y a 3${NBSP}h`)
    expect(fmtRelative(before(now, DAY_MS - 1), now)).toBe(`il y a 23${NBSP}h`)
  })

  it('says « hier » and « avant-hier », then counts days', () => {
    expect(fmtRelative(before(now, DAY_MS), now)).toBe('hier')
    expect(fmtRelative(before(now, 2 * DAY_MS - 1), now)).toBe('hier')
    expect(fmtRelative(before(now, 2 * DAY_MS), now)).toBe('avant-hier')
    expect(fmtRelative(before(now, 3 * DAY_MS), now)).toBe(`il y a 3${NBSP}j`)
    expect(fmtRelative(before(now, 42 * DAY_MS), now)).toBe(`il y a 42${NBSP}j`)
  })

  it('clamps future dates to « à l\'instant »', () => {
    expect(fmtRelative(before(now, -5 * MINUTE_MS), now)).toBe("à l'instant")
  })

  it('returns an empty string for an invalid date', () => {
    expect(fmtRelative('pas une date', now)).toBe('')
  })
})

describe('fmtDayHeader', () => {
  const now = local(2026, 10, 11, 9, 0)

  it('says Aujourd\'hui for any time of the current day', () => {
    expect(fmtDayHeader(iso(local(2026, 10, 11, 0, 0)), now)).toBe("Aujourd'hui")
    expect(fmtDayHeader(iso(local(2026, 10, 11, 23, 59)), now)).toBe("Aujourd'hui")
  })

  it('says Hier for the previous calendar day, even across midnight', () => {
    expect(fmtDayHeader(iso(local(2026, 10, 10, 0, 0)), now)).toBe('Hier')
    expect(fmtDayHeader(iso(local(2026, 10, 10, 23, 59)), local(2026, 10, 11, 0, 1))).toBe('Hier')
  })

  it('formats older days of the current year without the year', () => {
    expect(fmtDayHeader(iso(local(2026, 10, 9)), now)).toBe('vendredi 9 octobre')
    expect(fmtDayHeader(iso(local(2026, 10, 8)), now)).toBe('jeudi 8 octobre')
    expect(fmtDayHeader(iso(local(2026, 1, 1)), now)).toBe('jeudi 1 janvier')
  })

  it('appends the year when it differs from the current one', () => {
    expect(fmtDayHeader(iso(local(2025, 12, 12)), now)).toBe('vendredi 12 décembre 2025')
  })

  it('handles the year boundary', () => {
    const newYear = local(2026, 1, 1, 0, 30)
    expect(fmtDayHeader(iso(local(2025, 12, 31, 23, 50)), newYear)).toBe('Hier')
    expect(fmtDayHeader(iso(local(2025, 12, 30, 12, 0)), newYear)).toBe('mardi 30 décembre 2025')
  })

  it('returns an empty string for an invalid date', () => {
    expect(fmtDayHeader('pas une date', now)).toBe('')
  })
})

describe('fmtDateLine', () => {
  it('joins short date, time and target with middle dots', () => {
    expect(fmtDateLine(iso(local(2026, 10, 5, 12, 42)), 10, true)).toBe('lun. 5 oct. · 12:42 · en 10')
    expect(fmtDateLine(iso(local(2026, 10, 7, 9, 5)), 5, true)).toBe('mer. 7 oct. · 09:05 · en 5')
  })

  it('leaves the time of day out when asked', () => {
    expect(fmtDateLine(iso(local(2026, 10, 5, 12, 42)), 10, false)).toBe('lun. 5 oct. · en 10')
  })

  it('returns an empty string for an invalid date', () => {
    expect(fmtDateLine('pas une date', 10, true)).toBe('')
    expect(fmtDateLine('pas une date', 10, false)).toBe('')
  })
})

describe('fmtScore', () => {
  it('separates the scores with a spaced en dash', () => {
    expect(fmtScore(10, 8)).toBe(`10 ${EN_DASH} 8`)
    expect(fmtScore(8, 10)).toBe(`8 ${EN_DASH} 10`)
    expect(fmtScore(5, 0)).toBe(`5 ${EN_DASH} 0`)
  })
})

describe('daysSince', () => {
  const now = local(2026, 10, 11, 12, 0)

  it('floors whole elapsed days', () => {
    expect(daysSince(before(now, 0), now)).toBe(0)
    expect(daysSince(before(now, DAY_MS - 1), now)).toBe(0)
    expect(daysSince(before(now, DAY_MS), now)).toBe(1)
    expect(daysSince(before(now, 42 * DAY_MS + 23 * HOUR_MS), now)).toBe(42)
  })

  it('clamps future dates to zero', () => {
    expect(daysSince(before(now, -3 * DAY_MS), now)).toBe(0)
  })

  it('returns zero for an invalid date', () => {
    expect(daysSince('pas une date', now)).toBe(0)
  })
})

describe('plural', () => {
  it('keeps the singular for 0 and 1', () => {
    expect(plural(0, 'joueur')).toBe('0 joueur')
    expect(plural(1, 'joueur')).toBe('1 joueur')
  })

  it('adds an s from 2', () => {
    expect(plural(2, 'joueur')).toBe('2 joueurs')
    expect(plural(148, 'match')).toBe('148 matchs')
    expect(plural(2, 'invité')).toBe('2 invités')
  })

  it('uses the explicit plural form when given', () => {
    expect(plural(3, 'cheval', 'chevaux')).toBe('3 chevaux')
    expect(plural(1, 'cheval', 'chevaux')).toBe('1 cheval')
  })

  it('groups the count', () => {
    expect(plural(1026, 'match')).toBe(`1${NNBSP}026 matchs`)
  })
})
