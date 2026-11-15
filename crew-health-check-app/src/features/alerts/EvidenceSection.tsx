import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { SourceList } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { Alert, Protocol, Rule } from '../../engine/index.ts'
import { BASIS_EXPLAIN, BASIS_WORDS } from '../../lib/labels.ts'
import {
  SEP_RISK_CARD_PATH,
  modelEvidenceOf,
  modelName,
} from '../../lib/modelScore.ts'

/** Section 5 of the alert screen: where the check and its steps come from. */
export function EvidenceSection({
  alert,
  rule,
  protocol,
}: {
  alert: Alert
  rule: Rule
  protocol: Protocol
}) {
  const stepSources = protocol.sourceIds.filter(
    (id) => !rule.sourceIds.includes(id),
  )
  const model = modelEvidenceOf(alert)
  return (
    <Card title="Evidence">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Basis:</span>
        <Tag>{BASIS_WORDS[rule.basis]}</Tag>
        {model && <Tag>Model estimate</Tag>}
      </p>
      <p className="mt-1">{BASIS_EXPLAIN[rule.basis]}</p>
      {model && (
        <p className="mt-2">
          This alert comes from the experimental model {modelName(model)}, not
          from a measurement of the crew. Its alert level is read from the
          model&rsquo;s own file.{' '}
          <Link
            to={SEP_RISK_CARD_PATH}
            className="font-semibold underline underline-offset-4"
          >
            How this model was made
          </Link>
        </p>
      )}
      <h3 className="mt-4 font-semibold">Sources for this check</h3>
      <div className="mt-1">
        <SourceList sourceIds={rule.sourceIds} />
      </div>
      {stepSources.length > 0 && (
        <>
          <h3 className="mt-4 font-semibold">Sources for the steps</h3>
          <div className="mt-1">
            <SourceList sourceIds={stepSources} />
          </div>
        </>
      )}
      <p className="mt-4 text-slate-700">
        &ldquo;Unverified source&rdquo; means no team member has checked the
        source yet. A checked source is still not clinical validation.
      </p>
    </Card>
  )
}
