import { describe, expect, it } from 'vitest'
import {
  BASELINE_WINDOWS,
  baselineWindowFor,
  computeBaseline,
  lastReadingPerDay,
} from '../baseline.ts'
import { NEAR_VISION, SLEEP, TEMP, reading } from './fixtures.ts'

const TODAY = 40
// Daily window for today = 40: days 10 to 37 (28 days, the 3 most recent left out).
const FIRST_DAY_IN = TODAY - 28 - 3 + 1
const LAST_DAY_IN = TODAY - 3

function dailyValues(values: { day: number; value: number }[]) {
  return lastReadingPerDay(
    values.map((entry) => reading('sleep_hours', entry.day, entry.value)),
    'sleep_hours',
  )
}

describe('baseline window settings', () => {
  it('match section 10', () => {
    expect(BASELINE_WINDOWS.daily).toEqual({
      windowDays: 28,
      excludeRecentDays: 3,
      minReadings: 7,
    })
    expect(BASELINE_WINDOWS.weekly).toEqual({
      windowDays: 84,
      excludeRecentDays: 14,
      minReadings: 3,
    })
  })

  it('are chosen by cadence', () => {
    expect(baselineWindowFor(1)).toBe(BASELINE_WINDOWS.daily)
    expect(baselineWindowFor(7)).toBe(BASELINE_WINDOWS.weekly)
  })
})

describe('computeBaseline window edges', () => {
  it('uses days 10 to 37 for day 40 and reports them', () => {
    const values = dailyValues(
      Array.from({ length: 7 }, (_, index) => ({
        day: FIRST_DAY_IN + index,
        value: 6,
      })),
    )
    const baseline = computeBaseline(values, SLEEP, TODAY)
    expect(baseline).toMatchObject({
      ready: true,
      fromDay: 10,
      toDay: 37,
      n: 7,
    })
  })

  it('leaves out the day just before the window', () => {
    const inside = Array.from({ length: 6 }, (_, index) => ({
      day: FIRST_DAY_IN + index,
      value: 6,
    }))
    const values = dailyValues([...inside, { day: FIRST_DAY_IN - 1, value: 6 }])
    expect(computeBaseline(values, SLEEP, TODAY)).toEqual({
      ready: false,
      n: 6,
      needed: 7,
    })
  })

  it('includes the last day of the window and leaves out the three most recent days', () => {
    const inside = Array.from({ length: 6 }, (_, index) => ({
      day: FIRST_DAY_IN + index,
      value: 6,
    }))
    const lastDay = { day: LAST_DAY_IN, value: 6 }
    const recent = [38, 39, 40].map((day) => ({ day, value: 2 }))

    const withLastDay = computeBaseline(
      dailyValues([...inside, lastDay, ...recent]),
      SLEEP,
      TODAY,
    )
    expect(withLastDay).toMatchObject({ ready: true, n: 7, center: 6 })

    const onlyRecentExtra = computeBaseline(
      dailyValues([...inside, ...recent]),
      SLEEP,
      TODAY,
    )
    expect(onlyRecentExtra).toEqual({ ready: false, n: 6, needed: 7 })
  })
})

describe('computeBaseline readiness and spread', () => {
  it('is not ready with six daily readings and ready with seven', () => {
    const six = dailyValues(
      [11, 12, 13, 14, 15, 16].map((day) => ({ day, value: 6.5 })),
    )
    expect(computeBaseline(six, SLEEP, TODAY)).toEqual({
      ready: false,
      n: 6,
      needed: 7,
    })

    const seven = dailyValues(
      [11, 12, 13, 14, 15, 16, 17].map((day) => ({ day, value: 6.5 })),
    )
    expect(computeBaseline(seven, SLEEP, TODAY).ready).toBe(true)
  })

  it('is not ready with no readings at all', () => {
    expect(computeBaseline([], SLEEP, TODAY)).toEqual({
      ready: false,
      n: 0,
      needed: 7,
    })
  })

  it('floors the spread at the indicator minimum when readings barely vary', () => {
    const values = dailyValues(
      [11, 12, 13, 14, 15, 16, 17].map((day) => ({ day, value: 7 })),
    )
    expect(computeBaseline(values, SLEEP, TODAY)).toMatchObject({
      ready: true,
      center: 7,
      spread: SLEEP.minSpread,
    })
  })

  it('uses 1.4826 x MAD when that is larger than the floor', () => {
    // values 4..10: median 7, absolute deviations 3,2,1,0,1,2,3 -> MAD 2
    const values = dailyValues(
      [4, 5, 6, 7, 8, 9, 10].map((value, index) => ({
        day: 11 + index,
        value,
      })),
    )
    const baseline = computeBaseline(values, SLEEP, TODAY)
    expect(baseline.ready).toBe(true)
    if (baseline.ready) {
      expect(baseline.center).toBe(7)
      expect(baseline.spread).toBeCloseTo(2 * 1.4826, 12)
    }
  })

  it('uses the weekly window for a weekly indicator', () => {
    // Weekly: 84 days, 14 most recent left out, 3 readings needed.
    const values = lastReadingPerDay(
      [50, 57, 64].map((day) => reading('near_vision', day, 8)),
      'near_vision',
    )
    expect(computeBaseline(values, NEAR_VISION, 80)).toMatchObject({
      ready: true,
      n: 3,
    })
    expect(computeBaseline(values, NEAR_VISION, 77)).toEqual({
      ready: false,
      n: 2,
      needed: 3,
    })
  })
})

describe('lastReadingPerDay', () => {
  it('keeps the last reading of each day, by time', () => {
    const values = lastReadingPerDay(
      [
        reading('body_temp', 3, 37.4, { hour: 20 }),
        reading('body_temp', 3, 36.8, { hour: 7 }),
        reading('body_temp', 2, 36.9),
      ],
      'body_temp',
    )
    expect(values.map((entry) => [entry.day, entry.value])).toEqual([
      [2, 36.9],
      [3, 37.4],
    ])
  })

  it('ignores other indicators', () => {
    const values = lastReadingPerDay(
      [reading('body_temp', 1, 36.9), reading('sleep_hours', 1, 6)],
      'body_temp',
    )
    expect(values).toHaveLength(1)
  })

  it('feeds the baseline only the last value of a day', () => {
    const readings = [11, 12, 13, 14, 15, 16, 17].flatMap((day) => [
      reading('body_temp', day, 39.5, { hour: 6 }),
      reading('body_temp', day, 36.9, { hour: 21 }),
    ])
    const baseline = computeBaseline(
      lastReadingPerDay(readings, 'body_temp'),
      TEMP,
      TODAY,
    )
    expect(baseline).toMatchObject({ ready: true, center: 36.9, n: 7 })
  })
})
