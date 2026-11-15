import type {
  Alert,
  Condition,
  Evaluation,
  IndicatorDef,
  IndicatorId,
  Protocol,
  RegionId,
} from '../engine/index.ts'
import { indicatorDef } from './labels.ts'

/** Active alerts, act first. Superseded alerts are left out (section 19.1). */
export function activeAlerts(evaluation: Evaluation): Alert[] {
  return evaluation.alerts
    .filter((alert) => alert.supersededBy === null)
    .sort((a, b) => Number(b.severity === 'act') - Number(a.severity === 'act'))
}

/** The hash route of an alert's detail screen. */
export function alertPath(alertKey: string): string {
  return `/alert/${encodeURIComponent(alertKey)}`
}

/** Alert keys are "<rule id>:<crew id>" (engine `rules.ts`). */
export function ruleIdOfKey(alertKey: string): string {
  return alertKey.split(':')[0] ?? alertKey
}

/** Alerts that a stronger alert covers, for "Also contributing" (section 19.4). */
export function contributingAlerts(
  evaluation: Evaluation,
  alert: Alert,
): Alert[] {
  return evaluation.alerts.filter(
    (other) =>
      other.supersededBy === alert.ruleId && other.crewId === alert.crewId,
  )
}

/**
 * The crew-entered indicators whose newest value a rule tests. An urgent
 * re-check of these can confirm or clear the alert (section 10); rules on
 * streaks, averages or habitat feeds cannot be re-checked this way.
 */
export function recheckIndicators(condition: Condition): IndicatorDef[] {
  const ids = new Set<IndicatorId>()
  const visit = (node: Condition) => {
    if (node.type === 'latest') ids.add(node.indicator)
    if (node.type === 'all' || node.type === 'any') node.of.forEach(visit)
  }
  visit(condition)
  return [...ids]
    .map((id) => indicatorDef(id))
    .filter((def) => def.input === 'number')
}

/** How many steps an act alert shows in its route banner, before any reading. */
const FIRST_STEP_COUNT = 2

export function firstSteps(protocol: Protocol): Protocol['steps'] {
  return protocol.steps.slice(0, FIRST_STEP_COUNT)
}

/** Missing data is shown next to a status or an alert, never hidden by it (section 9). */
export function missingDataText(
  evaluation: Evaluation,
  region: RegionId,
): string | null {
  const gaps = evaluation.regionGaps[region]
  const parts = gaps.overdue.map((id) => indicatorDef(id).label)
  if (gaps.missingFeeds.length > 0) parts.push("today's habitat sample")
  return parts.length > 0 ? `Missing: ${parts.join(', ')}` : null
}
