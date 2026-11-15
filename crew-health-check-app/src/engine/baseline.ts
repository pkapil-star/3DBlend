import { median, scaledMad } from './stats.ts'
import type {
  Baseline,
  IndicatorDef,
  IndicatorId,
  MissionDay,
  MissionMs,
  Reading,
} from './types.ts'

/**
 * Baseline window settings (ARCHITECTURE.md section 10), kept in one place.
 * The most recent days are left out so a developing problem does not become
 * its own normal.
 */
export const BASELINE_WINDOWS = {
  daily: { windowDays: 28, excludeRecentDays: 3, minReadings: 7 },
  weekly: { windowDays: 84, excludeRecentDays: 14, minReadings: 3 },
} as const

export function baselineWindowFor(cadenceDays: number) {
  return cadenceDays >= 7 ? BASELINE_WINDOWS.weekly : BASELINE_WINDOWS.daily
}

/** First and last day of the rolling window; shared with the personal pattern model. */
export function baselineWindowRange(
  cadenceDays: number,
  today: MissionDay,
): { fromDay: MissionDay; toDay: MissionDay } {
  const settings = baselineWindowFor(cadenceDays)
  return {
    fromDay: today - settings.windowDays - settings.excludeRecentDays + 1,
    toDay: today - settings.excludeRecentDays,
  }
}

/** One value per mission day for one indicator. */
export interface DailyValue {
  day: MissionDay
  atMs: MissionMs
  value: number
}

export function isRecheck(reading: Reading): boolean {
  return reading.purpose === 'recheck'
}

/** The newest reading of an indicator, urgent re-checks included. */
export interface LatestValue extends DailyValue {
  recheck: boolean
}

/**
 * "Latest" for alert rules: the newest reading by time, routine or re-check,
 * so a re-check can confirm or clear an alert. With equal times the reading
 * entered later wins.
 */
export function latestReading(
  readings: readonly Reading[],
  indicator: IndicatorId,
): LatestValue | null {
  let newest: Reading | null = null
  for (const reading of readings) {
    if (reading.indicator !== indicator) continue
    if (!newest || reading.atMs >= newest.atMs) newest = reading
  }
  if (!newest) return null
  return {
    day: newest.day,
    atMs: newest.atMs,
    value: newest.value,
    recheck: isRecheck(newest),
  }
}

/**
 * One routine value per day: with several routine readings on one day, the
 * last one counts (section 10). Urgent re-checks are left out, so they never
 * enter a baseline, a streak or an average, and never replace the day's
 * routine reading (a blood sugar re-check is not a fasting value).
 */
export function lastReadingPerDay(
  readings: readonly Reading[],
  indicator: IndicatorId,
): DailyValue[] {
  const byDay = new Map<MissionDay, DailyValue>()
  for (const reading of readings) {
    if (reading.indicator !== indicator || isRecheck(reading)) continue
    const current = byDay.get(reading.day)
    if (!current || reading.atMs >= current.atMs) {
      byDay.set(reading.day, {
        day: reading.day,
        atMs: reading.atMs,
        value: reading.value,
      })
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day)
}

/** Median and floored, scaled MAD of the readings in the rolling window. */
export function computeBaseline(
  values: readonly DailyValue[],
  def: IndicatorDef,
  today: MissionDay,
): Baseline {
  const settings = baselineWindowFor(def.cadenceDays)
  const { fromDay, toDay } = baselineWindowRange(def.cadenceDays, today)
  const inWindow = values
    .filter((entry) => entry.day >= fromDay && entry.day <= toDay)
    .map((entry) => entry.value)

  if (inWindow.length < settings.minReadings) {
    return { ready: false, n: inWindow.length, needed: settings.minReadings }
  }
  return {
    ready: true,
    n: inWindow.length,
    center: median(inWindow),
    spread: Math.max(scaledMad(inWindow), def.minSpread),
    fromDay,
    toDay,
  }
}
