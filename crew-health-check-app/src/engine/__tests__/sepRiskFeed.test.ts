import { describe, expect, it } from 'vitest'
import { evaluateCondition } from '../conditions.ts'
import { evaluate } from '../index.ts'
import type { Condition, EvaluationInput, LinkState } from '../types.ts'
import {
  ALL_FIXTURE_INDICATORS,
  FIXTURE_MODEL,
  HOUR_MS,
  STATION_LINK,
  flare,
  makeContext,
  nineAm,
  sample,
  testRule,
} from './fixtures.ts'

// The sep_risk context feed and what a rule on it may do (sections 11.2,
// 13.5 and 26.10). FIXTURE_MODEL gives X1.0 an output of about 0.73, M1.0
// about 0.27, and M1.0 with a CME exactly 0.5, its threshold.

const TODAY = 40
const NOW = nineAm(TODAY)
const STRONG = { classType: 'X1.0' }
const X1_OUTPUT = Math.E / (1 + Math.E)

const outlook: Condition = {
  type: 'context',
  feed: 'sep_risk',
  windowDays: 1,
  test: { kind: 'modelThreshold', op: 'gte', model: 'sep-risk' },
}

function context(
  flares: ReturnType<typeof flare>[],
  model: typeof FIXTURE_MODEL | null = FIXTURE_MODEL,
) {
  return makeContext(TODAY, {
    context: [sample(TODAY)],
    spaceWeather: flares,
    sepRiskModel: model,
  })
}

describe('the sep_risk feed', () => {
  it('is met when a recent flare scores at or above the model threshold, with its evidence', () => {
    const result = evaluateCondition(outlook, context([flare(NOW, 2, STRONG)]))
    expect(result.met).toBe(true)
    expect(result.evidence).toHaveLength(1)
    const item = result.evidence[0]
    expect(item?.label).toBe('Experimental model score')
    expect(item?.value).toBe('73 out of 100')
    expect(item?.reference).toBe(
      'Flare X1.0 at S10W30, peak on day 40 at 07:00. ' +
        'Alert level: at or above 50 out of 100. Model estimate from sep-risk fixture.',
    )
    expect(item?.model?.modelId).toBe('sep-risk')
    expect(item?.model?.version).toBe('fixture')
    expect(item?.model?.output).toBeCloseTo(X1_OUTPUT, 12)
    expect(item?.model?.threshold).toBe(0.5)
    expect(item?.model?.flare).toEqual({
      donkiId: 'fixture-flare-2',
      link: 'https://example.org/flare',
    })
    expect(item?.model?.factors).toEqual([
      'Flare class X1.0 raises the score',
      'No linked CME does not move the score',
    ])
  })

  it('never shows the output as a percent or a chance', () => {
    const [item] = evaluateCondition(
      outlook,
      context([flare(NOW, 2, STRONG)]),
    ).evidence
    const text = `${item?.label} ${item?.value} ${item?.reference}`
    expect(text).not.toMatch(/%|chance|probab|will /i)
  })

  it('is not met when the flare scores below the threshold', () => {
    expect(evaluateCondition(outlook, context([flare(NOW, 2)]))).toEqual({
      met: false,
      evidence: [],
    })
  })

  it('is met exactly at the threshold', () => {
    const atThreshold = flare(NOW, 2, {
      cme: { speedKms: 800, halfAngleDeg: 30 },
    })
    expect(evaluateCondition(outlook, context([atThreshold])).met).toBe(true)
  })

  it("applies the model file's threshold, not a number of its own", () => {
    const flares = [flare(NOW, 2, STRONG)]
    const justAbove = { ...FIXTURE_MODEL, threshold: X1_OUTPUT + 1e-6 }
    const justBelow = { ...FIXTURE_MODEL, threshold: X1_OUTPUT - 1e-6 }
    expect(evaluateCondition(outlook, context(flares, justAbove)).met).toBe(
      false,
    )
    expect(evaluateCondition(outlook, context(flares, justBelow)).met).toBe(
      true,
    )
  })

  it('has no value without a model, and no error', () => {
    expect(
      evaluateCondition(outlook, context([flare(NOW, 2, STRONG)], null)),
    ).toEqual({ met: false, evidence: [] })
  })

  it('has no value without a flare, and no error', () => {
    expect(evaluateCondition(outlook, context([]))).toEqual({
      met: false,
      evidence: [],
    })
  })

  it('ignores a flare it cannot read instead of failing', () => {
    const unreadable = flare(NOW, 2, { classType: 'not a class' })
    expect(evaluateCondition(outlook, context([unreadable])).met).toBe(false)
  })

  it('counts a flare 23 hours before now, not one 25 hours before or one after now', () => {
    expect(
      evaluateCondition(outlook, context([flare(NOW, 23, STRONG)])).met,
    ).toBe(true)
    expect(
      evaluateCondition(outlook, context([flare(NOW, 25, STRONG)])).met,
    ).toBe(false)
    expect(
      evaluateCondition(outlook, context([flare(NOW, -1, STRONG)])).met,
    ).toBe(false)
  })

  it('reports the flare with the highest output', () => {
    const result = evaluateCondition(
      outlook,
      context([flare(NOW, 1), flare(NOW, 6, STRONG), flare(NOW, 30, STRONG)]),
    )
    expect(result.evidence[0]?.model?.flare.donkiId).toBe('fixture-flare-6')
  })
})

