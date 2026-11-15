import { describe, expect, it } from 'vitest'
import { INDICATOR_IDS, REGION_IDS, ruleSchema } from '../schemas.ts'
import type {
  Condition,
  IndicatorDef,
  Protocol,
  RegionDef,
  Rule,
  Source,
} from '../types.ts'
import { findDataProblems, type HealthData } from '../validateData.ts'
import { testRule } from './fixtures.ts'

// A minimal consistent data set, then one broken thing per test.

const SOURCE: Source = {
  id: 'fixture-source',
  title: 'Fixture',
  publisher: 'Fixture',
  year: null,
  url: 'https://example.org/',
  kind: 'reference',
  keyFinding: 'Fixture.',
  verified: false,
}

const INDICATORS: IndicatorDef[] = INDICATOR_IDS.map((id) => ({
  id,
  label: id,
  unit: '',
  region: 'head',
  input: 'number',
  cadenceDays: 1,
  inputMin: 0,
  inputMax: 10,
  step: 1,
  minSpread: 1,
  howToMeasure: 'Fixture.',
  whyInSpace: 'Fixture.',
  sourceIds: ['fixture-source'],
}))

const REGIONS: RegionDef[] = REGION_IDS.map((id) => ({
  id,
  label: id,
  indicators: id === 'head' ? [...INDICATOR_IDS] : [],
  symptoms: [],
  contextFeeds: [],
}))

const PROTOCOL: Protocol = {
  id: 'P-FIXTURE',
  title: 'Fixture',
  note: 'Fixture.',
  steps: [{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }],
  recheckAfterHours: null,
  escalateIf: 'Fixture.',
  reviewed: false,
  sourceIds: [],
}

const SLEEP_LOW: Condition = {
  type: 'latest',
  indicator: 'sleep_hours',
  test: { kind: 'absolute', op: 'lt', value: 5 },
}

function data(rules: Rule[]): HealthData {
  return {
    indicators: INDICATORS,
    regions: REGIONS,
    sources: [SOURCE],
    environments: [],
    rules,
    protocols: [PROTOCOL],
  }
}

