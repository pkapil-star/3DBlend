import { describe, expect, it } from 'vitest'
import { evaluateCondition } from '../conditions.ts'
import type { Condition } from '../types.ts'
import { makeContext, reading, sample, series, symptom } from './fixtures.ts'

const TODAY = 40
// Ten normal nights (days 25 to 34) give a ready sleep baseline: center 7 h.
const NORMAL_SLEEP = series('sleep_hours', 25, [7, 7, 7, 7, 7, 7, 7, 7, 7, 7])
// Ten normal temperatures give a ready baseline: center 36.9 °C.
const NORMAL_TEMP = series(
  'body_temp',
  25,
  Array.from({ length: 10 }, () => 36.9),
)

describe('latest', () => {
  const highTemp: Condition = {
    type: 'latest',
    indicator: 'body_temp',
    test: { kind: 'baselineOffset', op: 'gte', offset: 1 },
  }

  it('passes when the newest reading meets the test, with evidence', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 37.9)],
    })
    const result = evaluateCondition(highTemp, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence).toEqual([
      {
        label: 'Body temperature, latest',
        value: '37.9 °C on day 40',
        reference: 'Your normal: 36.9 °C',
      },
    ])
  })

  it('looks only at the newest reading', () => {
    const ctx = makeContext(TODAY, {
      readings: [
        ...NORMAL_TEMP,
        reading('body_temp', 39, 38.5),
        reading('body_temp', 40, 37.0),
      ],
    })
    expect(evaluateCondition(highTemp, ctx).met).toBe(false)
  })

  it('is not met when a baseline comparison meets a baseline that is not ready', () => {
    const ctx = makeContext(TODAY, {
      readings: [reading('body_temp', 40, 39.5)],
    })
    expect(evaluateCondition(highTemp, ctx)).toEqual({
      met: false,
      evidence: [],
    })
  })

  it('still runs absolute comparisons while the baseline is not ready', () => {
    const lowGlucose: Condition = {
      type: 'latest',
      indicator: 'blood_glucose',
      test: { kind: 'absolute', op: 'lt', value: 70 },
    }
    const ctx = makeContext(TODAY, {
      readings: [reading('blood_glucose', 40, 64)],
    })
    const result = evaluateCondition(lowGlucose, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence[0]?.reference).toBe('Check: below 70 mg/dL')
  })

  it('respects maxAgeDays', () => {
    const condition: Condition = {
      type: 'latest',
      indicator: 'blood_glucose',
      test: { kind: 'absolute', op: 'lt', value: 70 },
      maxAgeDays: 1,
    }
    const yesterday = makeContext(TODAY, {
      readings: [reading('blood_glucose', 39, 64)],
    })
    const twoDaysAgo = makeContext(TODAY, {
      readings: [reading('blood_glucose', 38, 64)],
    })
    expect(evaluateCondition(condition, yesterday).met).toBe(true)
    expect(evaluateCondition(condition, twoDaysAgo).met).toBe(false)
  })

  it('is not met with no readings, or for an indicator without a definition', () => {
    const condition: Condition = {
      type: 'latest',
      indicator: 'blood_glucose',
      test: { kind: 'absolute', op: 'lt', value: 70 },
    }
    expect(evaluateCondition(condition, makeContext(TODAY)).met).toBe(false)
    const withoutDef = makeContext(TODAY, {
      readings: [reading('heart_rate', 40, 200)],
    })
    expect(
      evaluateCondition(
        {
          type: 'latest',
          indicator: 'heart_rate',
          test: { kind: 'absolute', op: 'gt', value: 100 },
        },
        withoutDef,
      ).met,
    ).toBe(false)
  })
})

describe('streak', () => {
  const shortSleep: Condition = {
    type: 'streak',
    indicator: 'sleep_hours',
    test: { kind: 'baselineOffset', op: 'lt', offset: -1 },
    minCount: 4,
    windowDays: 5,
  }

  it('passes when enough of the last N days pass the test', () => {
    const ctx = makeContext(TODAY, {
      readings: [
        ...NORMAL_SLEEP,
        ...series('sleep_hours', 36, [5.5, 5.75, 7, 5.25, 5.5]),
      ],
    })
    const result = evaluateCondition(shortSleep, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence).toEqual([
      {
        label: 'Sleep last night, last 5 days',
        value: '4 of 5 readings below 6.0 h',
        reference: 'Your normal: 7.0 h',
      },
    ])
  })

  it('fails with one passing day too few', () => {
    const ctx = makeContext(TODAY, {
      readings: [
        ...NORMAL_SLEEP,
        ...series('sleep_hours', 36, [5.5, 7, 7, 5.25, 5.5]),
      ],
    })
    expect(evaluateCondition(shortSleep, ctx).met).toBe(false)
  })

  it('does not count days before the window', () => {
    // Short nights on days 35 to 37 and 39 to 40: only 39, 40 and 36, 37 are in the
    // last five days (36 to 40), and day 38 is normal, so 4 still pass.
    const ctx = makeContext(TODAY, {
      readings: [
        ...NORMAL_SLEEP,
        ...series('sleep_hours', 35, [5, 5, 5, 7, 5, 5]),
      ],
    })
    expect(evaluateCondition(shortSleep, ctx).met).toBe(true)
    const fewer = makeContext(TODAY, {
      readings: [
        ...NORMAL_SLEEP,
        ...series('sleep_hours', 35, [5, 5, 7, 7, 5, 5]),
      ],
    })
    expect(evaluateCondition(shortSleep, fewer).met).toBe(false)
  })

  it('treats a missing day as not passing', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_SLEEP, ...series('sleep_hours', 38, [5, 5, 5])],
    })
    expect(evaluateCondition(shortSleep, ctx).met).toBe(false)
  })

  it('is not met while the baseline is not ready', () => {
    const ctx = makeContext(TODAY, {
      readings: series('sleep_hours', 36, [3, 3, 3, 3, 3]),
    })
    expect(evaluateCondition(shortSleep, ctx).met).toBe(false)
  })
})

