import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assessPattern,
  computeBaseline,
  ledoitWolfSecondMoment,
  patternFactors,
  scoreToday,
  type Baseline,
  type DailyValue,
  type IndicatorId,
  type PatternReadiness,
} from '../../engine/index.ts'
import {
  indicatorIdSchema,
  personalPatternModelFileSchema,
} from '../../engine/schemas.ts'
import { healthData, personalPatternModel } from '../index.ts'
import modelJson from '../models/personal-pattern-v1.json'

// The personal pattern model in the app against what Python computed
// (ARCHITECTURE.md section 26.18). The parity file is written by
// ml/eval_personal_pattern.py; the numbers must match within 1e-9.

const TOLERANCE = 1e-9

interface MatrixCase {
  id: string
  rows: number[][]
  z: number[]
  shrinkage: number
  matrix: number[][]
  squaredDistance: number
  contributions: number[]
  looDistances: number[]
  maxLoo: number
  score: number | null
  notable: boolean
}

interface HistoryCase {
  id: string
  today: number
  dailyValues: Record<string, [number, number][]>
  expected: {
    readiness: PatternReadiness
    indicators: string[]
    z: number[] | null
    squaredDistance: number | null
    maxLoo: number | null
    score: number | null
    notable: boolean
    factors: { indicator: string; z: number; contribution: number }[]
  }
}

const parity = JSON.parse(
  readFileSync(
    join(process.cwd(), 'ml', 'artifacts', 'personal-pattern-v1-parity.json'),
    'utf8',
  ),
) as {
  modelId: string
  version: string
  tolerance: number
  matrixCases: MatrixCase[]
  historyCases: HistoryCase[]
}

function expectClose(actual: number, expected: number, what: string) {
  expect(
    Math.abs(actual - expected),
    `${what}: ${actual} vs ${expected}`,
  ).toBeLessThanOrEqual(TOLERANCE)
}

function expectAllClose(
  actual: readonly number[],
  expected: readonly number[],
  what: string,
) {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => {
    expectClose(actual[index] ?? Number.NaN, value, `${what}[${index}]`)
  })
}

describe('the model file', () => {
  it('parses with its schema and says its evaluation is simulated', () => {
    expect(personalPatternModelFileSchema.safeParse(modelJson).success).toBe(
      true,
    )
    expect(personalPatternModel.modelId).toBe('personal-pattern')
    expect(personalPatternModel.kind).toBe('shrinkage-mahalanobis')
    expect(personalPatternModel.evaluation.simulated).toBe(true)
    expect(personalPatternModel.caveat).toContain(
      'Tested only on simulated data',
    )
  })

  it('uses daily indicators only, and never exercise (incomplete until the day ends)', () => {
    for (const id of personalPatternModel.indicators) {
      const def = healthData.indicators.find((entry) => entry.id === id)
      expect(def?.cadenceDays).toBe(1)
    }
    expect(personalPatternModel.indicators).not.toContain('exercise_minutes')
  })

  it('belongs to the parity file', () => {
    expect(parity.modelId).toBe(personalPatternModel.modelId)
    expect(parity.version).toBe(personalPatternModel.version)
    expect(parity.tolerance).toBe(TOLERANCE)
  })
})

describe('parity with Python: z-score matrices', () => {
  it.each(parity.matrixCases.map((entry) => [entry.id, entry] as const))(
    '%s',
    (_, entry) => {
      const fitted = ledoitWolfSecondMoment(entry.rows)
      expectClose(fitted.shrinkage, entry.shrinkage, 'shrinkage')
      entry.matrix.forEach((row, index) => {
        expectAllClose(fitted.matrix[index] ?? [], row, `matrix row ${index}`)
      })
      const score = scoreToday(entry.rows, entry.z)
      expect(score).not.toBeNull()
      if (!score) return
      expectClose(score.squaredDistance, entry.squaredDistance, 'distance')
      expectAllClose(score.contributions, entry.contributions, 'contributions')
      expectAllClose(score.looDistances, entry.looDistances, 'leave-one-out')
      expectClose(score.maxLoo, entry.maxLoo, 'largest leave-one-out')
      if (entry.score === null) expect(score.score).toBeNull()
      else expectClose(score.score ?? Number.NaN, entry.score, 'score')
      expect(score.notable).toBe(entry.notable)
    },
  )

  it('covers a notable day, an ordinary day and a negative contribution', () => {
    const cases = parity.matrixCases
    expect(cases.some((entry) => entry.notable)).toBe(true)
    expect(cases.some((entry) => !entry.notable)).toBe(true)
    expect(
      cases.some((entry) => entry.contributions.some((value) => value < 0)),
    ).toBe(true)
  })
})

describe('parity with Python: whole histories', () => {
  it.each(parity.historyCases.map((entry) => [entry.id, entry] as const))(
    '%s',
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
      const assessed = assessPattern(personalPatternModel, {
        today: entry.today,
        dailyValues,
        baselines,
      })
      const { expected } = entry
      expect(assessed.readiness).toEqual(expected.readiness)
      expect(assessed.indicators).toEqual(expected.indicators)
      if (expected.z === null) {
        expect(assessed.z).toBeNull()
      } else {
        expectAllClose(assessed.z ?? [], expected.z, 'z')
      }
      if (expected.squaredDistance === null) {
        expect(assessed.score).toBeNull()
        return
      }
      const score = assessed.score
      expect(score).not.toBeNull()
      if (!score || !assessed.z) return
      expectClose(score.squaredDistance, expected.squaredDistance, 'distance')
      expectClose(score.maxLoo, expected.maxLoo ?? Number.NaN, 'max LOO')
      expectClose(
        score.score ?? Number.NaN,
        expected.score ?? Number.NaN,
        'score',
      )
      expect(score.notable).toBe(expected.notable)
      const factors = patternFactors(
        assessed.indicators,
        assessed.z,
        score.contributions,
      )
      expect(factors.map((factor) => factor.indicator)).toEqual(
        expected.factors.map((factor) => factor.indicator),
      )
      factors.forEach((factor, index) => {
        expectClose(factor.z, expected.factors[index]?.z ?? Number.NaN, 'z')
        expectClose(
          factor.contribution,
          expected.factors[index]?.contribution ?? Number.NaN,
          'contribution',
        )
      })
    },
  )
})
