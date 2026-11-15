import { describe, expect, it } from 'vitest'
import { lastReadingPerDay, latestReading } from '../baseline.ts'
import { evaluate } from '../index.ts'
import type { EvaluationInput } from '../types.ts'
import {
  ALL_FIXTURE_INDICATORS,
  GLUCOSE,
  STATION_LINK,
  nineAm,
  reading,
  sample,
  series,
  testRule,
} from './fixtures.ts'

// Routine readings and urgent re-checks are different things: a blood sugar
// re-check 15 minutes after an alert is not a fasting value. Re-checks count
// for "latest" rules, but never for baselines, streaks, averages or overdue.

const lowGlucose = testRule({
  id: 'R-LOW-01',
  region: 'core',
  severity: 'act',
  when: {
    type: 'latest',
    indicator: 'blood_glucose',
    test: { kind: 'absolute', op: 'lt', value: 70 },
  },
})

const highAverage = testRule({
  id: 'R-AVG-01',
  region: 'core',
  when: {
    type: 'average',
    indicator: 'blood_glucose',
    windowDays: 3,
    minReadings: 3,
    test: { kind: 'absolute', op: 'gte', value: 100 },
  },
})

function input(overrides: Partial<EvaluationInput>): EvaluationInput {
  return {
    nowMs: nineAm(40),
    crewId: 'c1',
    readings: [],
    symptoms: [],
    context: [sample(40)],
    link: STATION_LINK,
    indicators: ALL_FIXTURE_INDICATORS,
    rules: [lowGlucose, highAverage],
    spaceWeather: [],
    models: { sepRisk: null, personalPattern: null, earthHospital: null },
    ...overrides,
  }
}

const ROUTINE = series(
  'blood_glucose',
  25,
  Array.from({ length: 15 }, () => 90),
)

describe('latestReading and lastReadingPerDay', () => {
  const readings = [
    reading('blood_glucose', 40, 62, { hour: 7 }),
    reading('blood_glucose', 40, 95, { hour: 8, recheck: true }),
  ]

  it('latest includes the re-check', () => {
    expect(latestReading(readings, 'blood_glucose')).toMatchObject({
      value: 95,
      recheck: true,
    })
  })

  it('the day keeps its routine reading: the re-check does not replace it', () => {
    expect(lastReadingPerDay(readings, 'blood_glucose')).toEqual([
      expect.objectContaining({ day: 40, value: 62 }),
    ])
  })

  it('with equal times, the reading entered later is the latest', () => {
    const sameTime = [
      reading('blood_glucose', 40, 62, { hour: 8 }),
      reading('blood_glucose', 40, 91, { hour: 8, recheck: true }),
    ]
    expect(latestReading(sameTime, 'blood_glucose')?.value).toBe(91)
  })
})

describe('re-checks in evaluate()', () => {
  it('a normal re-check clears a "latest" alert', () => {
    const low = evaluate(
      input({
        readings: [...ROUTINE, reading('blood_glucose', 40, 62, { hour: 7 })],
      }),
    )
    expect(low.alerts.map((alert) => alert.ruleId)).toEqual(['R-LOW-01'])

    const cleared = evaluate(
      input({
        readings: [
          ...ROUTINE,
          reading('blood_glucose', 40, 62, { hour: 7 }),
          reading('blood_glucose', 40, 96, { hour: 8, recheck: true }),
        ],
      }),
    )
    expect(cleared.alerts).toEqual([])
  })

  it('a still-low re-check keeps the alert and is labeled as a re-check', () => {
    const result = evaluate(
      input({
        readings: [
          ...ROUTINE,
          reading('blood_glucose', 40, 62, { hour: 7 }),
          reading('blood_glucose', 40, 64, { hour: 8, recheck: true }),
        ],
      }),
    )
    expect(result.alerts.map((alert) => alert.ruleId)).toEqual(['R-LOW-01'])
    // Never "Fasting blood sugar …": a re-check is not a fasting value.
    expect(result.alerts[0]?.evidence[0]).toMatchObject({
      label: 'Blood sugar re-check (not fasting), latest',
      value: '64 mg/dL on day 40',
    })
  })

  it('names a re-check "<label> re-check" when the indicator has no re-check label', () => {
    // No exactOptionalPropertyTypes, so an undefined label means "not set".
    const plainGlucose = { ...GLUCOSE, recheckLabel: undefined }
    const result = evaluate(
      input({
        indicators: ALL_FIXTURE_INDICATORS.map((def) =>
          def.id === 'blood_glucose' ? plainGlucose : def,
        ),
        readings: [
          ...ROUTINE,
          reading('blood_glucose', 40, 64, { hour: 8, recheck: true }),
        ],
      }),
    )
    expect(result.alerts[0]?.evidence[0]?.label).toBe(
      'Fasting blood sugar re-check, latest',
    )
  })

  it('re-checks never enter the baseline', () => {
    const rechecks = [26, 28, 30, 32, 34].map((day) =>
      reading('blood_glucose', day, 180, { hour: 12, recheck: true }),
    )
    const withRechecks = evaluate(
      input({ readings: [...ROUTINE, ...rechecks] }),
    )
    const without = evaluate(input({ readings: ROUTINE }))
    expect(withRechecks.baselines.blood_glucose).toEqual(
      without.baselines.blood_glucose,
    )
    expect(withRechecks.baselines.blood_glucose).toMatchObject({
      ready: true,
      center: 90,
    })
  })

  it('re-checks never count in an average', () => {
    const highRechecks = [38, 39, 40].map((day) =>
      reading('blood_glucose', day, 160, { hour: 8, recheck: true }),
    )
    const routineDays = series('blood_glucose', 38, [90, 90])
    const result = evaluate(
      input({ readings: [...ROUTINE, ...routineDays, ...highRechecks] }),
    )
    expect(result.alerts.map((alert) => alert.ruleId)).not.toContain('R-AVG-01')
  })

  it('a re-check does not make a routine measurement count as done', () => {
    const onlyRecheck = evaluate(
      input({
        readings: [
          reading('blood_glucose', 40, 95, { hour: 8, recheck: true }),
        ],
      }),
    )
    expect(onlyRecheck.overdue).toContain('blood_glucose')
  })
})
