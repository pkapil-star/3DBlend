import { describe, expect, it } from 'vitest'
import {
  triage,
  type Environment,
  type LinkState,
  type Route,
  type Rule,
} from '../../engine/index.ts'
import { healthData } from '../index.ts'

// ARCHITECTURE.md section 13.5, with groundHandlingMin = 5. These rows are the
// golden triage tests: the four delay columns come from environments.json, and
// the rules from rules.json where they exist already.

const GROUND_HANDLING_MIN = 5

function environment(id: Environment['id']): Environment {
  const env = healthData.environments.find((entry) => entry.id === id)
  if (!env) throw new Error(`environments.json has no ${id}`)
  return env
}

const COLUMNS = [
  {
    name: 'Station (0 s)',
    delaySec: environment('leo_station').oneWayDelaySecMin,
    replyMin: 5,
  },
  {
    name: 'Moon (1.3 s)',
    delaySec: environment('lunar_surface').oneWayDelaySecMin,
    replyMin: 5,
  },
  {
    name: 'Mars near (180 s)',
    delaySec: environment('mars_transit').oneWayDelaySecMin,
    replyMin: 11,
  },
  {
    name: 'Mars far (1320 s)',
    delaySec: environment('mars_transit').oneWayDelaySecMax,
    replyMin: 49,
  },
] as const

function ruleFromData(
  id: string,
): Pick<Rule, 'severity' | 'timeToActMin' | 'needsGround'> {
  const rule = healthData.rules.find((entry) => entry.id === id)
  if (!rule) throw new Error(`rules.json has no ${id}`)
  return rule
}

// Rules not in rules.json yet, built inline with their section 12 values.
const R_VIS_01 = {
  severity: 'watch',
  timeToActMin: 7 * 24 * 60,
  needsGround: true,
} as const
// The model outlook: in rules.json since milestone A2.
const R_RAD_03 = ruleFromData('R-RAD-03')

const ROWS: {
  label: string
  rule: Pick<Rule, 'severity' | 'timeToActMin' | 'needsGround'>
  routes: Route[]
}[] = [
  {
    label: 'R-GLU-02 low blood sugar (15 min)',
    rule: ruleFromData('R-GLU-02'),
    routes: [
      'consult_ground',
      'consult_ground',
      'consult_ground',
      'act_on_board',
    ],
  },
  {
    label: 'R-RAD-01 solar particle event (30 min)',
    rule: ruleFromData('R-RAD-01'),
    routes: [
      'consult_ground',
      'consult_ground',
      'consult_ground',
      'act_on_board',
    ],
  },
  {
    label: 'R-TEMP-02 high temperature (60 min)',
    rule: ruleFromData('R-TEMP-02'),
    routes: [
      'consult_ground',
      'consult_ground',
      'consult_ground',
      'consult_ground',
    ],
  },
  {
    label: 'R-VIS-01 vision change (7 days, inline)',
    rule: R_VIS_01,
    routes: [
      'consult_ground',
      'consult_ground',
      'consult_ground',
      'consult_ground',
    ],
  },
  {
    label: 'R-SLEEP-01 sleep debt (2 days)',
    rule: ruleFromData('R-SLEEP-01'),
    routes: ['self_care', 'self_care', 'self_care', 'self_care'],
  },
  {
    label: 'R-RAD-03 possible particle event, model outlook (2 hours)',
    rule: R_RAD_03,
    routes: ['self_care', 'self_care', 'self_care', 'self_care'],
  },
]

function link(delaySec: number, linkUp = true): LinkState {
  return {
    oneWayDelaySec: delaySec,
    linkUp,
    groundHandlingMin: GROUND_HANDLING_MIN,
  }
}

describe('section 13.5 reply estimates', () => {
  it.each(COLUMNS)(
    '$name gives about $replyMin min',
    ({ delaySec, replyMin }) => {
      const { replyEtaMin } = triage(R_RAD_03, link(delaySec))
      expect(replyEtaMin).not.toBeNull()
      expect(Math.round(replyEtaMin ?? Number.NaN)).toBe(replyMin)
    },
  )

  it('keeps the four columns distinct: 0 s, 1.3 s, 180 s and 1320 s', () => {
    expect(COLUMNS.map((column) => column.delaySec)).toEqual([
      0, 1.3, 180, 1320,
    ])
    expect(triage(R_RAD_03, link(1.3)).replyEtaMin).toBeCloseTo(
      5 + 2.6 / 60,
      12,
    )
  })
})

describe('section 13.5 routes', () => {
  for (const row of ROWS) {
    it.each(
      COLUMNS.map((column, index) => ({
        ...column,
        expected: row.routes[index],
      })),
    )(`${row.label} at $name is $expected`, ({ delaySec, expected }) => {
      expect(triage(row.rule, link(delaySec)).route).toBe(expected)
    })
  }
})

describe('link down', () => {
  it.each(ROWS)('$label', ({ rule }) => {
    const result = triage(rule, link(180, false))
    expect(result.replyEtaMin).toBeNull()
    if (rule.severity === 'act') expect(result.route).toBe('act_on_board')
    else
      expect(result.route).toBe(
        rule.needsGround ? 'consult_ground' : 'self_care',
      )
  })
})
