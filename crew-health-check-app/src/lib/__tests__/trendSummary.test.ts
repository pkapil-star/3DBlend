import { describe, expect, it } from 'vitest'
import type { Baseline, DailyValue } from '../../engine/index.ts'
import { indicatorDef } from '../labels.ts'
import {
  BAND_SPREADS,
  TREND_DAYS,
  bandOf,
  trendSummary,
  trendWindow,
} from '../trendSummary.ts'

// The trend summary line under each chart (ARCHITECTURE.md sections 19.3 and 31.11).

const SLEEP = indicatorDef('sleep_hours')
const HEART = indicatorDef('heart_rate')

function days(fromDay: number, values: readonly number[]): DailyValue[] {
  return values.map((value, index) => ({
    day: fromDay + index,
    atMs: 0,
    value,
  }))
}

function ready(center: number, spread: number): Baseline {
  return { ready: true, n: 28, center, spread, fromDay: 1, toDay: 28 }
}

describe('trendSummary', () => {
  it('says how far down, over how many readings, and how many left the usual range', () => {
    const values = days(26, [5.25, 5.5, 5.25, 5.25, 5.25])
    expect(trendSummary(values, ready(7, 0.5), SLEEP)).toBe(
      'Down 1.7 h from your normal over the last 5 readings; 5 of 5 outside your usual range.',
    )
  })

  it('says up, and counts only readings outside the band', () => {
    // Band 62 ± 2 × 3 = 56 to 68: 70 and 69 are outside, 66 is inside.
    const values = days(10, [60, 66, 69, 70])
    expect(trendSummary(values, ready(62, 3), HEART)).toBe(
      'Up 4 bpm from your normal over the last 4 readings; 2 of 4 outside your usual range.',
    )
  })

  it('uses only the five latest readings', () => {
    const values = days(1, [9, 9, 9, 7, 7, 7, 7, 7])
    expect(trendSummary(values, ready(7, 0.5), SLEEP)).toBe(
      'About the same as your normal over the last 5 readings; 0 of 5 outside your usual range.',
    )
  })

  it('names a single reading as such', () => {
    expect(trendSummary(days(3, [6]), ready(7, 0.5), SLEEP)).toBe(
      'Down 1.0 h from your normal over the last reading; 0 of 1 outside your usual range.',
    )
  })

  it('has no band and says so while the baseline is learning', () => {
    const learning: Baseline = { ready: false, n: 3, needed: 7 }
    expect(trendSummary(days(1, [7, 6]), learning, SLEEP)).toBe(
      'Learning your normal (3 of 7): the usual range appears when your normal is ready.',
    )
    expect(bandOf(learning)).toBeNull()
    expect(trendSummary(days(1, [7]), undefined, SLEEP)).toBe(
      'No normal yet: the usual range appears when your normal is ready.',
    )
  })

  it('says when there is nothing to show', () => {
    expect(trendSummary([], ready(7, 0.5), SLEEP)).toBe(
      `No readings in the last ${TREND_DAYS} days.`,
    )
  })
})

describe('trend window and band', () => {
  it('keeps the last 30 days, today included', () => {
    const values = days(
      1,
      Array.from({ length: 40 }, () => 7),
    )
    const window = trendWindow(values, 40)
    expect(window[0]?.day).toBe(11)
    expect(window.at(-1)?.day).toBe(40)
    expect(window).toHaveLength(TREND_DAYS)
  })

  it('shades center ± 2 × spread', () => {
    expect(bandOf(ready(7, 0.5))).toEqual({
      low: 7 - BAND_SPREADS * 0.5,
      high: 7 + BAND_SPREADS * 0.5,
      center: 7,
    })
  })
})
