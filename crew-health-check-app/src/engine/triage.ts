import type { LinkState, Route, Rule } from './types.ts'

/**
 * Expected minutes until a reply from Earth (section 13.2): the signal there
 * and back plus the ground's handling time, or null while the link is down.
 */
export function replyEtaMinutes(link: LinkState): number | null {
  return link.linkUp
    ? (2 * link.oneWayDelaySec) / 60 + link.groundHandlingMin
    : null
}

/**
 * Triage by communication delay: exactly the function in ARCHITECTURE.md
 * section 13.3. An act alert whose time to act is shorter than the expected
 * reply from Earth (or with the link down) is handled on board. The route
 * decides who leads, never whether help is shown.
 */
export function triage(
  rule: Pick<Rule, 'severity' | 'timeToActMin' | 'needsGround'>,
  link: LinkState,
): { route: Route; replyEtaMin: number | null } {
  const replyEtaMin = replyEtaMinutes(link)

  if (rule.severity === 'act') {
    const cannotWait = replyEtaMin === null || rule.timeToActMin < replyEtaMin
    return {
      route: cannotWait ? 'act_on_board' : 'consult_ground',
      replyEtaMin,
    }
  }
  if (rule.needsGround) return { route: 'consult_ground', replyEtaMin }
  return { route: 'self_care', replyEtaMin }
}
