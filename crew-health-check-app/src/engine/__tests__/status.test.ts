import { describe, expect, it } from 'vitest'
import { lastReadingPerDay } from '../baseline.ts'
import {
  DAILY_CONTEXT_FEEDS,
  missingContextFeeds,
  overallStatus,
  overdueIndicators,
  regionGaps,
  regionStatuses,
} from '../status.ts'
import type {
  Alert,
  ContextFeedId,
  IndicatorId,
  Reading,
  RegionId,
  Status,
} from '../types.ts'
import {
  ALL_FIXTURE_INDICATORS,
  NEAR_VISION,
  SLEEP,
  reading,
  sample,
} from './fixtures.ts'

function dailyValues(readings: Reading[]) {
  return new Map(
    ALL_FIXTURE_INDICATORS.map((def) => [
      def.id,
      lastReadingPerDay(readings, def.id),
    ]),
  )
}

function alert(
  ruleId: string,
  region: RegionId,
  severity: Alert['severity'],
  supersededBy: string | null = null,
): Alert {
  return {
    key: `${ruleId}:c1`,
    ruleId,
    crewId: 'c1',
    severity,
    region,
    firstSeenDay: 40,
    evidence: [],
    route: 'self_care',
    replyEtaMin: 5,
    supersededBy,
  }
}

/** Region statuses for the fixture indicators. */
function statuses(
  alerts: Alert[],
  overdue: IndicatorId[] = [],
  missingFeeds: ContextFeedId[] = [],
) {
  return regionStatuses(
    alerts,
    ALL_FIXTURE_INDICATORS,
    regionGaps(ALL_FIXTURE_INDICATORS, overdue, missingFeeds),
  )
}

const ALL_FEEDS_MISSING = [...DAILY_CONTEXT_FEEDS]

describe('overdueIndicators', () => {
  it('lists indicators that were never recorded', () => {
    expect(overdueIndicators([SLEEP], dailyValues([]), 40)).toEqual([
      'sleep_hours',
    ])
  })

  it('a daily indicator is overdue when its newest reading is more than 2 days old', () => {
    const twoDaysOld = dailyValues([reading('sleep_hours', 38, 7)])
    const threeDaysOld = dailyValues([reading('sleep_hours', 37, 7)])
    expect(overdueIndicators([SLEEP], twoDaysOld, 40)).toEqual([])
    expect(overdueIndicators([SLEEP], threeDaysOld, 40)).toEqual([
      'sleep_hours',
    ])
  })

  it('a weekly indicator is overdue when its newest reading is more than 8 days old', () => {
    expect(
      overdueIndicators(
        [NEAR_VISION],
        dailyValues([reading('near_vision', 32, 8)]),
        40,
      ),
    ).toEqual([])
    expect(
      overdueIndicators(
        [NEAR_VISION],
        dailyValues([reading('near_vision', 31, 8)]),
        40,
      ),
    ).toEqual(['near_vision'])
  })
})

describe('missingContextFeeds', () => {
  it('reports the daily habitat feeds as missing without a sample for today', () => {
    expect(missingContextFeeds([], 40)).toEqual([
      'cabin_co2',
      'radiation_cumulative',
      'solar_event',
    ])
    expect(missingContextFeeds([sample(39)], 40)).toEqual(ALL_FEEDS_MISSING)
  })

  it('reports nothing missing when today has a sample, even with ordinary values', () => {
    expect(missingContextFeeds([sample(40)], 40)).toEqual([])
  })

  it('never requires the model feed sep_risk', () => {
    expect(DAILY_CONTEXT_FEEDS).not.toContain('sep_risk')
  })
})

describe('regionStatuses', () => {
  it('shows the worst active alert in each region', () => {
    const status = statuses([
      alert('R-A-01', 'core', 'watch'),
      alert('R-B-01', 'core', 'act'),
      alert('R-C-01', 'head', 'watch'),
    ])
    expect(status.core).toBe('act')
    expect(status.head).toBe('watch')
    expect(status.eyes).toBe('good')
  })

  it('ignores superseded alerts', () => {
    const status = statuses([
      alert('R-A-01', 'core', 'act', 'R-B-01'),
      alert('R-B-01', 'whole_body', 'watch'),
    ])
    expect(status.core).toBe('good')
    expect(status.whole_body).toBe('watch')
  })

  it('shows No data when every indicator in a region is overdue and there is no alert', () => {
    expect(statuses([], ['body_temp', 'blood_glucose']).core).toBe('no_data')
    expect(statuses([], ['body_temp']).core).toBe('good')
  })

  it('lets an alert outrank missing data', () => {
    expect(
      statuses(
        [alert('R-A-01', 'core', 'watch')],
        ['body_temp', 'blood_glucose'],
      ).core,
    ).toBe('watch')
  })

  it('Environment shows No data when the daily habitat feeds are missing', () => {
    expect(statuses([], [], ALL_FEEDS_MISSING).whole_body).toBe('no_data')
    expect(statuses([], [], []).whole_body).toBe('good')
  })

  it('Skin shows Good only in the sense of "no active alert": it has no required data', () => {
    expect(statuses([], ['sleep_hours'], ALL_FEEDS_MISSING).skin).toBe('good')
    expect(statuses([alert('R-SKIN-01', 'skin', 'watch')]).skin).toBe('watch')
  })
})

describe('regionGaps', () => {
  it('keeps missing data next to an active alert', () => {
    const gaps = regionGaps(
      ALL_FIXTURE_INDICATORS,
      ['body_temp'],
      ALL_FEEDS_MISSING,
    )
    const status = regionStatuses(
      [
        alert('R-GLU-01', 'core', 'act'),
        alert('R-RAD-01', 'whole_body', 'watch'),
      ],
      ALL_FIXTURE_INDICATORS,
      gaps,
    )
    expect(status.core).toBe('act')
    expect(gaps.core).toEqual({ overdue: ['body_temp'], missingFeeds: [] })
    expect(status.whole_body).toBe('watch')
    expect(gaps.whole_body).toEqual({
      overdue: [],
      missingFeeds: ALL_FEEDS_MISSING,
    })
  })

  it('assigns the habitat feeds only to Environment', () => {
    const gaps = regionGaps(ALL_FIXTURE_INDICATORS, [], ALL_FEEDS_MISSING)
    expect(gaps.skin.missingFeeds).toEqual([])
    expect(gaps.head.missingFeeds).toEqual([])
  })
})

describe('overallStatus', () => {
  const base: Record<RegionId, Status> = {
    head: 'good',
    eyes: 'good',
    heart: 'good',
    core: 'good',
    bones_muscle: 'good',
    skin: 'good',
    whole_body: 'good',
  }

  it('is the worst region status: act, then watch, then no data, then good', () => {
    expect(overallStatus(base)).toBe('good')
    expect(overallStatus({ ...base, eyes: 'no_data' })).toBe('no_data')
    expect(overallStatus({ ...base, eyes: 'no_data', head: 'watch' })).toBe(
      'watch',
    )
    expect(
      overallStatus({ ...base, eyes: 'no_data', head: 'watch', core: 'act' }),
    ).toBe('act')
  })
})
