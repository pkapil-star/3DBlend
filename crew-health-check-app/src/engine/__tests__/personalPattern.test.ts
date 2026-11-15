import { describe, expect, it } from 'vitest'
import { evaluate } from '../index.ts'
import { cholesky, solveCholesky } from '../models/linalg.ts'
import {
  ledoitWolfSecondMoment,
  scoreToday,
  topFactors,
} from '../models/personalPattern.ts'
import type {
  EvaluationInput,
  IndicatorDef,
  IndicatorId,
  PersonalPatternModel,
  Reading,
} from '../types.ts'
import {
  GLUCOSE,
  SLEEP,
  STATION_LINK,
  TEMP,
  nineAm,
  reading,
  testRule,
} from './fixtures.ts'

// The personal pattern model (ARCHITECTURE.md section 26.18). Parity with
// Python is tested against the real model file in src/data/__tests__; these
// tests use a small fixture model and fixture readings.

const HEART: IndicatorDef = {
  ...SLEEP,
  id: 'heart_rate',
  region: 'heart',
  label: 'Resting heart rate',
  unit: 'bpm',
  step: 1,
  minSpread: 3,
}
const MOOD: IndicatorDef = {
  ...SLEEP,
  id: 'mood',
  label: 'Mood',
  unit: '',
  step: 1,
  minSpread: 0.5,
}
const DEFS = [SLEEP, TEMP, GLUCOSE, HEART, MOOD]

const MODEL: PersonalPatternModel = {
  modelId: 'personal-pattern',
  version: 'test',
  indicators: [
    'sleep_hours',
    'body_temp',
    'blood_glucose',
    'heart_rate',
    'mood',
  ],
  minIndicatorsToday: 4,
  minDays: 14,
}

const TYPICAL: Record<string, { center: number; scale: number }> = {
  sleep_hours: { center: 7, scale: 0.5 },
  body_temp: { center: 36.8, scale: 0.2 },
  blood_glucose: { center: 90, scale: 4 },
  heart_rate: { center: 60, scale: 3 },
  mood: { center: 4, scale: 0.5 },
}

/** A small, fixed day-to-day wobble in -1..1, different for each indicator. */
function wobble(day: number, index: number): number {
  return (((day * (7 + 3 * index)) % 11) - 5) / 5
}

function typicalValue(id: IndicatorId, day: number): number {
  const typical = TYPICAL[id]
  if (!typical) throw new Error(`no typical value for ${id}`)
  return (
    typical.center + typical.scale * wobble(day, MODEL.indicators.indexOf(id))
  )
}

/** Every model indicator on days fromDay..toDay. */
function history(fromDay: number, toDay: number): Reading[] {
  const readings: Reading[] = []
  for (let day = fromDay; day <= toDay; day++) {
    for (const id of MODEL.indicators) {
      readings.push(reading(id, day, typicalValue(id, day)))
    }
  }
  return readings
}

/** Today's readings: `shift` spreads (TYPICAL scale) added to each named indicator. */
function today(
  day: number,
  shifts: Partial<Record<IndicatorId, number>>,
): Reading[] {
  return Object.entries(shifts).map(([id, shift]) => {
    const typical = TYPICAL[id]
    if (!typical) throw new Error(`no typical value for ${id}`)
    return reading(
      id as IndicatorId,
      day,
      typical.center + (shift ?? 0) * typical.scale,
    )
  })
}

const sleepRule = testRule({
  id: 'R-TEST-01',
  region: 'head',
  when: {
    type: 'streak',
    indicator: 'sleep_hours',
    test: { kind: 'baselineOffset', op: 'lt', offset: -1 },
    minCount: 4,
    windowDays: 5,
  },
})

const DAY = 40

function input(overrides: Partial<EvaluationInput>): EvaluationInput {
  return {
    nowMs: nineAm(DAY),
    crewId: 'c1',
    readings: [],
    symptoms: [],
    context: [],
    link: STATION_LINK,
    indicators: DEFS,
    rules: [sleepRule],
    spaceWeather: [],
    models: { sepRisk: null, personalPattern: MODEL, earthHospital: null },
    ...overrides,
  }
}

function without(
  shifts: Partial<Record<IndicatorId, number>>,
  id: IndicatorId,
): Partial<Record<IndicatorId, number>> {
  const copy = { ...shifts }
  delete copy[id]
  return copy
}

const SHIFTED = { sleep_hours: -4, heart_rate: 4, mood: -4, body_temp: 3 }
const ORDINARY = {
  sleep_hours: 0,
  heart_rate: 0,
  mood: 0,
  body_temp: 0,
  blood_glucose: 0,
}