const outlookRule = testRule({
  id: 'R-OUT-03',
  region: 'whole_body',
  severity: 'watch',
  needsGround: false,
  timeToActMin: 120,
  when: outlook,
})
const eventRule = testRule({
  id: 'R-EVENT-01',
  region: 'whole_body',
  severity: 'act',
  timeToActMin: 30,
  supersedes: ['R-OUT-03'],
  when: {
    type: 'context',
    feed: 'solar_event',
    windowDays: 1,
    test: { kind: 'absolute', op: 'gte', value: 1 },
  },
})

function input(overrides: Partial<EvaluationInput>): EvaluationInput {
  return {
    nowMs: NOW,
    crewId: 'c1',
    readings: [],
    symptoms: [],
    context: [sample(TODAY)],
    link: STATION_LINK,
    indicators: ALL_FIXTURE_INDICATORS,
    rules: [eventRule, outlookRule],
    spaceWeather: [flare(NOW, 2, STRONG)],
    models: {
      sepRisk: FIXTURE_MODEL,
      personalPattern: null,
      earthHospital: null,
    },
    ...overrides,
  }
}

const LINKS: LinkState[] = [
  STATION_LINK,
  { oneWayDelaySec: 1.3, linkUp: true, groundHandlingMin: 5 },
  { oneWayDelaySec: 180, linkUp: true, groundHandlingMin: 5 },
  { oneWayDelaySec: 1320, linkUp: true, groundHandlingMin: 5 },
  { oneWayDelaySec: 1320, linkUp: false, groundHandlingMin: 5 },
]

describe('what a model outlook may do', () => {
  it('raises a watch alert, and the area becomes Watch, never Act', () => {
    const evaluation = evaluate(input({}))
    expect(evaluation.alerts.map((alert) => alert.ruleId)).toEqual(['R-OUT-03'])
    expect(evaluation.alerts[0]?.severity).toBe('watch')
    expect(evaluation.regionStatus.whole_body).toBe('watch')
    expect(evaluation.overall).toBe('watch')
  })

  it('keeps the route "handle this yourself" at every delay, and with the link down', () => {
    for (const link of LINKS) {
      const [alert] = evaluate(input({ link })).alerts
      expect(alert?.route).toBe('self_care')
    }
  })

  it('is superseded by the alert for an event in progress', () => {
    const evaluation = evaluate(
      input({ context: [sample(TODAY, { solar_event: true })] }),
    )
    const byRule = new Map(
      evaluation.alerts.map((alert) => [alert.ruleId, alert]),
    )
    expect(byRule.get('R-EVENT-01')?.supersededBy).toBeNull()
    expect(byRule.get('R-OUT-03')?.supersededBy).toBe('R-EVENT-01')
    expect(evaluation.regionStatus.whole_body).toBe('act')
  })

  it('changes no other alert: with and without the model, the rest is identical', () => {
    const base = { context: [sample(TODAY, { solar_event: true })] }
    for (const link of LINKS) {
      const withModel = evaluate(input({ ...base, link }))
      const without = evaluate(
        input({
          ...base,
          link,
          models: { sepRisk: null, personalPattern: null, earthHospital: null },
        }),
      )
      const others = withModel.alerts.filter(
        (alert) => alert.ruleId !== 'R-OUT-03',
      )
      expect(others).toEqual(without.alerts)
      expect(withModel.regionStatus).toEqual(without.regionStatus)
      expect(withModel.overall).toBe(without.overall)
    }
  })

  it('raises nothing without a model or without flares, and does not fail', () => {
    expect(
      evaluate(
        input({
          models: { sepRisk: null, personalPattern: null, earthHospital: null },
        }),
      ).alerts,
    ).toEqual([])
    expect(evaluate(input({ spaceWeather: [] })).alerts).toEqual([])
  })

  it('ends when the flare is more than 24 hours old', () => {
    const later = evaluate(
      input({
        nowMs: NOW + 23 * HOUR_MS,
        context: [sample(TODAY), sample(TODAY + 1)],
      }),
    )
    // The flare peaked 2 hours before NOW, so 25 hours before this moment.
    expect(later.alerts).toEqual([])
  })
})
