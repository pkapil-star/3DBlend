import type { Environment, GroundMessage, Route } from '../engine/index.ts'

/** Whole minutes for a reply estimate: "about 49 min". */
export function roundedMinutes(minutes: number): number {
  return Math.max(1, Math.round(minutes))
}

/** The route banner sentence (ARCHITECTURE.md section 13.4). */
export function routeSentence(
  route: Route,
  replyEtaMin: number | null,
): string {
  switch (route) {
    case 'act_on_board':
      return replyEtaMin === null
        ? 'Act now on board. The link to Earth is down, so no reply can be expected.'
        : `Act now on board. A reply from Earth would take about ${roundedMinutes(replyEtaMin)} min.`
    case 'consult_ground':
      return replyEtaMin === null
        ? 'Consult the ground. Will send when the link returns.'
        : `Consult the ground. Reply expected in about ${roundedMinutes(replyEtaMin)} min.`
    case 'self_care':
      return 'You can handle this yourself.'
  }
}

/** A one-way delay in words: "0 s", "1.3 s", "3 min", "22 min". */
export function delayWords(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

/**
 * "Mars near" and "Mars far" mark the ends of the Mars delay range
 * (section 13.5); a fixed delay has no such label.
 */
export function distanceLabel(
  environment: Environment,
  oneWayDelaySec: number,
): string | null {
  if (environment.oneWayDelaySecMin === environment.oneWayDelaySecMax)
    return null
  if (oneWayDelaySec <= environment.oneWayDelaySecMin) return 'Mars near'
  if (oneWayDelaySec >= environment.oneWayDelaySecMax) return 'Mars far'
  return null
}

const KIND_WORDS: Record<GroundMessage['kind'], string> = {
  report: 'a report',
  consult: 'a consult request',
}

const MESSAGE_STATUS_WORDS: Record<GroundMessage['status'], string> = {
  queued: 'Queued for Earth',
  in_transit: 'On its way to Earth',
  delivered: 'Delivered to Earth',
}

/** "Queued for Earth: a report" */
export function messageWords(message: GroundMessage): string {
  return `${MESSAGE_STATUS_WORDS[message.status]}: ${KIND_WORDS[message.kind]}`
}
