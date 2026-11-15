import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MS_PER_DAY,
  evaluate,
  flareFeatures,
  sepRiskProbability,
  sepRiskScore,
  topFactors,
  type FlareInput,
  type SepRiskModel,
} from '../../engine/index.ts'
import {
  SEP_RISK_FEATURE_NAMES,
  scenarioFileSchema,
  sepRiskModelFileSchema,
} from '../../engine/schemas.ts'
import { healthData, sepRiskModel } from '../index.ts'
import modelJson from '../models/sep-risk-v1.json'

// The trained model in the app against what Python exported (ARCHITECTURE.md
// section 26.12). The model, its threshold and the parity rows are frozen
// outputs of ml/train_sep_risk.py; nothing here changes or re-fits them.

const ROOT = process.cwd()

function readText(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8')
}

interface ParityRow {
  donkiId: string
  input: FlareInput
  features: Record<string, number>
  probability: number
}

const parity = JSON.parse(
  readText('ml', 'artifacts', 'sep-risk-v1-parity.json'),
) as { modelId: string; version: string; rows: ParityRow[] }

describe('the model file', () => {
  it('parses with its schema', () => {
    expect(sepRiskModelFileSchema.safeParse(modelJson).success).toBe(true)
    expect(sepRiskModel.modelId).toBe('sep-risk')
    expect(sepRiskModel.kind).toBe('logistic-regression')
  })

  it('is the file Python wrote, byte for byte', () => {
    expect(readText('src', 'data', 'models', 'sep-risk-v1.json')).toBe(
      readText('ml', 'artifacts', 'sep-risk-v1.json'),
    )
  })

  it('has the eight features in the order of ml/features.py', () => {
    expect(sepRiskModel.features.map((feature) => feature.name)).toEqual([
      ...SEP_RISK_FEATURE_NAMES,
    ])
    expect(
      sepRiskModel.features
        .filter((feature) => feature.impute !== null)
        .map((feature) => feature.name),
    ).toEqual(['log1p_duration_min'])
  })

  it('keeps the threshold and every parameter at full precision', () => {
    const raw = JSON.parse(
      readText('ml', 'artifacts', 'sep-risk-v1.json'),
    ) as SepRiskModel
    expect(sepRiskModel.threshold).toBe(raw.threshold)
    expect(sepRiskModel.intercept).toBe(raw.intercept)
    expect(sepRiskModel.features).toEqual(raw.features)
    // Not a rounded value: the file carries the unrounded number.
    expect(String(sepRiskModel.threshold).length).toBeGreaterThan(10)
  })

  it('names only sources that are in the registry', () => {
    for (const id of sepRiskModel.sourceIds) {
      expect(healthData.sources.map((source) => source.id)).toContain(id)
    }
  })

  it.each([
    [
      'features in another order',
      { features: [...modelJson.features].reverse() },
    ],
    ['a missing feature', { features: modelJson.features.slice(1) }],
    [
      'a duration feature with nothing for a missing end time',
      {
        features: modelJson.features.map((feature) => ({
          ...feature,
          impute: null,
        })),
      },
    ],
    ['a threshold of 0', { threshold: 0 }],
    ['a threshold of 1', { threshold: 1 }],
    ['a scale of 0', { features: [{ ...modelJson.features[0], scale: 0 }] }],
    ['another model id', { modelId: 'other' }],
    ['no metrics', { metrics: undefined }],
    ['no limitations', { limitations: [] }],
  ])('is refused with %s', (_name, change) => {
    expect(
      sepRiskModelFileSchema.safeParse({ ...modelJson, ...change }).success,
    ).toBe(false)
  })
})

