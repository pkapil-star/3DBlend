import { describe, expect, it } from 'vitest'
import { evaluate } from '../index.ts'
import type { EvaluationInput } from '../types.ts'
import {
  ALL_FIXTURE_INDICATORS,
  STATION_LINK,
  nineAm,
  reading,
  sample,
  series,
  testRule,
} from './fixtures.ts'

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

function input(overrides: Partial<EvaluationInput>): EvaluationInput {
  return {
    nowMs: nineAm(40),
    crewId: 'c1',
    readings: [],
    symptoms: [],
    context: [],
    link: STATION_LINK,
    indicators: ALL_FIXTURE_INDICATORS,
    rules: [sleepRule],
    spaceWeather: [],
    models: { sepRisk: null, personalPattern: null, earthHospital: null },
    ...overrides,
  }
}

const NORMAL_SLEEP = series(
  'sleep_hours',
  20,
  Array.from({ length: 16 }, () => 7),
)
const SHORT_NIGHTS = series('sleep_hours', 36, [5, 5, 5, 5, 5])

describe('evaluate', () => {
  it('raises the sleep alert and rolls it up to the Head region', () => {
    const result = evaluate(
      input({ readings: [...NORMAL_SLEEP, ...SHORT_NIGHTS] }),
    )
    expect(result.alerts.map((alert) => alert.key)).toEqual(['R-TEST-01:c1'])
    expect(result.regionStatus.head).toBe('watch')
    expect(result.baselines.sleep_hours).toMatchObject({
      ready: true,
      center: 7,
    })
  })

  it('ignores readings after the mission clock', () => {
    // The 5th short night is logged at 21:00 on day 40, after the 09:00 evaluation.
    const lateNight = [
      ...series('sleep_hours', 36, [5, 5, 5]),
      reading('sleep_hours', 40, 5, { hour: 21 }),
    ]
    const result = evaluate(
      input({ readings: [...NORMAL_SLEEP, ...lateNight] }),
    )
    expect(result.alerts).toEqual([])
  })

  it("ignores another crew member's readings", () => {
    const otherCrew = SHORT_NIGHTS.map((entry) => ({ ...entry, crewId: 'c2' }))
    const result = evaluate(
      input({ readings: [...NORMAL_SLEEP, ...otherCrew] }),
    )
    expect(result.alerts).toEqual([])
    const forC2 = evaluate(
      input({ crewId: 'c2', readings: [...NORMAL_SLEEP, ...otherCrew] }),
    )
    expect(forC2.alerts).toEqual([])
    expect(forC2.baselines.sleep_hours).toMatchObject({ ready: false })
  })

  it('lists overdue indicators and shows No data where nothing is recorded', () => {
    const result = evaluate(input({ readings: NORMAL_SLEEP.slice(0, 14) }))
    // Sleep was last recorded on day 33, more than 2 days before day 40.
    expect(result.overdue).toEqual([
      'sleep_hours',
      'body_temp',
      'blood_glucose',
      'near_vision',
    ])
    expect(result.regionStatus.core).toBe('no_data')
    expect(result.overall).toBe('no_data')
  })

  it('is good overall when everything is recorded and no rule is met', () => {
    const readings = [
      ...NORMAL_SLEEP,
      ...series('sleep_hours', 36, [7, 7, 7, 7, 7]),
      reading('body_temp', 40, 36.9),
      reading('blood_glucose', 40, 90),
      reading('near_vision', 35, 8),
    ]
    const result = evaluate(input({ readings, context: [sample(40)] }))
    expect(result.alerts).toEqual([])
    expect(result.overdue).toEqual([])
    expect(result.overall).toBe('good')
  })

  it('reports baselines that are not ready instead of guessing', () => {
    const result = evaluate(
      input({ readings: series('sleep_hours', 35, [7, 7, 7]) }),
    )
    expect(result.baselines.sleep_hours).toEqual({
      ready: false,
      n: 3,
      needed: 7,
    })
    expect(result.baselines.body_temp).toEqual({
      ready: false,
      n: 0,
      needed: 7,
    })
  })

  it('keeps missing habitat feeds distinguishable from normal readings', () => {
    const missing = evaluate(input({ context: [] }))
    expect(missing.missingFeeds).toEqual([
      'cabin_co2',
      'radiation_cumulative',
      'solar_event',
    ])
    expect(missing.regionStatus.whole_body).toBe('no_data')

    const stale = evaluate(input({ context: [sample(39)] }))
    expect(stale.regionStatus.whole_body).toBe('no_data')

    const normal = evaluate(input({ context: [sample(40)] }))
    expect(normal.missingFeeds).toEqual([])
    expect(normal.regionStatus.whole_body).toBe('good')
  })

  it('reports missing data next to an active alert', () => {
    // A cumulative-dose rule can still be met from earlier days while today's
    // sample is missing: the alert shows, and so does the gap.
    const doseRule = testRule({
      id: 'R-DOSE-01',
      region: 'whole_body',
      when: {
        type: 'context',
        feed: 'radiation_cumulative',
        windowDays: 1,
        test: { kind: 'absolute', op: 'gte', value: 1 },
      },
    })
    const glucoseRule = testRule({
      id: 'R-LOW-01',
      region: 'core',
      severity: 'act',
      when: {
        type: 'latest',
        indicator: 'blood_glucose',
        test: { kind: 'absolute', op: 'lt', value: 70 },
      },
    })
    const result = evaluate(
      input({
        rules: [doseRule, glucoseRule],
        readings: [reading('blood_glucose', 40, 60)],
        context: [
          sample(38, { radiation_dose: 0.6 }),
          sample(39, { radiation_dose: 0.6 }),
        ],
      }),
    )
    expect(result.regionStatus.core).toBe('act')
    expect(result.regionGaps.core.overdue).toEqual(['body_temp'])
    expect(result.regionStatus.whole_body).toBe('watch')
    expect(result.regionGaps.whole_body.missingFeeds).toEqual([
      'cabin_co2',
      'radiation_cumulative',
      'solar_event',
    ])
    expect(result.overall).toBe('act')
  })

  it('gives the same evaluation for the same input', () => {
    const data = input({ readings: [...NORMAL_SLEEP, ...SHORT_NIGHTS] })
    expect(evaluate(data)).toEqual(evaluate(data))
  })
})
