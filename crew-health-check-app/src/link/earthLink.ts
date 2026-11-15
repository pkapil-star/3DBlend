import type {
  Alert,
  GroundMessage,
  Insight,
  LinkState,
  Route,
} from '../engine/index.ts'
import { messageId } from '../lib/ids.ts'
import { routeSentence } from '../lib/route.ts'

// The simulated outbox to Earth (ARCHITECTURE.md section 15). Nothing is
// really sent anywhere. A message waits in the outbox while the link is down,
// travels for the one-way delay, and is delivered. Simulated replies were cut
// (14 November 2026): a consult shows only when a reply could be expected.

export type MessageKind = GroundMessage['kind']

/**
 * Acting on board sends the ground a report; consulting the ground sends a
 * consult. Self care sends nothing unless the crew member chooses to.
 */
export function kindForRoute(route: Route): MessageKind | null {
  if (route === 'act_on_board') return 'report'
  if (route === 'consult_ground') return 'consult'
  return null
}

export function hasMessage(
  outbox: readonly GroundMessage[],
  alertKey: string,
  kind: MessageKind,
): boolean {
  return outbox.some(
    (message) => message.alertKey === alertKey && message.kind === kind,
  )
}

/** The outbox title of an insight the crew chose to send (section 26.17). */
export const SECOND_OPINION_TITLE = 'Second opinion sent by crew'

export interface InsightMessageInput {
  insight: Insight
  /** The model file's headline and caveat. */
  headline: string
  caveat: string
  /** One line per factor, written for the ground. */
  factorLines: readonly string[]
  /** "Crew member A, Commander" */
  sender: string
  nowMs: number
}

/**
 * A consult the crew chose to send from a second-opinion insight; never sent
 * automatically. Marked private, because mood is among the model's inputs and
 * mood is private (section 28). It names no route: a second opinion never
 * sets one.
 */
export function composeInsightMessage(
  input: InsightMessageInput,
): GroundMessage {
  const { insight } = input
  const lines = [
    'Private medical.',
    `From ${input.sender}, mission day ${insight.day}.`,
    `${SECOND_OPINION_TITLE}. Insight shown to the crew: "${input.headline}" (model estimate, ${insight.modelId} ${insight.modelVersion}).`,
    ...input.factorLines.map((line) => `What changed: ${line}.`),
    input.caveat,
    'Not an alert: a second opinion never sets a status or a route.',
  ]
  return {
    id: messageId('consult', insight.key),
    crewId: insight.crewId,
    alertKey: null,
    insightKey: insight.key,
    kind: 'consult',
    title: SECOND_OPINION_TITLE,
    body: lines.join('\n'),
    sentAtMs: input.nowMs,
    arrivesAtMs: null,
    replyDueAtMs: null,
    status: 'queued',
  }
}

const MS_PER_SEC = 1000
const MS_PER_MIN = 60_000

/** A consult's expected reply: there and back, plus the ground's handling time (section 13.2). */
export function replyDueAtMs(departedAtMs: number, link: LinkState): number {
  const oneWayMs = link.oneWayDelaySec * MS_PER_SEC
  return (
    departedAtMs + oneWayMs + link.groundHandlingMin * MS_PER_MIN + oneWayMs
  )
}

/**
 * The outbox at mission time `nowMs` (section 15). Pure. A queued message
 * leaves while the link is up, at the later of the moment it was queued and
 * the moment the link came up; it arrives one delay later. A message already
 * on its way keeps going when the link goes down. Returns the same array when
 * nothing changed, so the store does not write for nothing.
 */
export function advance(
  messages: readonly GroundMessage[],
  nowMs: number,
  link: LinkState,
): GroundMessage[] {
  let changed = false
  const next = messages.map((message) => {
    let current = message
    if (current.status === 'queued' && link.linkUp) {
      const departedAtMs = Math.max(current.sentAtMs, link.upSinceMs ?? 0)
      if (departedAtMs <= nowMs) {
        current = {
          ...current,
          status: 'in_transit',
          departedAtMs,
          arrivesAtMs: departedAtMs + link.oneWayDelaySec * MS_PER_SEC,
          replyDueAtMs:
            current.kind === 'consult'
              ? replyDueAtMs(departedAtMs, link)
              : null,
        }
      }
    }
    if (
      current.status === 'in_transit' &&
      current.arrivesAtMs !== null &&
      nowMs >= current.arrivesAtMs
    ) {
      current = { ...current, status: 'delivered' }
    }
    if (current !== message) changed = true
    return current
  })
  return changed ? next : (messages as GroundMessage[])
}

export interface AlertMessageInput {
  kind: MessageKind
  alert: Alert
  /** The rule's headline. */
  title: string
  privateToCrew: boolean
  /** "Crew member A, Commander" */
  sender: string
  day: number
  nowMs: number
  /** Indexes of the protocol steps ticked so far. */
  stepsDone: readonly number[]
}

/**
 * The message says who, which day, what changed, the route and the steps
 * already done (section 15). Private rules are marked "Private medical" and
 * listed only as "Private message".
 */
export function composeAlertMessage(input: AlertMessageInput): GroundMessage {
  const { alert } = input
  const steps =
    input.stepsDone.length === 0
      ? 'none yet'
      : [...input.stepsDone]
          .sort((a, b) => a - b)
          .map((index) => index + 1)
          .join(', ')
  const lines = [
    ...(input.privateToCrew ? ['Private medical.'] : []),
    `From ${input.sender}, mission day ${input.day}.`,
    `Alert: ${input.title}.`,
    ...alert.evidence.map(
      (item) =>
        `What changed: ${item.label}: ${item.value} (${item.reference}).`,
    ),
    `Route: ${routeSentence(alert.route, alert.replyEtaMin)}`,
    `Steps done so far: ${steps}.`,
  ]
  return {
    id: messageId(input.kind, alert.key),
    crewId: alert.crewId,
    alertKey: alert.key,
    insightKey: null,
    kind: input.kind,
    title: input.privateToCrew ? 'Private message' : input.title,
    body: lines.join('\n'),
    sentAtMs: input.nowMs,
    arrivesAtMs: null,
    replyDueAtMs: null,
    status: 'queued',
  }
}
