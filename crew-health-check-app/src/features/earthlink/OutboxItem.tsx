import { Tag } from '../../components/Tag.tsx'
import {
  formatTimeOfDay,
  missionDayOf,
  type CrewMember,
  type GroundMessage,
} from '../../engine/index.ts'
import { crewLabel } from '../../lib/labels.ts'
import { messageWords } from '../../lib/route.ts'

const STEPS: { status: GroundMessage['status']; label: string }[] = [
  { status: 'queued', label: 'In the outbox' },
  { status: 'in_transit', label: 'On its way' },
  { status: 'delivered', label: 'Delivered' },
]

/** "09:03 on day 142" */
function when(ms: number): string {
  return `${formatTimeOfDay(ms)} on day ${missionDayOf(ms)}`
}

function isPrivate(message: GroundMessage): boolean {
  return message.body.startsWith('Private medical.')
}

/** Where the message is now, in words, with a progress bar while it travels. */
function Progress({
  message,
  nowMs,
  linkUp,
}: {
  message: GroundMessage
  nowMs: number
  linkUp: boolean
}) {
  if (message.status === 'queued') {
    return (
      <p>
        {linkUp
          ? 'Leaving now.'
          : 'Waiting for the link: it leaves when the link is back up.'}
      </p>
    )
  }
  const departed = message.departedAtMs ?? message.sentAtMs
  const arrives = message.arrivesAtMs ?? departed
  if (message.status === 'delivered') {
    return <p>Arrived at Earth at {when(arrives)}.</p>
  }
  const span = Math.max(arrives - departed, 1)
  const share = Math.min(Math.max((nowMs - departed) / span, 0), 1)
  return (
    <div>
      <progress
        value={share}
        max={1}
        aria-label="Way to Earth"
        className="h-3 w-full max-w-sm"
      />
      <p>
        {Math.round(share * 100)}% of the way. Arrives at {when(arrives)}.
      </p>
    </div>
  )
}

/** One message in the outbox (section 15). Private messages show no content. */
export function OutboxItem({
  message,
  sender,
  nowMs,
  linkUp,
}: {
  message: GroundMessage
  sender: CrewMember | undefined
  nowMs: number
  linkUp: boolean
}) {
  const current = STEPS.findIndex((step) => step.status === message.status)
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{message.title}</h3>
        <Tag>Simulated</Tag>
      </div>
      <p className="text-slate-700">
        {messageWords(message)} · from{' '}
        {sender ? crewLabel(sender) : message.crewId} · queued at{' '}
        {when(message.sentAtMs)}
      </p>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {STEPS.map((step, index) => (
          <li
            key={step.status}
            aria-current={index === current ? 'step' : undefined}
            className={index === current ? 'font-semibold' : 'text-slate-600'}
          >
            {index + 1}. {step.label}
            {index < current && ' (done)'}
          </li>
        ))}
      </ol>
      <div className="mt-2">
        <Progress message={message} nowMs={nowMs} linkUp={linkUp} />
      </div>
      {message.kind === 'consult' && message.replyDueAtMs !== null && (
        <p className="mt-1">
          Expected reply around {when(message.replyDueAtMs)}: there and back,
          plus the ground&rsquo;s handling time. Replies are not simulated in
          this prototype.
        </p>
      )}
      {isPrivate(message) ? (
        <p className="mt-1 text-slate-700">
          Private medical message: its text is not shown in this list.
        </p>
      ) : (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4">
            Message text
          </summary>
          <p className="whitespace-pre-line">{message.body}</p>
        </details>
      )}
    </li>
  )
}