describe('linear algebra', () => {
  it('factorizes and solves a small positive definite matrix', () => {
    const lower = cholesky([
      [4, 2],
      [2, 3],
    ])
    expect(lower).not.toBeNull()
    expect(lower?.[0]).toEqual([2, 0])
    expect(lower?.[1]?.[0]).toBe(1)
    expect(lower?.[1]?.[1]).toBeCloseTo(Math.SQRT2, 12)
    const solved = solveCholesky(lower ?? [], [8, 7])
    expect(solved[0]).toBeCloseTo(1.25, 12)
    expect(solved[1]).toBeCloseTo(1.5, 12)
  })

  it('refuses matrices that are not positive definite', () => {
    expect(
      cholesky([
        [1, 2],
        [2, 1],
      ]),
    ).toBeNull()
    expect(
      cholesky([
        [0, 0],
        [0, 0],
      ]),
    ).toBeNull()
    expect(cholesky([[Number.NaN]])).toBeNull()
  })
})

describe('the score', () => {
  const rows = Array.from({ length: 20 }, (_, day) =>
    MODEL.indicators.map((_, index) => wobble(day + 1, index)),
  )

  it('has contributions that add up to the distance', () => {
    const score = scoreToday(rows, [1.5, -0.5, 2, 0, -1])
    expect(score).not.toBeNull()
    const sum = (score?.contributions ?? []).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - (score?.squaredDistance ?? Number.NaN))).toBeLessThan(
      1e-9,
    )
  })

  it('is notable only above every baseline day, and the score says by how much', () => {
    const far = scoreToday(rows, [6, -6, 6, 6, -6])
    expect(far?.notable).toBe(true)
    expect(far?.score).toBeGreaterThan(1)
    const usual = scoreToday(rows, [0, 0, 0, 0, 0])
    expect(usual?.notable).toBe(false)
    // A baseline day itself is never more unusual than its own leave-one-out distance.
    const repeat = scoreToday(rows, rows[3] ?? [])
    expect(repeat?.notable).toBe(false)
  })

  it('gives null instead of failing when readings never vary', () => {
    const flat = Array.from({ length: 20 }, () => [0, 0, 0, 0])
    expect(scoreToday(flat, [1, 0, 0, 0])).toBeNull()
  })

  it('treats one indicator as scikit-learn does: the mean square, no shrinkage', () => {
    expect(ledoitWolfSecondMoment([[1], [3]])).toEqual({
      matrix: [[5]],
      shrinkage: 0,
    })
  })

  it('names at most three factors, largest positive contribution first', () => {
    const factors = topFactors(
      ['sleep_hours', 'mood', 'heart_rate', 'body_temp', 'blood_glucose'],
      [1, -2, 3, 1, 1],
      [0.5, 4, -1, 2, 0.5],
    )
    expect(factors.map((factor) => factor.indicator)).toEqual([
      'mood',
      'body_temp',
      'sleep_hours',
    ])
    expect(factors[0]?.z).toBe(-2)
  })

  it('never names a reading whose contribution is zero or negative', () => {
    const factors = topFactors(
      ['sleep_hours', 'mood', 'heart_rate'],
      [2, 0.4, 0],
      [5, -0.6, 0],
    )
    expect(factors.map((factor) => factor.indicator)).toEqual(['sleep_hours'])
  })
})

