import type { Baseline, DailyValue, IndicatorDef } from '../engine/index.ts'
import { formatNormal } from './labels.ts'

// The trend chart's window, band and one-line summary (ARCHITECTURE.md
// sections 10, 19.3 and 31.11). Pure functions: values in, words out.

/** Days shown on a trend chart, today included. */
export const TREND_DAYS = 30

/** The chart band is center ± 2 × spread: "your usual range" (section 10). */
export const BAND_SPREADS = 2

/** How many of the latest readings the summary line describes. */
export const RECENT_READINGS = 5

/** The values of the last TREND_DAYS days, today included, in day order. */
export function trendWindow(
  values: readonly DailyValue[],
  today: number,
): DailyValue[] {
  return values.filter(
    (entry) => entry.day > today - TREND_DAYS && entry.day <= today,
  )
}

/** The shaded band, or null while the baseline is not ready. */
export function bandOf(
  baseline: Baseline | undefined,
): { low: number; high: number; center: number } | null {
  if (!baseline?.ready) return null
  return {
    low: baseline.center - BAND_SPREADS * baseline.spread,
    high: baseline.center + BAND_SPREADS * baseline.spread,
    center: baseline.center,
  }
}

function readingsWord(count: number): string {
  return count === 1 ? 'the last reading' : `the last ${count} readings`
}

/**
 * One line under the chart, such as "Down 1.7 h from your normal over the
 * last 5 readings; 5 of 5 outside your usual range." It compares the mean of
 * the latest readings with the person's own normal.
 */
export function trendSummary(
  values: readonly DailyValue[],
  baseline: Baseline | undefined,
  def: IndicatorDef,
): string {
  if (values.length === 0) {
    return `No readings in the last ${TREND_DAYS} days.`
  }
  if (!baseline?.ready) {
    const learning = baseline
      ? `Learning your normal (${baseline.n} of ${baseline.needed})`
      : 'No normal yet'
    return `${learning}: the usual range appears when your normal is ready.`
  }
  const recent = values.slice(-RECENT_READINGS)
  const mean =
    recent.reduce((sum, entry) => sum + entry.value, 0) / recent.length
  const difference = mean - baseline.center
  const amount = formatNormal(Math.abs(difference), def)
  const shownAsZero = Number(amount.split(' ')[0]) === 0
  const band = bandOf(baseline)
  const outside = band
    ? recent.filter(
        (entry) => entry.value < band.low || entry.value > band.high,
      ).length
    : 0
  const span = readingsWord(recent.length)
  const range = `${outside} of ${recent.length} outside your usual range.`
  if (shownAsZero) {
    return `About the same as your normal over ${span}; ${range}`
  }
  const direction = difference > 0 ? 'Up' : 'Down'
  return `${direction} ${amount} from your normal over ${span}; ${range}`
}
