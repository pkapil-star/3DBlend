import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateRules } from '../rules.ts'
import type { Condition } from '../types.ts'
import {
  STATION_LINK,
  makeContext,
  reading,
  sample,
  series,
  testRule,
} from './fixtures.ts'

const TODAY = 40
const NORMAL_TEMP = series(
  'body_temp',
  25,
  Array.from({ length: 10 }, () => 36.9),
)

const tempAbove = (offset: number): Condition => ({
  type: 'latest',
  indicator: 'body_temp',
  test: { kind: 'baselineOffset', op: 'gte', offset },
})

const watchRule = testRule({
  id: 'R-TEST-01',
  region: 'core',
  when: tempAbove(1),
})
const actRule = testRule({
  id: 'R-TEST-02',
  region: 'core',
  severity: 'act',
  when: tempAbove(2),
  supersedes: ['R-TEST-01'],
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluateRules', () => {
  it('raises one alert per met rule, with key, region, evidence and route', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 38)],
    })
    const alerts = evaluateRules([watchRule, actRule], ctx, STATION_LINK, 'c1')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      key: 'R-TEST-01:c1',
      ruleId: 'R-TEST-01',
      crewId: 'c1',
      severity: 'watch',
      region: 'core',
      firstSeenDay: 40,
      route: 'self_care',
      replyEtaMin: 5,
      supersededBy: null,
    })
    expect(alerts[0]?.evidence).toHaveLength(1)
  })

  it('flags a superseded alert but keeps it in the list', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 39.2)],
    })
    const alerts = evaluateRules([watchRule, actRule], ctx, STATION_LINK, 'c1')
    expect(alerts.map((alert) => [alert.ruleId, alert.supersededBy])).toEqual([
      ['R-TEST-01', 'R-TEST-02'],
      ['R-TEST-02', null],
    ])
  })

  it('does not supersede a rule that is not met', () => {
    const onlyAct = testRule({
      ...actRule,
      when: {
        type: 'context',
        feed: 'cabin_co2',
        windowDays: 1,
        test: { kind: 'absolute', op: 'gt', value: 3 },
      },
    })
    const ctx = makeContext(TODAY, { context: [sample(40, { cabin_co2: 4 })] })
    const alerts = evaluateRules([watchRule, onlyAct], ctx, STATION_LINK, 'c1')
    expect(alerts.map((alert) => [alert.ruleId, alert.supersededBy])).toEqual([
      ['R-TEST-02', null],
    ])
  })

  it('gives one alert per rule even if the rule list repeats a rule', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 38)],
    })
    const alerts = evaluateRules(
      [watchRule, watchRule],
      ctx,
      STATION_LINK,
      'c1',
    )
    expect(alerts).toHaveLength(1)
  })

  it('gives one alert per rule when several readings are taken on the same day', () => {
    const ctx = makeContext(TODAY, {
      readings: [
        ...NORMAL_TEMP,
        reading('body_temp', 40, 38.1, { hour: 7 }),
        reading('body_temp', 40, 38.2, { hour: 12 }),
        reading('body_temp', 40, 38.3, { hour: 18 }),
      ],
    })
    const alerts = evaluateRules([watchRule], ctx, STATION_LINK, 'c1')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.evidence[0]?.value).toBe('38.3 °C on day 40')
  })

  it('applies triage with the current link', () => {
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 39.2)],
    })
    const farMars = { oneWayDelaySec: 1320, linkUp: true, groundHandlingMin: 5 }
    const fastAct = testRule({ ...actRule, timeToActMin: 30 })
    const [alert] = evaluateRules([fastAct], ctx, farMars, 'c1')
    expect(alert).toMatchObject({ route: 'act_on_board', replyEtaMin: 49 })
  })

  it('skips a rule that fails to evaluate and keeps the others', () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    // A malformed condition that slipped past validation.
    const broken = testRule({
      id: 'R-BROKEN-01',
      when: { type: 'all' } as unknown as Condition,
    })
    const ctx = makeContext(TODAY, {
      readings: [...NORMAL_TEMP, reading('body_temp', 40, 38)],
    })
    const alerts = evaluateRules([broken, watchRule], ctx, STATION_LINK, 'c1')
    expect(alerts.map((alert) => alert.ruleId)).toEqual(['R-TEST-01'])
    expect(errors).toHaveBeenCalledOnce()
  })
})
