import { Card } from '../../components/Card.tsx'
import { Tag } from '../../components/Tag.tsx'
import { linkDefaults } from '../../data/index.ts'
import { delayWords, distanceLabel } from '../../lib/route.ts'
import { environmentDef } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { OutboxItem } from './OutboxItem.tsx'

/**
 * The Earth link screen `#/earth-link` (sections 15 and 19.5): the delay, the
 * link state and every message on its way. Nothing is really sent; replies
 * were cut on 14 November 2026.
 */
export function EarthLinkPage() {
  const link = useAppStore((state) => state.mission.link)
  const nowMs = useAppStore((state) => state.mission.nowMs)
  const environmentId = useAppStore((state) => state.mission.environmentId)
  const crew = useAppStore((state) => state.crew)
  const outbox = useAppStore((state) => state.outbox)
  const distance = distanceLabel(
    environmentDef(environmentId),
    link.oneWayDelaySec,
  )
  const messages = [...outbox].sort((a, b) => b.sentAtMs - a.sentAtMs)

  return (
    <section aria-labelledby="earthlink-heading" className="space-y-4">
      <h1 id="earthlink-heading" className="text-2xl font-semibold">
        Earth link
      </h1>
      <Card title="Link" aside={<Tag>Simulated</Tag>}>
        <p className="text-xl font-semibold">
          {link.linkUp ? 'Link up' : 'Link down'}
        </p>
        <p className="mt-1">
          One-way delay: {delayWords(link.oneWayDelaySec)}
          {distance && ` (${distance})`}.{' '}
          {link.linkUp
            ? 'A message arrives one delay after it leaves.'
            : 'Messages wait in the outbox until the link is back up.'}
        </p>
        <p className="mt-1">
          Ground handling time: {link.groundHandlingMin} min.{' '}
          {linkDefaults.groundHandlingNote}
        </p>
      </Card>
      <Card title="Outbox">
        {messages.length === 0 ? (
          <p>Nothing has been sent to Earth yet.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <OutboxItem
                key={message.id}
                message={message}
                sender={crew.find((member) => member.id === message.crewId)}
                nowMs={nowMs}
                linkUp={link.linkUp}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
