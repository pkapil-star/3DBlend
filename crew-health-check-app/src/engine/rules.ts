import {
  evaluateCondition,
  type ConditionContext,
  type ConditionResult,
} from './conditions.ts'
import { triage } from './triage.ts'
import type { Alert, LinkState, Rule } from './types.ts'

/**
 * Section 11.4: evaluate every rule for one crew member, give each met rule
 * one alert with its triage route, then flag superseded alerts.
 */
export function evaluateRules(
  rules: readonly Rule[],
  ctx: ConditionContext,
  link: LinkState,
  crewId: string,
): Alert[] {
  const alerts: Alert[] = []
  const seenRuleIds = new Set<string>()

  for (const rule of rules) {
    // One alert per rule per crew member, even if a rule were listed twice.
    if (seenRuleIds.has(rule.id)) continue
    seenRuleIds.add(rule.id)

    let result: ConditionResult
    try {
      result = evaluateCondition(rule.when, ctx)
    } catch (error) {
      // A broken rule must not take the other alerts down (section 28).
      console.error(
        `Rule ${rule.id} was skipped because it failed to evaluate`,
        error,
      )
      continue
    }
    if (!result.met) continue

    const { route, replyEtaMin } = triage(rule, link)
    alerts.push({
      key: `${rule.id}:${crewId}`,
      ruleId: rule.id,
      crewId,
      severity: rule.severity,
      region: rule.region,
      firstSeenDay: ctx.today,
      evidence: result.evidence,
      route,
      replyEtaMin,
      supersededBy: null,
    })
  }

  return applySuperseding(alerts, rules)
}

/** If rule A is met and lists B in `supersedes`, B's alert is flagged as superseded by A. */
function applySuperseding(
  alerts: readonly Alert[],
  rules: readonly Rule[],
): Alert[] {
  const activeRuleIds = new Set(alerts.map((alert) => alert.ruleId))
  const supersededBy = new Map<string, string>()
  for (const rule of rules) {
    if (!activeRuleIds.has(rule.id)) continue
    for (const target of rule.supersedes) {
      if (activeRuleIds.has(target) && !supersededBy.has(target)) {
        supersededBy.set(target, rule.id)
      }
    }
  }
  return alerts.map((alert) => ({
    ...alert,
    supersededBy: supersededBy.get(alert.ruleId) ?? null,
  }))
}