describe('evaluate with the personal pattern model', () => {
  const baseline = history(1, DAY - 1)

  it('gives one insight for a combined shift today, with its key, score and factors', () => {
    const result = evaluate(
      input({ readings: [...baseline, ...today(DAY, SHIFTED)] }),
    )
    expect(result.insights).toHaveLength(1)
    const [insight] = result.insights
    expect(insight?.key).toBe(`personal-pattern:c1:${DAY}`)
    expect(insight?.modelVersion).toBe('test')
    expect(insight?.score).toBeGreaterThan(1)
    expect(insight?.factors.length).toBeGreaterThan(0)
    expect(insight?.factors.length).toBeLessThanOrEqual(3)
    for (const factor of insight?.factors ?? []) {
      expect(factor.contribution).toBeGreaterThan(0)
    }
    expect(result.patternReadiness).toEqual({
      ready: true,
      daysAvailable: 28,
      daysNeeded: 14,
      indicatorsToday: 4,
      indicatorsNeeded: 4,
    })
  })

  it('gives no insight on an ordinary day', () => {
    const result = evaluate(
      input({ readings: [...baseline, ...today(DAY, ORDINARY)] }),
    )
    expect(result.insights).toEqual([])
    expect(result.patternReadiness?.ready).toBe(true)
  })

  it('gives no insight with fewer than four readings today, however far off they are', () => {
    const three = { sleep_hours: -9, heart_rate: 9, mood: -9 }
    const result = evaluate(
      input({ readings: [...baseline, ...today(DAY, three)] }),
    )
    expect(result.insights).toEqual([])
    expect(result.patternReadiness?.indicatorsToday).toBe(3)
  })

  it('before the check-in, counts window days with at least four readings', () => {
    const result = evaluate(input({ readings: baseline }))
    expect(result.insights).toEqual([])
    expect(result.patternReadiness).toEqual({
      ready: true,
      daysAvailable: 28,
      daysNeeded: 14,
      indicatorsToday: 0,
      indicatorsNeeded: 4,
    })
  })

  it('before the check-in, a day with exactly four of the readings counts', () => {
    const fourADay = baseline.filter((entry) => entry.indicator !== 'mood')
    const result = evaluate(input({ readings: fourADay }))
    expect(result.patternReadiness).toMatchObject({
      ready: true,
      daysAvailable: 28,
      indicatorsToday: 0,
    })
    const threeADay = fourADay.filter(
      (entry) => entry.indicator !== 'heart_rate',
    )
    expect(
      evaluate(input({ readings: threeADay })).patternReadiness,
    ).toMatchObject({ ready: false, daysAvailable: 0 })
  })

  it('is not ready early in the mission, even with a large shift', () => {
    const early = 13
    const result = evaluate(
      input({
        nowMs: nineAm(early),
        readings: [...history(1, early - 1), ...today(early, SHIFTED)],
      }),
    )
    expect(result.insights).toEqual([])
    expect(result.patternReadiness).toMatchObject({
      ready: false,
      daysAvailable: 10,
      daysNeeded: 14,
    })
  })

  it('counts only baseline days that have every reading of today', () => {
    const gaps = baseline.filter(
      (entry) =>
        !(entry.indicator === 'mood' && entry.day >= 12 && entry.day <= 26),
    )
    const withMood = evaluate(
      input({ readings: [...gaps, ...today(DAY, ORDINARY)] }),
    )
    expect(withMood.patternReadiness?.daysAvailable).toBe(13)
    expect(withMood.patternReadiness?.ready).toBe(false)
    const withoutMood = evaluate(
      input({ readings: [...gaps, ...today(DAY, without(ORDINARY, 'mood'))] }),
    )
    expect(withoutMood.patternReadiness?.daysAvailable).toBe(28)
  })

  it('never takes an urgent glucose re-check as a fasting value', () => {
    const routine = [
      ...baseline,
      ...today(DAY, without(ORDINARY, 'blood_glucose')),
    ]
    const recheck = reading('blood_glucose', DAY, 250, {
      hour: 9,
      recheck: true,
    })
    const plain = evaluate(
      input({ nowMs: nineAm(DAY) + 3_600_000, readings: routine }),
    )
    const withRecheck = evaluate(
      input({
        nowMs: nineAm(DAY) + 3_600_000,
        readings: [...routine, recheck],
      }),
    )
    expect(withRecheck.patternReadiness).toEqual(plain.patternReadiness)
    expect(withRecheck.patternReadiness?.indicatorsToday).toBe(4)
    expect(withRecheck.insights).toEqual(plain.insights)

    // With a routine fasting value today, a later re-check does not replace it.
    const fasting = [...baseline, ...today(DAY, ORDINARY)]
    const before = evaluate(
      input({ nowMs: nineAm(DAY) + 3_600_000, readings: fasting }),
    )
    const after = evaluate(
      input({
        nowMs: nineAm(DAY) + 3_600_000,
        readings: [...fasting, recheck],
      }),
    )
    expect(after.insights).toEqual(before.insights)
    expect(after.patternReadiness).toEqual(before.patternReadiness)
  })

  it('gives no insight and no error when the readings never vary', () => {
    const flat = baseline.map((entry) => ({ ...entry, value: 5 }))
    const result = evaluate(
      input({ readings: [...flat, ...today(DAY, SHIFTED)] }),
    )
    expect(result.insights).toEqual([])
  })

  it('changes no alert, status or route', () => {
    // Four short nights before today, and today's short night: the rule's 4 of 5.
    const shortNights = [36, 37, 38, 39].map((day) =>
      reading('sleep_hours', day, 4),
    )
    const readings = [
      ...baseline.filter(
        (entry) => !(entry.indicator === 'sleep_hours' && entry.day >= 36),
      ),
      ...shortNights,
      ...today(DAY, SHIFTED),
    ]
    const withModel = evaluate(input({ readings }))
    const without = evaluate(
      input({
        readings,
        models: { sepRisk: null, personalPattern: null, earthHospital: null },
      }),
    )
    expect(withModel.insights).toHaveLength(1)
    expect(without.insights).toEqual([])
    expect(without.patternReadiness).toBeNull()
    expect(withModel.alerts).toEqual(without.alerts)
    expect(withModel.alerts.length).toBeGreaterThan(0)
    expect(withModel.regionStatus).toEqual(without.regionStatus)
    expect(withModel.overall).toBe(without.overall)
  })
})
