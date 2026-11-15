import { SatelliteDish, TriangleAlert, UserCheck } from 'lucide-react'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { Tag } from '../../components/Tag.tsx'
import { STATUS_DISPLAY } from '../../components/statusDisplay.ts'
import { linkDefaults } from '../../data/index.ts'
import type { Alert, Protocol, Route } from '../../engine/index.ts'
import { firstSteps } from '../../lib/alerts.ts'
import { delayWords, messageWords, routeSentence } from '../../lib/route.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEnvironment } from '../../store/selectors.ts'

const ROUTE_ICON: Record<Route, typeof TriangleAlert> = {
  act_on_board: TriangleAlert,
  consult_ground: SatelliteDish,
  self_care: UserCheck,
}

/** How the reply estimate is made, and that it is an estimate (section 13.2). */
function EstimateNote({ alert }: { alert: Alert }) {
  const link = useAppStore((state) => state.mission.link)
  const environment = useAppStore(selectEnvironment)
  if (alert.replyEtaMin === null || alert.route === 'self_care') return null
  return (
    <p className="mt-3">
      This is an estimate, not a promise: the signal there and back (
      {delayWords(link.oneWayDelaySec)} each way) plus time for the ground to
      answer. {environment?.notes} {linkDefaults.groundHandlingNote}
    </p>
  )
}

/** Messages already in the simulated outbox for this alert. */
function QueuedMessages({ alert }: { alert: Alert }) {
  const outbox = useAppStore((state) => state.outbox)
  const linkUp = useAppStore((state) => state.mission.link.linkUp)
  const messages = outbox.filter((message) => message.alertKey === alert.key)
  if (messages.length === 0) return null
  return (
    <div className="mt-3">
      <ul>
        {messages.map((message) => (
          <li key={message.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{messageWords(message)}</span>
            <span>at {formatTimeOfDay(message.sentAtMs)} mission time.</span>
            <Tag>Simulated</Tag>
          </li>
        ))}
      </ul>
      {!linkUp && <p>Will send when the link returns.</p>}
    </div>
  )
}

/**
 * Section 1 of the alert screen: who leads, with the reply estimate. An act
 * alert shows its first steps here, before anything else, whatever the
 * route: triage decides who leads, never whether help is shown (section 13.4).
 */
export function RouteBanner({
  alert,
  protocol,
}: {
  alert: Alert
  protocol: Protocol
}) {
  const Icon = ROUTE_ICON[alert.route]
  const act = alert.severity === 'act'
  return (
    <section
      aria-labelledby="route-heading"
      data-section="route"
      className={`rounded-lg border-2 p-4 ${STATUS_DISPLAY[alert.severity].classes}`}
    >
      <h2 id="route-heading" className="text-lg font-semibold">
        Who leads
      </h2>
      <p className="mt-1 flex items-start gap-2 text-xl font-semibold">
        <Icon aria-hidden="true" size={26} className="mt-0.5 shrink-0" />
        <span>{routeSentence(alert.route, alert.replyEtaMin)}</span>
      </p>
      {act && alert.route === 'consult_ground' && (
        <p className="mt-2 text-lg font-semibold">
          Start the first steps now. The reply estimate is not a reason to wait.
        </p>
      )}
      {act && (
        <div className="mt-3">
          <h3 className="font-semibold">First steps</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-6 text-lg">
            {firstSteps(protocol).map((step) => (
              <li key={step.text}>{step.text}</li>
            ))}
          </ol>
          <p className="mt-1">
            Every step, with a checklist, is under &ldquo;What to do&rdquo;.
          </p>
        </div>
      )}
      <EstimateNote alert={alert} />
      <QueuedMessages alert={alert} />
    </section>
  )
}
