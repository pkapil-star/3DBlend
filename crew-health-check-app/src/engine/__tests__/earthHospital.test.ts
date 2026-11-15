import { describe, expect, it } from 'vitest'
import { evaluate } from '../index.ts'
import {
  logisticContribution,
  logisticLogit,
  logisticOutput,
} from '../models/logistic.ts'
import type {
  EarthHospitalModel,
  EvaluationInput,
  IndicatorDef,
  IndicatorId,
  Reading,
} from '../types.ts'
import { GLUCOSE, STATION_LINK, TEMP, nineAm, reading } from './fixtures.ts'

// The Earth hospital model in the engine (ARCHITECTURE.md section 26.19),
// with a small fixture model: it needs today's routine readings of all five
// and five ready baselines, and it only ever gives an insight.

const HEART: IndicatorDef = {
  ...TEMP,
  id: 'heart_rate',
  region: 'heart',
  label: 'Resting heart rate',
  unit: 'bpm',
  step: 1,
  minSpread: 3,
}
const SYSTOLIC: IndicatorDef = {
  ...TEMP,
  id: 'systolic_bp',
  region: 'heart',
  label: 'Blood pressure, upper',
  unit: 'mmHg',
  step: 1,
  minSpread: 5,
}
const DIASTOLIC: IndicatorDef = {
  ...TEMP,
  id: 'diastolic_bp',
  region: 'heart',
  label: 'Blood pressure, lower',
  unit: 'mmHg',
  step: 1,
  minSpread: 4,
}
const DEFS = [HEART, TEMP, SYSTOLIC, DIASTOLIC, GLUCOSE]

const IDS: IndicatorId[] = [
  'heart_rate',
  'body_temp',
  'systolic_bp',
  'diastolic_bp',
  'blood_glucose',
]
const TYPICAL: Record<string, number> = {
  heart_rate: 62,
  body_temp: 36.8,
  systolic_bp: 118,
  diastolic_bp: 75,
  blood_glucose: 90,
}
const SPREAD: Record<string, number> = {
  heart_rate: 3,
  body_temp: 0.2,
  systolic_bp: 5,
  diastolic_bp: 4,
  blood_glucose: 5,
}

// Positive weight on heart rate and temperature only; threshold 0.5.
const MODEL: EarthHospitalModel = {
  modelId: 'earth-hospital',
  version: 'test',
  features: IDS.map((indicator) => ({
    name: `z_${indicator}`,
    indicator,
    physionet: indicator,
    mean: 0,
    scale: 1,
    coef: indicator === 'heart_rate' || indicator === 'body_temp' ? 1 : 0,
  })),
  intercept: -4,
  threshold: 0.5,
  targetFalsePositiveRate: 0.01,
}

const DAY = 40

function wobble(day: number, index: number): number {
  return (((day * (5 + 2 * index)) % 7) - 3) / 3
}

function history(): Reading[] {
  const readings: Reading[] = []
  for (let day = 1; day < DAY; day++) {
    IDS.forEach((id, index) => {
      readings.push(
        reading(
          id,
          day,
          (TYPICAL[id] ?? 0) + (SPREAD[id] ?? 1) * 0.5 * wobble(day, index),
        ),
      )
    })
  }
  return readings
}

/** Today's readings, `shift` spreads above each typical value. */
function today(
  shifts: Partial<Record<IndicatorId, number>>,
  skip?: IndicatorId,
): Reading[] {
  return IDS.filter((id) => id !== skip).map((id) =>
    reading(
      id,
      DAY,
      (TYPICAL[id] ?? 0) + (shifts[id] ?? 0) * (SPREAD[id] ?? 1),
    ),
  )
}

function input(
  readings: Reading[],
  model: EarthHospitalModel | null = MODEL,
): EvaluationInput {
  return {
    nowMs: nineAm(DAY) + 3_600_000,
    crewId: 'c1',
    readings,
    symptoms: [],
    context: [],
    link: STATION_LINK,
    indicators: DEFS,
    rules: [],
    spaceWeather: [],
    models: { sepRisk: null, personalPattern: null, earthHospital: model },
  }
}

const hospitalInsights = (readings: Reading[]) =>
  evaluate(input(readings)).insights.filter(
    (insight) => insight.modelId === 'earth-hospital',
  )

describe('the shared logistic helper', () => {
  it('standardizes, weighs and sums, then squashes to 0..1', () => {
    const feature = { mean: 1, scale: 2, coef: 3 }
    expect(logisticContribution(feature, 5)).toBe(6)
    expect(logisticLogit(-1, [feature, feature], [5, 1])).toBe(5)
    expect(logisticOutput(0)).toBe(0.5)
  })
})

describe('evaluate with the Earth hospital model', () => {
  it('gives an insight when heart rate and temperature rise together', () => {
    const [insight] = hospitalInsights([
      ...history(),
      ...today({ heart_rate: 3, body_temp: 3 }),
    ])
    expect(insight?.key).toBe(`earth-hospital:c1:${DAY}`)
    expect(insight?.score).toBeGreaterThanOrEqual(MODEL.threshold)
    expect(new Set(insight?.factors.map((factor) => factor.indicator))).toEqual(
      new Set(['heart_rate', 'body_temp']),
    )
  })

  it('gives none below its threshold', () => {
    expect(hospitalInsights([...history(), ...today({})])).toEqual([])
  })

  it('needs all five readings today', () => {
    const readings = [
      ...history(),
      ...today({ heart_rate: 3, body_temp: 3 }, 'blood_glucose'),
    ]
    expect(hospitalInsights(readings)).toEqual([])
  })

  it('never takes an urgent glucose re-check as today’s value', () => {
    const recheck = reading('blood_glucose', DAY, 90, {
      hour: 9,
      recheck: true,
    })
    const readings = [
      ...history(),
      ...today({ heart_rate: 3, body_temp: 3 }, 'blood_glucose'),
      recheck,
    ]
    expect(hospitalInsights(readings)).toEqual([])
  })

  it('needs five ready baselines: none early in the mission', () => {
    const early = history().filter((entry) => entry.day <= 5)
    const readings = [...early, ...today({ heart_rate: 3, body_temp: 3 })]
    expect(hospitalInsights(readings)).toEqual([])
  })

  it('changes no alert, status or route, and sends nothing', () => {
    const readings = [...history(), ...today({ heart_rate: 3, body_temp: 3 })]
    const loaded = evaluate(input(readings))
    const off = evaluate(input(readings, null))
    expect(loaded.insights.length).toBeGreaterThan(off.insights.length)
    expect(loaded.alerts).toEqual(off.alerts)
    expect(loaded.regionStatus).toEqual(off.regionStatus)
    expect(loaded.overall).toBe(off.overall)
  })
})
