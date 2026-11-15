import type { DailyValue } from './baseline.ts'
import type {
  Alert,
  ContextFeedId,
  ContextSample,
  IndicatorDef,
  IndicatorId,
  MissionDay,
  RegionGaps,
  RegionId,
  Status,
} from './types.ts'

/**
 * An indicator is overdue when it has never been recorded, or when its newest
 * reading is more than `cadenceDays + 1` days old (section 9). Overdue items
 * are routine prompts, never alerts.
 */
export function overdueIndicators(
  defs: readonly IndicatorDef[],
  dailyValues: ReadonlyMap<IndicatorId, readonly DailyValue[]>,
  today: MissionDay,
): IndicatorId[] {
  return defs
    .filter((def) => {
      const newest = dailyValues.get(def.id)?.at(-1)
      return !newest || today - newest.day > def.cadenceDays + 1
    })
    .map((def) => def.id)
}

/**
 * The feeds that come from the daily habitat sample. `sep_risk` is left out:
 * it exists only after a solar flare, so having no value is normal.
 */
export const DAILY_CONTEXT_FEEDS: readonly ContextFeedId[] = [
  'cabin_co2',
  'radiation_cumulative',
  'solar_event',
]

/** The habitat feeds belong to the Environment region (section 9; a test checks regions.json agrees). */
export const CONTEXT_FEED_REGION: RegionId = 'whole_body'

/**
 * Today's habitat sample is required: the CO2 and radiation rules read today's
 * values. Without it the feeds are missing, which must not look like a normal
 * reading.
 */
export function missingContextFeeds(
  context: readonly ContextSample[],
  today: MissionDay,
): ContextFeedId[] {
  return context.some((sample) => sample.day === today)
    ? []
    : [...DAILY_CONTEXT_FEEDS]
}

const REGION_ORDER: readonly RegionId[] = [
  'head',
  'eyes',
  'heart',
  'core',
  'bones_muscle',
  'skin',
  'whole_body',
]

/**
 * What each region is missing. Kept next to the status so an active alert
 * never hides missing data: a region can show Act and still list what was not
 * recorded.
 */
export function regionGaps(
  defs: readonly IndicatorDef[],
  overdue: readonly IndicatorId[],
  missingFeeds: readonly ContextFeedId[],
): Record<RegionId, RegionGaps> {
  const overdueSet = new Set(overdue)
  const gapsFor = (region: RegionId): RegionGaps => ({
    overdue: defs
      .filter((def) => def.region === region && overdueSet.has(def.id))
      .map((def) => def.id),
    missingFeeds: region === CONTEXT_FEED_REGION ? [...missingFeeds] : [],
  })
  return {
    head: gapsFor('head'),
    eyes: gapsFor('eyes'),
    heart: gapsFor('heart'),
    core: gapsFor('core'),
    bones_muscle: gapsFor('bones_muscle'),
    skin: gapsFor('skin'),
    whole_body: gapsFor('whole_body'),
  }
}

// "Worst" for the overall status: an alert outranks missing data, and missing
// data outranks good, because it also needs the crew member's attention.
const STATUS_RANK: Record<Status, number> = {
  good: 0,
  no_data: 1,
  watch: 2,
  act: 3,
}

/** How many data items a region needs: its indicators, plus the daily feeds for Environment. */
function requiredItems(
  region: RegionId,
  defs: readonly IndicatorDef[],
): number {
  const indicators = defs.filter((def) => def.region === region).length
  const feeds = region === CONTEXT_FEED_REGION ? DAILY_CONTEXT_FEEDS.length : 0
  return indicators + feeds
}

/**
 * Section 9: a region shows its worst active, non-superseded alert. With no
 * alert, a region whose required data is all missing shows No data.
 * Skin has no required data, so it shows Good whenever no alert is active.
 * Good there means only "no active alert": no rash report is not evidence of
 * normal skin health.
 */
function statusOfRegion(
  region: RegionId,
  activeAlerts: readonly Alert[],
  defs: readonly IndicatorDef[],
  gaps: RegionGaps,
): Status {
  const inRegion = activeAlerts.filter((alert) => alert.region === region)
  if (inRegion.some((alert) => alert.severity === 'act')) return 'act'
  if (inRegion.some((alert) => alert.severity === 'watch')) return 'watch'
  const required = requiredItems(region, defs)
  const missing = gaps.overdue.length + gaps.missingFeeds.length
  if (required > 0 && missing === required) return 'no_data'
  return 'good'
}

export function regionStatuses(
  alerts: readonly Alert[],
  defs: readonly IndicatorDef[],
  gaps: Record<RegionId, RegionGaps>,
): Record<RegionId, Status> {
  const active = alerts.filter((alert) => alert.supersededBy === null)
  const status = (region: RegionId) =>
    statusOfRegion(region, active, defs, gaps[region])
  return {
    head: status('head'),
    eyes: status('eyes'),
    heart: status('heart'),
    core: status('core'),
    bones_muscle: status('bones_muscle'),
    skin: status('skin'),
    whole_body: status('whole_body'),
  }
}

export function overallStatus(regionStatus: Record<RegionId, Status>): Status {
  return REGION_ORDER.map((region) => regionStatus[region]).reduce<Status>(
    (worst, status) =>
      STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst,
    'good',
  )
}
