import { Card } from '../../components/Card.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { Alert, Evaluation } from '../../engine/index.ts'
import { missingDataText } from '../../lib/alerts.ts'
import { ModelEvidenceDetails } from './ModelEvidenceDetails.tsx'

/** Section 2 of the alert screen: the evidence, and what is missing. */
export function WhatChanged({
  alert,
  evaluation,
}: {
  alert: Alert
  evaluation: Evaluation
}) {
  const missing = missingDataText(evaluation, alert.region)
  return (
    <Card title="What changed">
      <ul className="space-y-3">
        {alert.evidence.map((item) => (
          <li key={`${item.label}:${item.value}`}>
            <span className="font-semibold">{item.label}:</span>{' '}
            <span className="text-xl font-semibold">{item.value}</span>
            {/* A model output never appears without its tag (CLAUDE.md). */}
            {item.model && (
              <>
                {' '}
                <Tag>Model estimate</Tag>
              </>
            )}
            <span className="block text-slate-700">{item.reference}</span>
            {item.model && <ModelEvidenceDetails model={item.model} />}
          </li>
        ))}
      </ul>
      {missing && (
        // Missing data stays visible next to an alert and is never read as
        // normal (section 9).
        <p className="mt-3">
          <span className="font-semibold">{missing}.</span> Missing readings are
          not counted as normal.
        </p>
      )}
    </Card>
  )
}