describe('average', () => {
  const highAverage: Condition = {
    type: 'average',
    indicator: 'blood_glucose',
    windowDays: 7,
    minReadings: 5,
    test: { kind: 'absolute', op: 'gte', value: 100 },
  }

  it('passes when the mean over the window meets the test', () => {
    const ctx = makeContext(TODAY, {
      readings: series('blood_glucose', 34, [98, 102, 104, 99, 101, 103, 100]),
    })
    const result = evaluateCondition(highAverage, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence[0]).toMatchObject({
      label: 'Fasting blood sugar, 7-day average',
      value: '101 mg/dL (7 readings)',
    })
  })

  it('needs at least minReadings in the window', () => {
    const ctx = makeContext(TODAY, {
      readings: series('blood_glucose', 37, [120, 120, 120, 120]),
    })
    expect(evaluateCondition(highAverage, ctx).met).toBe(false)
  })

  it('works with a z-score test once the baseline is ready', () => {
    const condition: Condition = {
      type: 'average',
      indicator: 'body_temp',
      windowDays: 2,
      minReadings: 2,
      test: { kind: 'zScore', op: 'gt', z: 2 },
    }
    // Baseline 36.9 with the 0.2 floor: z > 2 means above 37.3.
    const above = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, ...series('body_temp', 39, [37.4, 37.5])],
    })
    const below = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, ...series('body_temp', 39, [37.2, 37.3])],
    })
    expect(evaluateCondition(condition, above).met).toBe(true)
    expect(evaluateCondition(condition, below).met).toBe(false)
  })

  it('works with a percent test once the baseline is ready', () => {
    const condition: Condition = {
      type: 'latest',
      indicator: 'sleep_hours',
      test: { kind: 'baselinePercent', op: 'lte', percent: -25 },
    }
    // 25% under a 7 h normal is 5.25 h.
    const atLimit = makeContext(TODAY, {
      readings: [...NORMAL_SLEEP, reading('sleep_hours', 40, 5.25)],
    })
    const above = makeContext(TODAY, {
      readings: [...NORMAL_SLEEP, reading('sleep_hours', 40, 5.5)],
    })
    expect(evaluateCondition(condition, atLimit).met).toBe(true)
    expect(evaluateCondition(condition, above).met).toBe(false)
  })
})

describe('symptom', () => {
  const rash: Condition = { type: 'symptom', symptom: 'rash', withinDays: 2 }

  it('passes when reported within the last N days, today included', () => {
    const ctx = makeContext(TODAY, { symptoms: [symptom('rash', 39)] })
    const result = evaluateCondition(rash, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence[0]).toEqual({
      label: 'Symptom reported: rash',
      value: 'Day 39',
      reference: 'Within the last 2 days',
    })
  })

  it('fails when reported earlier, or not at all, or a different symptom', () => {
    expect(
      evaluateCondition(
        rash,
        makeContext(TODAY, { symptoms: [symptom('rash', 38)] }),
      ).met,
    ).toBe(false)
    expect(evaluateCondition(rash, makeContext(TODAY)).met).toBe(false)
    expect(
      evaluateCondition(
        rash,
        makeContext(TODAY, { symptoms: [symptom('headache', 40)] }),
      ).met,
    ).toBe(false)
  })
})

