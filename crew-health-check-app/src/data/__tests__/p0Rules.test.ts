import { describe, expect, it } from 'vitest'
import { MS_PER_DAY, evaluate } from '../../engine/index.ts'
import type {
  ContextSample,
  EvaluationInput,
  Reading,
} from '../../engine/index.ts'
import { healthData } from '../index.ts'

// The six P0 rules from rules.json, run through evaluate() on small hand-made
// histories. Golden scenario files arrive in M2.

const DAY = 40
const NOW = (DAY - 1) * MS_PER_DAY + 9 * 3_600_000

function reading(
  indicator: Reading['indicator'],
  day: number,
  value: number,
  crewId = 'c1',
  hour = 8,
): Reading {
  return {
    crewId,
    indicator,
    value,
    day,
    atMs: (day - 1) * MS_PER_DAY + hour * 3_600_000,
    origin: 'seed',
  }
}

function days(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index)
}

function sample(
  day: number,
  fields: Partial<ContextSample> = {},
): ContextSample {
  return {
    day,
    cabin_co2: 2,
    radiation_dose: 0.5,
    solar_event: false,
    ...fields,
  }
}

// Two weeks of ordinary readings before today: ready baselines, no rule met.
const NORMAL: Reading[] = days(25, 39).flatMap((day) => [
  reading('sleep_hours', day, 7),
  reading('body_temp', day, 36.9),
  reading('blood_glucose', day, 90),
])
const QUIET_CONTEXT = days(25, 40).map((day) => sample(day))

function run(
  readings: Reading[],
  context: ContextSample[] = QUIET_CONTEXT,
  crewId = 'c1',
) {
  const input: EvaluationInput = {
    nowMs: NOW,
    crewId,
    readings,
    symptoms: [],
    context,
    link: { oneWayDelaySec: 0, linkUp: true, groundHandlingMin: 5 },
    indicators: healthData.indicators,
    rules: healthData.rules,
    spaceWeather: [],
    models: { sepRisk: null, personalPattern: null, earthHospital: null },
  }
  return evaluate(input)
}

function activeRuleIds(result: ReturnType<typeof run>): string[] {
  return result.alerts
    .filter((alert) => alert.supersededBy === null)
    .map((alert) => alert.ruleId)
}

describe('the six P0 rules', () => {
  it('a quiet history raises no alert', () => {
    expect(run([...NORMAL, reading('body_temp', DAY, 36.9)]).alerts).toEqual([])
  })

  it('R-SLEEP-01: four of the last five nights at least an hour under normal', () => {
    const shortNights = [36, 37, 38, 39, 40].map((day) =>
      reading('sleep_hours', day, 5.5),
    )
    const base = NORMAL.filter(
      (entry) => !(entry.indicator === 'sleep_hours' && entry.day >= 36),
    )
    const result = run([...base, ...shortNights])
    expect(activeRuleIds(result)).toEqual(['R-SLEEP-01'])
    expect(result.regionStatus.head).toBe('watch')
  })

  it('R-TEMP-01: 1.0 °C above normal is watch; 0.9 °C above is not', () => {
    expect(
      activeRuleIds(run([...NORMAL, reading('body_temp', DAY, 37.9)])),
    ).toEqual(['R-TEMP-01'])
    expect(
      activeRuleIds(run([...NORMAL, reading('body_temp', DAY, 37.8)])),
    ).toEqual([])
  })

  it('R-TEMP-02 supersedes R-TEMP-01 at 2.0 °C above normal', () => {
    const result = run([...NORMAL, reading('body_temp', DAY, 38.9)])
    expect(
      result.alerts.map((alert) => [alert.ruleId, alert.supersededBy]),
    ).toEqual([
      ['R-TEMP-01', 'R-TEMP-02'],
      ['R-TEMP-02', null],
    ])
    expect(result.regionStatus.core).toBe('act')
    expect(result.overall).toBe('act')
  })

  it('R-TEMP-02 fires at 39.0 °C even before a baseline exists', () => {
    const result = run([reading('body_temp', DAY, 39.0)])
    expect(activeRuleIds(result)).toEqual(['R-TEMP-02'])
    expect(result.alerts.map((alert) => alert.ruleId)).not.toContain(
      'R-TEMP-01',
    )
  })

  it('R-GLU-02: a reading under 70 mg/dL, with or without a baseline', () => {
    expect(
      activeRuleIds(run([...NORMAL, reading('blood_glucose', DAY, 69)])),
    ).toEqual(['R-GLU-02'])
    expect(activeRuleIds(run([reading('blood_glucose', DAY, 64)]))).toEqual([
      'R-GLU-02',
    ])
    expect(
      activeRuleIds(run([...NORMAL, reading('blood_glucose', DAY, 70)])),
    ).toEqual([])
  })

  it('R-CO2-01: today above 3.0 mmHg, not at it', () => {
    const high = [
      ...QUIET_CONTEXT.slice(0, -1),
      sample(DAY, { cabin_co2: 3.1 }),
    ]
    const atLimit = [
      ...QUIET_CONTEXT.slice(0, -1),
      sample(DAY, { cabin_co2: 3.0 }),
    ]
    expect(activeRuleIds(run(NORMAL, high))).toEqual(['R-CO2-01'])
    expect(activeRuleIds(run(NORMAL, atLimit))).toEqual([])
  })

  it('R-RAD-01: a solar particle event in progress today', () => {
    const storm = [
      ...QUIET_CONTEXT.slice(0, -1),
      sample(DAY, { solar_event: true }),
    ]
    const result = run(NORMAL, storm)
    expect(activeRuleIds(result)).toEqual(['R-RAD-01'])
    expect(result.regionStatus.whole_body).toBe('act')
  })

  it('gives one alert per rule per crew member', () => {
    const bothCrew = [
      ...NORMAL,
      ...NORMAL.map((entry) => ({ ...entry, crewId: 'c2' })),
      reading('blood_glucose', DAY, 60, 'c1', 7),
      reading('blood_glucose', DAY, 62, 'c1', 8),
      reading('blood_glucose', DAY, 61, 'c2'),
    ]
    const c1 = run(bothCrew)
    const c2 = run(bothCrew, QUIET_CONTEXT, 'c2')
    expect(c1.alerts.map((alert) => alert.key)).toEqual(['R-GLU-02:c1'])
    expect(c2.alerts.map((alert) => alert.key)).toEqual(['R-GLU-02:c2'])
  })

  it('missing data raises no alert and shows No data', () => {
    const result = run([], [])
    expect(result.alerts).toEqual([])
    expect(result.regionStatus.core).toBe('no_data')
    expect(result.overdue).toHaveLength(10)
  })

  it('a missing habitat sample shows Environment as No data, not as a normal reading', () => {
    const noSampleToday = QUIET_CONTEXT.slice(0, -1)
    const missing = run(NORMAL, noSampleToday)
    expect(missing.regionStatus.whole_body).toBe('no_data')
    expect(missing.missingFeeds).toEqual([
      'cabin_co2',
      'radiation_cumulative',
      'solar_event',
    ])
    expect(run(NORMAL).regionStatus.whole_body).toBe('good')
  })

  it('keeps the missing-data list while an act alert shows', () => {
    const result = run(
      [...NORMAL, reading('blood_glucose', DAY, 64)],
      QUIET_CONTEXT.slice(0, -1),
    )
    expect(activeRuleIds(result)).toEqual(['R-GLU-02'])
    expect(result.regionStatus.core).toBe('act')
    expect(result.regionGaps.whole_body.missingFeeds).toHaveLength(3)
    expect(result.regionGaps.eyes.overdue).toEqual(['near_vision'])
  })
})
