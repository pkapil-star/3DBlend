import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assessEarthHospital,
  computeBaseline,
  earthHospitalInsight,
  type Baseline,
  type DailyValue,
  type IndicatorId,
} from '../../engine/index.ts'
import {
  EARTH_HOSPITAL_INDICATORS,
  earthHospitalModelFileSchema,
  indicatorIdSchema,
} from '../../engine/schemas.ts'
import { earthHospitalModel, healthData } from '../index.ts'
import modelJson from '../models/earth-hospital-v1.json'

// The Earth hospital model in the app against what Python computed
// (ARCHITECTURE.md section 26.19). The parity file holds synthetic numbers
// only, never a patient row; the numbers must match within 1e-9.

const TOLERANCE = 1e-9

interface Factor {
  indicator: string
  z: number
  contribution: number
}

const parity = JSON.parse(
  readFileSync(
    join(process.cwd(), 'ml', 'artifacts', 'earth-hospital-v1-parity.json'),
    'utf8',
  ),
) as {
  modelId: string
  version: string
  tolerance: number
  note: string
  zCases: {
    id: string
    z: number[]
    output: number
    notable: boolean
    contributions: number[]
    factors: Factor[]
  }[]
  historyCases: {
    id: string
    today: number
    dailyValues: Record<string, [number, number][]>
    expected: {
      scored: boolean
      output: number | null
      notable: boolean
      z: number[] | null
      factors: Factor[]
    }
  }[]
}

function close(actual: number, expected: number, what: string) {
  expect(
    Math.abs(actual - expected),
    `${what}: ${actual} vs ${expected}`,
  ).toBeLessThanOrEqual(TOLERANCE)
}

function onlyToday(z: number[]) {
  // A one-day history whose baselines put today exactly at z.
  const dailyValues = new Map<IndicatorId, DailyValue[]>()
  const baselines: Partial<Record<IndicatorId, Baseline>> = {}
  earthHospitalModel.features.forEach((feature, index) => {
    dailyValues.set(feature.indicator, [
      { day: 40, atMs: 0, value: z[index] ?? 0 },
    ])
    baselines[feature.indicator] = {
      ready: true,
      n: 28,
      center: 0,
      spread: 1,
      fromDay: 10,
      toDay: 37,
    }
  })
  return { today: 40, dailyValues, baselines }
}

describe('the model file', () => {
  it('parses with its schema: the five shared indicators, in order', () => {
    expect(earthHospitalModelFileSchema.safeParse(modelJson).success).toBe(true)
    expect(
      earthHospitalModel.features.map((feature) => feature.indicator),
    ).toEqual([...EARTH_HOSPITAL_INDICATORS])
  })

  it('says where it learned and that it was never tested on astronauts', () => {
    expect(earthHospitalModel.caveat).toBe(
      'Learned from Earth hospital patients. Never tested on astronauts. A second opinion only.',
    )
    expect(earthHospitalModel.headline).toContain('Earth hospital data')
  })

  it('names no disease and gives no number in anything the crew card shows', () => {
    for (const text of [
      earthHospitalModel.headline,
      earthHospitalModel.notableText,
      earthHospitalModel.caveat,
    ]) {
      expect(text).not.toMatch(/sepsis|septic|infection|diagnos|%|\d/i)
    }
  })

  it('uses daily indicators the app records', () => {
    for (const feature of earthHospitalModel.features) {
      const def = healthData.indicators.find(
        (entry) => entry.id === feature.indicator,
      )
      expect(def?.cadenceDays).toBe(1)
    }
  })
})

describe('parity with Python on synthetic numbers', () => {
  it('holds no patient row', () => {
    expect(parity.note).toContain('Synthetic numbers only')
    expect(JSON.stringify(parity)).not.toMatch(/p\d{6}/)
    expect(parity.modelId).toBe(earthHospitalModel.modelId)
    expect(parity.tolerance).toBe(TOLERANCE)
  })

  it.each(parity.zCases.map((entry) => [entry.id, entry] as const))(
    '%s',
    (_, entry) => {
      const assessed = assessEarthHospital(
        earthHospitalModel,
        onlyToday(entry.z),
      )
      expect(assessed.output).not.toBeNull()
      close(assessed.output ?? Number.NaN, entry.output, 'output')
      expect(assessed.notable).toBe(entry.notable)
      entry.contributions.forEach((value, index) => {
        close(assessed.contributions?.[index] ?? Number.NaN, value, 'term')
      })
      const insight = earthHospitalInsight(
        earthHospitalModel,
        'c1',
        40,
        assessed,
      )
      if (entry.notable) {
        expect(insight?.factors.map((factor) => factor.indicator)).toEqual(
          entry.factors.map((factor) => factor.indicator),
        )
      } else {
        expect(insight).toBeNull()
      }
    },
  )

  it('covers outputs on both sides of the threshold', () => {
    expect(parity.zCases.some((entry) => entry.notable)).toBe(true)
    expect(parity.zCases.some((entry) => !entry.notable)).toBe(true)
  })

  it.each(parity.historyCases.map((entry) => [entry.id, entry] as const))(
    '%s: from daily values, through the app baseline',
    (_, entry) => {
      const dailyValues = new Map<IndicatorId, DailyValue[]>()
      const baselines: Partial<Record<IndicatorId, Baseline>> = {}
      for (const [name, pairs] of Object.entries(entry.dailyValues)) {
        const id = indicatorIdSchema.parse(name)
        const def = healthData.indicators.find((item) => item.id === id)
        if (!def) throw new Error(`unknown indicator ${id}`)
        const values = pairs.map(([day, value]) => ({ day, atMs: 0, value }))
        dailyValues.set(id, values)
        baselines[id] = computeBaseline(values, def, entry.today)
      }
      const assessed = assessEarthHospital(earthHospitalModel, {
        today: entry.today,
        dailyValues,
        baselines,
      })
      const { expected } = entry
      expect(assessed.output !== null).toBe(expected.scored)
      if (expected.output === null || expected.z === null) return
      close(assessed.output ?? Number.NaN, expected.output, 'output')
      expected.z.forEach((value, index) => {
        close(assessed.z?.[index] ?? Number.NaN, value, `z ${index}`)
      })
      expect(assessed.notable).toBe(expected.notable)
    },
  )
})