describe('context', () => {
  it('cabin_co2: mean of the daily values over the window', () => {
    const today: Condition = {
      type: 'context',
      feed: 'cabin_co2',
      windowDays: 1,
      test: { kind: 'absolute', op: 'gt', value: 3 },
    }
    const ctx = makeContext(TODAY, {
      context: [sample(39, { cabin_co2: 4 }), sample(40, { cabin_co2: 3.4 })],
    })
    const result = evaluateCondition(today, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence[0]).toEqual({
      label: "Cabin CO2, today's worst 1-hour average",
      value: '3.4 mmHg',
      reference: 'Check: above 3.0 mmHg',
    })

    const threeDay: Condition = { ...today, windowDays: 3 }
    const mixed = makeContext(TODAY, {
      context: [
        sample(38, { cabin_co2: 2.5 }),
        sample(39, { cabin_co2: 2.6 }),
        sample(40, { cabin_co2: 3.4 }),
      ],
    })
    expect(evaluateCondition(threeDay, mixed).met).toBe(false)
  })

  it('cabin_co2 exactly at the limit does not pass a "gt" test', () => {
    const condition: Condition = {
      type: 'context',
      feed: 'cabin_co2',
      windowDays: 1,
      test: { kind: 'absolute', op: 'gt', value: 3 },
    }
    expect(
      evaluateCondition(
        condition,
        makeContext(TODAY, { context: [sample(40, { cabin_co2: 3 })] }),
      ).met,
    ).toBe(false)
  })

  it('radiation_cumulative: the running total up to today', () => {
    const condition: Condition = {
      type: 'context',
      feed: 'radiation_cumulative',
      windowDays: 1,
      test: { kind: 'absolute', op: 'gte', value: 1.5 },
    }
    const ctx = makeContext(TODAY, {
      context: [
        sample(38, { radiation_dose: 0.5 }),
        sample(39, { radiation_dose: 0.5 }),
        sample(40, { radiation_dose: 0.5 }),
        sample(41, { radiation_dose: 9 }),
      ],
    })
    const result = evaluateCondition(condition, ctx)
    expect(result.met).toBe(true)
    expect(result.evidence[0]?.value).toBe('1.5 mSv')
  })

  it('solar_event: true counts as 1', () => {
    const condition: Condition = {
      type: 'context',
      feed: 'solar_event',
      windowDays: 1,
      test: { kind: 'absolute', op: 'gte', value: 1 },
    }
    const during = makeContext(TODAY, {
      context: [sample(40, { solar_event: true })],
    })
    const yesterdayOnly = makeContext(TODAY, {
      context: [sample(39, { solar_event: true }), sample(40)],
    })
    expect(evaluateCondition(condition, during)).toEqual({
      met: true,
      evidence: [
        {
          label: 'Solar particle event',
          value: 'In progress',
          reference: 'Today',
        },
      ],
    })
    expect(evaluateCondition(condition, yesterdayOnly).met).toBe(false)
  })

  it('is not met when the feed has no samples in the window', () => {
    const condition: Condition = {
      type: 'context',
      feed: 'solar_event',
      windowDays: 1,
      test: { kind: 'absolute', op: 'gte', value: 1 },
    }
    expect(evaluateCondition(condition, makeContext(TODAY)).met).toBe(false)
  })

  it('never passes a baseline comparison: context feeds have no baseline', () => {
    const condition: Condition = {
      type: 'context',
      feed: 'cabin_co2',
      windowDays: 1,
      test: { kind: 'baselineOffset', op: 'gt', offset: 0 },
    }
    const ctx = makeContext(TODAY, { context: [sample(40, { cabin_co2: 9 })] })
    expect(evaluateCondition(condition, ctx).met).toBe(false)
  })
})

describe('all and any', () => {
  const lowGlucose: Condition = {
    type: 'latest',
    indicator: 'blood_glucose',
    test: { kind: 'absolute', op: 'lt', value: 70 },
  }
  const highCo2: Condition = {
    type: 'context',
    feed: 'cabin_co2',
    windowDays: 1,
    test: { kind: 'absolute', op: 'gt', value: 3 },
  }
  const both = makeContext(TODAY, {
    readings: [reading('blood_glucose', 40, 60)],
    context: [sample(40, { cabin_co2: 4 })],
  })
  const onlyGlucose = makeContext(TODAY, {
    readings: [reading('blood_glucose', 40, 60)],
    context: [sample(40, { cabin_co2: 2 })],
  })

  it('all: met only when every part is met, with every part as evidence', () => {
    const condition: Condition = { type: 'all', of: [lowGlucose, highCo2] }
    const result = evaluateCondition(condition, both)
    expect(result.met).toBe(true)
    expect(result.evidence).toHaveLength(2)
    expect(evaluateCondition(condition, onlyGlucose)).toEqual({
      met: false,
      evidence: [],
    })
  })

  it('any: met when one part is met, with only the met parts as evidence', () => {
    const condition: Condition = { type: 'any', of: [lowGlucose, highCo2] }
    const result = evaluateCondition(condition, onlyGlucose)
    expect(result.met).toBe(true)
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0]?.label).toBe('Fasting blood sugar, latest')
    expect(evaluateCondition(condition, makeContext(TODAY)).met).toBe(false)
  })
})
