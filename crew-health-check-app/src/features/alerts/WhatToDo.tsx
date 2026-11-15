import { Card } from '../../components/Card.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { Alert, Protocol, Rule } from '../../engine/index.ts'
import { recheckIndicators } from '../../lib/alerts.ts'
import { recheckWords } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { RecheckForm } from './RecheckForm.tsx'

/**
 * Section 4 of the alert screen: the protocol as a checklist whose ticks
 * persist. While a protocol is not reviewed it carries "Draft guidance" and
 * its note (section 18).
 */
export function WhatToDo({
  alert,
  rule,
  protocol,
}: {
  alert: Alert
  rule: Rule
  protocol: Protocol
}) {
  const stepsDone = useAppStore(
    (state) => state.alertState[alert.key]?.stepsDone,
  )
  const toggleStep = useAppStore((state) => state.toggleStep)
  const done = (stepsDone ?? []).filter(
    (index) => index < protocol.steps.length,
  )

  return (
    <Card
      title="What to do"
      aside={!protocol.reviewed && <Tag>Draft guidance</Tag>}
    >
      <p className="font-semibold">{protocol.title}</p>
      <p className="mt-1 text-slate-700">{protocol.note}</p>
      <fieldset className="mt-3">
        <legend className="sr-only">
          Steps: tick each step when it is done
        </legend>
        <ol className="space-y-1">
          {protocol.steps.map((step, index) => (
            <li key={step.text}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={done.includes(index)}
                  onChange={() => toggleStep(alert.key, index)}
                  className="mt-1 size-6 shrink-0"
                />
                <span>
                  <span className="font-semibold">Step {index + 1}.</span>{' '}
                  {step.text}
                  {step.detail && (
                    <span className="mt-1 block text-slate-700">
                      {step.detail}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ol>
      </fieldset>
      <p className="mt-2">
        Steps done: {done.length} of {protocol.steps.length}
      </p>
      {protocol.recheckAfterHours !== null && (
        <p className="mt-2">
          <span className="font-semibold">Re-check:</span> after about{' '}
          {recheckWords(protocol.recheckAfterHours)}.
        </p>
      )}
      <p className="mt-2">
        <span className="font-semibold">Get help sooner if:</span>{' '}
        {protocol.escalateIf}
      </p>
      {recheckIndicators(rule.when).map((def) => (
        <RecheckForm key={def.id} def={def} />
      ))}
    </Card>
  )
}
