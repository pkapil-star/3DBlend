import { Link } from 'react-router'
import type { Alert } from '../engine/index.ts'
import { alertPath, firstSteps } from '../lib/alerts.ts'
import {
  ROUTE_WORDS,
  protocolById,
  regionLabel,
  ruleById,
} from '../lib/labels.ts'
import { modelEvidenceOf } from '../lib/modelScore.ts'
import { useAppStore } from '../store/index.ts'
import { StatusBadge } from './StatusBadge.tsx'
import { Tag } from './Tag.tsx'

/** One active alert in a list: severity, title link, area and route, and an act alert's first step. */
export function AlertItem({ alert }: { alert: Alert }) {
  const acknowledged = useAppStore(
    (state) => state.alertState[alert.key]?.acknowledgedAtMs != null,
  )
  const rule = ruleById(alert.ruleId)
  const protocol = rule ? protocolById(rule.protocolId) : null
  // An act alert shows its first step without a click (CLAUDE.md domain rule 8).
  const firstStep =
    alert.severity === 'act' && protocol ? firstSteps(protocol)[0] : undefined
  return (
    <li
      className="rounded-lg border border-slate-200 p-3"
      data-rule-id={alert.ruleId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={alert.severity} />
        <Link
          to={alertPath(alert.key)}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          {rule?.title ?? alert.ruleId}
        </Link>
        {/* An alert raised by a model always says so (CLAUDE.md). */}
        {modelEvidenceOf(alert) && <Tag>Model estimate</Tag>}
      </div>
      <p className="mt-1 text-slate-700">
        {regionLabel(alert.region)} · {ROUTE_WORDS[alert.route]}
        {acknowledged && ' · Acknowledged'}
      </p>
      {firstStep && (
        <p className="mt-1">
          <span className="font-semibold">Start now:</span> {firstStep.text}
        </p>
      )}
    </li>
  )
}