describe('findDataProblems', () => {
  it('accepts a consistent data set', () => {
    expect(
      findDataProblems(data([testRule({ id: 'R-OK-01', when: SLEEP_LOW })])),
    ).toEqual([])
  })

  it('reports an unknown protocol', () => {
    const problems = findDataProblems(
      data([
        testRule({ id: 'R-OK-01', when: SLEEP_LOW, protocolId: 'P-MISSING' }),
      ]),
    )
    expect(problems).toEqual(['R-OK-01: unknown protocol P-MISSING'])
  })

  it('reports an unknown source', () => {
    const problems = findDataProblems(
      data([testRule({ id: 'R-OK-01', when: SLEEP_LOW, sourceIds: ['nope'] })]),
    )
    expect(problems).toEqual(['R-OK-01: unknown source nope'])
  })

  it('requires a source unless the basis is illustrative', () => {
    const problems = findDataProblems(
      data([
        testRule({
          id: 'R-OK-01',
          when: SLEEP_LOW,
          basis: 'clinical-general',
          sourceIds: [],
        }),
      ]),
    )
    expect(problems).toEqual([
      'R-OK-01: needs at least one source unless its basis is illustrative',
    ])
  })

  it('reports supersedes entries that are unknown, self-referencing or cyclic', () => {
    expect(
      findDataProblems(
        data([
          testRule({ id: 'R-A-01', when: SLEEP_LOW, supersedes: ['R-X-01'] }),
        ]),
      ),
    ).toEqual(['R-A-01: supersedes unknown rule R-X-01'])

    const cyclic = findDataProblems(
      data([
        testRule({ id: 'R-A-01', when: SLEEP_LOW, supersedes: ['R-B-01'] }),
        testRule({ id: 'R-B-01', when: SLEEP_LOW, supersedes: ['R-A-01'] }),
      ]),
    )
    expect(cyclic).toEqual([
      'rules.json: supersedes cycle R-A-01 -> R-B-01 -> R-A-01',
    ])

    const self = findDataProblems(
      data([
        testRule({ id: 'R-A-01', when: SLEEP_LOW, supersedes: ['R-A-01'] }),
      ]),
    )
    expect(self).toContain('R-A-01: supersedes itself')
  })

  it('reports duplicate rule IDs', () => {
    const rule = testRule({ id: 'R-A-01', when: SLEEP_LOW })
    expect(findDataProblems(data([rule, rule]))).toEqual([
      'rules.json: duplicate ID R-A-01',
    ])
  })

  it('allows modelThreshold only in a context condition on the sep_risk feed', () => {
    const onSepRisk = testRule({
      id: 'R-RISK-01',
      when: {
        type: 'context',
        feed: 'sep_risk',
        windowDays: 1,
        test: { kind: 'modelThreshold', op: 'gte', model: 'sep-risk' },
      },
    })
    expect(findDataProblems(data([onSepRisk]))).toEqual([])

    const onCo2 = testRule({
      id: 'R-RISK-02',
      when: {
        type: 'context',
        feed: 'cabin_co2',
        windowDays: 1,
        test: { kind: 'modelThreshold', op: 'gte', model: 'sep-risk' },
      },
    })
    const onIndicator = testRule({
      id: 'R-RISK-03',
      when: {
        type: 'any',
        of: [
          SLEEP_LOW,
          {
            type: 'latest',
            indicator: 'sleep_hours',
            test: { kind: 'modelThreshold', op: 'gte', model: 'sep-risk' },
          },
        ],
      },
    })
    expect(findDataProblems(data([onCo2, onIndicator]))).toEqual([
      'R-RISK-02: a modelThreshold comparison is only allowed in a context condition on the sep_risk feed',
      'R-RISK-03: a modelThreshold comparison is only allowed in a context condition on the sep_risk feed',
    ])
  })

  it('keeps a rule on the model feed at watch level, without the ground, and without a typed number', () => {
    const modelTest = {
      kind: 'modelThreshold',
      op: 'gte',
      model: 'sep-risk',
    } as const
    const onFeed = (test: Condition & { type: 'context' }) => test
    const act = testRule({
      id: 'R-RISK-04',
      severity: 'act',
      when: onFeed({
        type: 'context',
        feed: 'sep_risk',
        windowDays: 1,
        test: modelTest,
      }),
    })
    const needsGround = testRule({
      id: 'R-RISK-05',
      needsGround: true,
      when: {
        type: 'all',
        of: [
          SLEEP_LOW,
          { type: 'context', feed: 'sep_risk', windowDays: 1, test: modelTest },
        ],
      },
    })
    const typedNumber = testRule({
      id: 'R-RISK-06',
      when: {
        type: 'context',
        feed: 'sep_risk',
        windowDays: 1,
        test: { kind: 'absolute', op: 'gte', value: 0.5 },
      },
    })
    expect(findDataProblems(data([act, needsGround, typedNumber]))).toEqual([
      'R-RISK-04: a rule that reads the sep_risk model feed must be watch-level',
      'R-RISK-05: a rule that reads the sep_risk model feed must not need the ground, so the model never changes a route',
      'R-RISK-06: a condition on the sep_risk feed must use a modelThreshold comparison, so no model number is typed in rules.json',
    ])
  })

  it('rejects baseline comparisons on context feeds', () => {
    const rule = testRule({
      id: 'R-CTX-01',
      when: {
        type: 'context',
        feed: 'cabin_co2',
        windowDays: 1,
        test: { kind: 'zScore', op: 'gt', z: 2 },
      },
    })
    expect(findDataProblems(data([rule]))).toEqual([
      'R-CTX-01: baseline comparisons are not valid for context feeds',
    ])
  })

  it('reports a streak that can never be met', () => {
    const rule = testRule({
      id: 'R-STR-01',
      when: {
        type: 'streak',
        indicator: 'sleep_hours',
        test: { kind: 'absolute', op: 'lt', value: 5 },
        minCount: 6,
        windowDays: 5,
      },
    })
    expect(findDataProblems(data([rule]))).toEqual([
      'R-STR-01: streak minCount is larger than windowDays',
    ])
  })

  it('reports a missing indicator and an indicator listed under the wrong region', () => {
    const missing = { ...data([]), indicators: INDICATORS.slice(1) }
    expect(findDataProblems(missing)).toContain(
      'indicators.json: indicator systolic_bp is missing',
    )

    const wrongRegion = {
      ...data([]),
      indicators: INDICATORS.map((def) =>
        def.id === 'mood' ? { ...def, region: 'core' as const } : def,
      ),
    }
    expect(findDataProblems(wrongRegion)).toEqual([
      'regions.json: indicator mood must be listed once, under its region core',
    ])
  })
})

describe('ruleSchema', () => {
  const valid = testRule({
    id: 'R-OK-01',
    when: SLEEP_LOW,
    protocolId: 'P-FIXTURE',
  })

  it('accepts a valid rule', () => {
    expect(ruleSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a badly formed rule ID', () => {
    expect(ruleSchema.safeParse({ ...valid, id: 'R-sleep-1' }).success).toBe(
      false,
    )
  })

  it('rejects a time to act that is not positive', () => {
    expect(ruleSchema.safeParse({ ...valid, timeToActMin: 0 }).success).toBe(
      false,
    )
  })

  it('rejects unknown fields, so typos in rules.json are caught', () => {
    expect(ruleSchema.safeParse({ ...valid, severty: 'act' }).success).toBe(
      false,
    )
  })

  it('rejects a modelThreshold for a model that does not exist', () => {
    const rule = {
      ...valid,
      when: {
        type: 'context',
        feed: 'sep_risk',
        windowDays: 1,
        test: { kind: 'modelThreshold', op: 'gte', model: 'other' },
      },
    }
    expect(ruleSchema.safeParse(rule).success).toBe(false)
  })
})