describe('parity with Python (ml/artifacts/sep-risk-v1-parity.json)', () => {
  it('covers all 50 exported flares of this model version', () => {
    expect(parity.rows).toHaveLength(50)
    expect(parity.modelId).toBe(sepRiskModel.modelId)
    expect(parity.version).toBe(sepRiskModel.version)
  })

  it('includes flares with and without a CME; no test-year flare lacks an end time', () => {
    expect(parity.rows.some((row) => row.input.cme === null)).toBe(true)
    expect(parity.rows.some((row) => row.input.cme !== null)).toBe(true)
    // The test years hold no flare without a usable end time, so the frozen
    // parity file cannot cover that path. The next test covers it.
    expect(parity.rows.every((row) => row.input.durationMin !== null)).toBe(
      true,
    )
  })

  it("a flare without an end time takes the model file's own value, as ml/features.py does", () => {
    const duration = sepRiskModel.features.findIndex(
      (feature) => feature.name === 'log1p_duration_min',
    )
    const impute = sepRiskModel.features[duration]?.impute
    expect(impute).toBeTypeOf('number')
    for (const row of parity.rows) {
      const input = { ...row.input, durationMin: null }
      const values = flareFeatures(sepRiskModel, input)
      // Only the duration feature changes, and it is exactly the stored value.
      sepRiskModel.features.forEach((feature, index) => {
        const expected =
          index === duration ? impute : row.features[feature.name]
        expect(
          Math.abs((values?.[index] ?? NaN) - (expected ?? NaN)),
        ).toBeLessThanOrEqual(1e-12)
      })
      let logit = sepRiskModel.intercept
      sepRiskModel.features.forEach((feature, index) => {
        const value =
          index === duration
            ? (impute ?? NaN)
            : (row.features[feature.name] ?? NaN)
        logit += (feature.coef * (value - feature.mean)) / feature.scale
      })
      expect(
        Math.abs(
          (sepRiskProbability(sepRiskModel, input) ?? NaN) -
            1 / (1 + Math.exp(-logit)),
        ),
      ).toBeLessThanOrEqual(1e-12)
    }
  })

  it.each(parity.rows.map((row) => [row.donkiId, row] as const))(
    '%s: each feature within 1e-12 and the output within 1e-9',
    (_id, row) => {
      const values = flareFeatures(sepRiskModel, row.input)
      expect(values).not.toBeNull()
      sepRiskModel.features.forEach((feature, index) => {
        const expected = row.features[feature.name]
        expect(expected).toBeTypeOf('number')
        expect(
          Math.abs((values?.[index] ?? NaN) - (expected ?? NaN)),
        ).toBeLessThanOrEqual(1e-12)
      })
      const output = sepRiskProbability(sepRiskModel, row.input)
      expect(Math.abs((output ?? NaN) - row.probability)).toBeLessThanOrEqual(
        1e-9,
      )
    },
  )

  it('the intercept plus all contributions is the logit, for every row', () => {
    for (const row of parity.rows) {
      const total = topFactors(sepRiskModel, row.input, 99).reduce(
        (sum, factor) => sum + factor.contribution,
        sepRiskModel.intercept,
      )
      const logit = Math.log(row.probability / (1 - row.probability))
      expect(Math.abs(total - logit)).toBeLessThanOrEqual(1e-9)
    }
  })

  it('gives the five display groups, largest contribution first', () => {
    const [row] = parity.rows
    if (!row) throw new Error('the parity file has no rows')
    const factors = topFactors(sepRiskModel, row.input, 99)
    expect(factors.map((factor) => factor.group).sort()).toEqual([
      'CME',
      'Duration',
      'Flare class',
      'Rise time',
      'Source location',
    ])
    const sizes = factors.map((factor) => Math.abs(factor.contribution))
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    expect(topFactors(sepRiskModel, row.input, 3)).toHaveLength(3)
  })
})

describe('R-RAD-03 with the real model and the solar-flare-watch scenario', () => {
  const scenario = scenarioFileSchema.parse(
    JSON.parse(readText('public', 'seed', 'solar-flare-watch.json')),
  )
  const [flare] = scenario.spaceWeather
  if (!flare) throw new Error('solar-flare-watch has no flare')
  const output = sepRiskProbability(sepRiskModel, flare) ?? NaN

  function alertsWith(model: SepRiskModel | null, oneWayDelaySec = 180) {
    return evaluate({
      nowMs: (scenario.missionDay - 1) * MS_PER_DAY + 9 * 3_600_000,
      crewId: 'c1',
      readings: scenario.readings,
      symptoms: scenario.symptoms,
      context: scenario.context,
      link: { oneWayDelaySec, linkUp: true, groundHandlingMin: 5 },
      indicators: healthData.indicators,
      rules: healthData.rules,
      spaceWeather: scenario.spaceWeather,
      models: { sepRisk: model, personalPattern: null, earthHospital: null },
    }).alerts
  }

  it('raises the outlook because the flare scores at or above the file threshold', () => {
    expect(output).toBeGreaterThanOrEqual(sepRiskModel.threshold)
    const [alert] = alertsWith(sepRiskModel)
    expect(alert?.ruleId).toBe('R-RAD-03')
    expect(alert?.evidence[0]?.model?.threshold).toBe(sepRiskModel.threshold)
    expect(alert?.evidence[0]?.model?.output).toBe(output)
    expect(alert?.evidence[0]?.value).toBe(`${sepRiskScore(output)} out of 100`)
  })

  it('a flare just below the threshold gives no alert; at the threshold it does', () => {
    const justAbove = { ...sepRiskModel, threshold: output + 1e-6 }
    const exactly = { ...sepRiskModel, threshold: output }
    expect(alertsWith(justAbove)).toEqual([])
    expect(alertsWith(exactly).map((alert) => alert.ruleId)).toEqual([
      'R-RAD-03',
    ])
  })

  it('stays a watch alert on the "handle this yourself" route at every delay', () => {
    for (const delay of [0, 1.3, 180, 720, 1320]) {
      const [alert] = alertsWith(sepRiskModel, delay)
      expect(alert?.severity).toBe('watch')
      expect(alert?.route).toBe('self_care')
    }
  })

  it('raises nothing, and does not fail, without the model', () => {
    expect(alertsWith(null)).toEqual([])
  })
})
