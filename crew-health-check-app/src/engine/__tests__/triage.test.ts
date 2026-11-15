import { describe, expect, it } from 'vitest'
import { triage } from '../triage.ts'
import type { LinkState } from '../types.ts'

// Logic tests with rules built inline. The full section 13.5 table, using the
// real rules and environments, is in src/data/__tests__/triageTable.test.ts.

function link(oneWayDelaySec: number, linkUp = true): LinkState {
  return { oneWayDelaySec, linkUp, groundHandlingMin: 5 }
}

const actFast = {
  severity: 'act',
  timeToActMin: 15,
  needsGround: false,
} as const
const actSlow = {
  severity: 'act',
  timeToActMin: 60,
  needsGround: true,
} as const
const watchGround = {
  severity: 'watch',
  timeToActMin: 10_080,
  needsGround: true,
} as const
const watchSelf = {
  severity: 'watch',
  timeToActMin: 2_880,
  needsGround: false,
} as const

describe('reply estimate', () => {
  it('is the round trip plus ground handling', () => {
    expect(triage(watchSelf, link(0)).replyEtaMin).toBe(5)
    expect(triage(watchSelf, link(180)).replyEtaMin).toBe(11)
    expect(triage(watchSelf, link(1320)).replyEtaMin).toBe(49)
    expect(triage(watchSelf, link(1.3)).replyEtaMin).toBeCloseTo(
      5 + 2.6 / 60,
      12,
    )
  })

  it('uses the ground handling time from the link state', () => {
    const slowGround: LinkState = {
      oneWayDelaySec: 0,
      linkUp: true,
      groundHandlingMin: 20,
    }
    expect(triage(watchSelf, slowGround).replyEtaMin).toBe(20)
  })
})

describe('act alerts', () => {
  it('consult the ground when the reply arrives within the time to act', () => {
    expect(triage(actFast, link(180)).route).toBe('consult_ground')
  })

  it('act on board when the reply would come too late', () => {
    expect(triage(actFast, link(1320))).toEqual({
      route: 'act_on_board',
      replyEtaMin: 49,
    })
  })

  it('consult the ground when the time to act equals the reply estimate exactly', () => {
    // "cannot wait" is timeToAct < replyEta, so equal still allows a consult.
    const actEqual = {
      severity: 'act',
      timeToActMin: 11,
      needsGround: false,
    } as const
    expect(triage(actEqual, link(180)).route).toBe('consult_ground')
  })
})

describe('watch alerts', () => {
  it('consult the ground when the rule needs it, at any delay', () => {
    expect(triage(watchGround, link(0)).route).toBe('consult_ground')
    expect(triage(watchGround, link(1320)).route).toBe('consult_ground')
  })

  it('are self care otherwise, at any delay', () => {
    expect(triage(watchSelf, link(0)).route).toBe('self_care')
    expect(triage(watchSelf, link(1320)).route).toBe('self_care')
  })
})

describe('link down', () => {
  const down = link(180, false)

  it('sends every act alert to act on board, with no reply estimate', () => {
    expect(triage(actFast, down)).toEqual({
      route: 'act_on_board',
      replyEtaMin: null,
    })
    expect(triage(actSlow, down)).toEqual({
      route: 'act_on_board',
      replyEtaMin: null,
    })
  })

  it('keeps watch routes, with no reply estimate', () => {
    expect(triage(watchGround, down)).toEqual({
      route: 'consult_ground',
      replyEtaMin: null,
    })
    expect(triage(watchSelf, down)).toEqual({
      route: 'self_care',
      replyEtaMin: null,
    })
  })

  it('does the same at the station', () => {
    expect(triage(actSlow, link(0, false))).toEqual({
      route: 'act_on_board',
      replyEtaMin: null,
    })
  })
})
