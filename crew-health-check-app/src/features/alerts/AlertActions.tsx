import { useEffect, useRef, useState } from 'react'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../../components/buttonStyles.ts'
import { Tag } from '../../components/Tag.tsx'
import type { Alert } from '../../engine/index.ts'
import { messageWords } from '../../lib/route.ts'
import { useAppStore } from '../../store/index.ts'

/**
 * "Acknowledge", and "Send to ground" for a self-care alert (section 19.4).
 * When a button is replaced by its result, focus moves to the result so a
 * keyboard user is not dropped at the top of the page.
 */
export function AlertActions({ alert }: { alert: Alert }) {
  const acknowledgedAtMs = useAppStore(
    (state) => state.alertState[alert.key]?.acknowledgedAtMs ?? null,
  )
  const sent = useAppStore((state) =>
    state.outbox.find(
      (message) => message.alertKey === alert.key && message.kind === 'consult',
    ),
  )
  const acknowledgeAlert = useAppStore((state) => state.acknowledgeAlert)
  const sendToGround = useAppStore((state) => state.sendToGround)
  const [error, setError] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<'ack' | 'sent' | null>(null)
  const ackRef = useRef<HTMLParagraphElement>(null)
  const sentRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (focusTarget === 'ack') ackRef.current?.focus()
    if (focusTarget === 'sent') sentRef.current?.focus()
  }, [focusTarget, acknowledgedAtMs, sent])

  function send() {
    const result = sendToGround(alert.key)
    if (result.ok) {
      setError(null)
      setFocusTarget('sent')
    } else {
      setError(result.message)
    }
  }

  return (
    <section
      aria-label="Alert actions"
      className="flex flex-wrap items-center gap-3"
    >
      {acknowledgedAtMs === null ? (
        <button
          type="button"
          className={PRIMARY_BUTTON}
          onClick={() => {
            acknowledgeAlert(alert.key)
            setFocusTarget('ack')
          }}
        >
          Acknowledge
        </button>
      ) : (
        <p ref={ackRef} tabIndex={-1} className="font-semibold">
          Acknowledged at {formatTimeOfDay(acknowledgedAtMs)} mission time.
        </p>
      )}
      {alert.route === 'self_care' &&
        (sent ? (
          <p
            ref={sentRef}
            tabIndex={-1}
            className="flex flex-wrap items-center gap-2"
          >
            Sent to ground at {formatTimeOfDay(sent.sentAtMs)} mission time.{' '}
            {messageWords(sent)}.<Tag>Simulated</Tag>
          </p>
        ) : (
          <button type="button" className={SECONDARY_BUTTON} onClick={send}>
            Send to ground
          </button>
        ))}
      {error && (
        <p role="alert" className="font-semibold text-status-act-fg">
          {error}
        </p>
      )}
    </section>
  )
}
