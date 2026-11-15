import { Link, useParams } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { StatusBadge } from '../../components/StatusBadge.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { Alert, Evaluation } from '../../engine/index.ts'
import { contributingAlerts } from '../../lib/alerts.ts'
import {
  crewLabel,
  protocolById,
  regionLabel,
  ruleById,
} from '../../lib/labels.ts'
import { SEP_RISK_CARD_PATH } from '../../lib/modelScore.ts'
import { useAppStore } from '../../store/index.ts'
import { selectActiveCrew, selectEvaluation } from '../../store/selectors.ts'
import { AlertActions } from './AlertActions.tsx'
import { EvidenceSection } from './EvidenceSection.tsx'
import { InactiveAlert } from './InactiveAlert.tsx'
import { RouteBanner } from './RouteBanner.tsx'
import { WhatChanged } from './WhatChanged.tsx'
import { WhatToDo } from './WhatToDo.tsx'
import { WhyItMatters } from './WhyItMatters.tsx'

/** Section 6 of the alert screen: alerts this one covers. */
function AlsoContributing({
  alert,
  evaluation,
}: {
  alert: Alert
  evaluation: Evaluation
}) {
  const covered = contributingAlerts(evaluation, alert)
  if (covered.length === 0) return null
  return (
    <Card title="Also contributing">
      <ul className="space-y-2">
        {covered.map((other) => (
          <li key={other.key}>
            <span className="font-semibold">
              {ruleById(other.ruleId)?.title ?? other.ruleId}
            </span>
            {other.evidence.map((item) => (
              <span key={item.label} className="block text-slate-700">
                {item.label}: {item.value}
                {/* A model score keeps its tag and its limits here too. */}
                {item.model && (
                  <>
                    {' '}
                    <Tag>Model estimate</Tag>{' '}
                    <span className="block">
                      An experimental score with frequent false alarms, not a
                      validated probability.{' '}
                      <Link
                        to={SEP_RISK_CARD_PATH}
                        className="underline underline-offset-4"
                      >
                        How this model was made
                      </Link>
                    </span>
                  </>
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Alert detail `#/alert/:alertKey` (section 19.4). The sections keep a fixed
 * order: route banner, what changed, why it matters, what to do, evidence,
 * and "also contributing" when it applies.
 */
export function AlertPage() {
  const { alertKey = '' } = useParams()
  const evaluation = useAppStore(selectEvaluation)
  const crew = useAppStore(selectActiveCrew)
  const alert = evaluation.alerts.find(
    (entry) => entry.key === alertKey && entry.supersededBy === null,
  )
  const rule = alert ? ruleById(alert.ruleId) : null
  const protocol = rule ? protocolById(rule.protocolId) : null
  if (!alert || !rule || !protocol) return <InactiveAlert alertKey={alertKey} />

  return (
    <article aria-labelledby="alert-title" className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={alert.severity} />
          <h1 id="alert-title" className="text-2xl font-semibold">
            {rule.title}
          </h1>
        </div>
        <p className="mt-1 text-slate-700">
          {regionLabel(alert.region)}
          {crew && ` · ${crewLabel(crew)}`}
        </p>
      </div>
      <RouteBanner alert={alert} protocol={protocol} />
      <WhatChanged alert={alert} evaluation={evaluation} />
      <WhyItMatters rule={rule} />
      <WhatToDo alert={alert} rule={rule} protocol={protocol} />
      <EvidenceSection alert={alert} rule={rule} protocol={protocol} />
      <AlsoContributing alert={alert} evaluation={evaluation} />
      <AlertActions alert={alert} />
    </article>
  )
}
