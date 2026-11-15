import { Link } from 'react-router'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../../components/buttonStyles.ts'
import { StatusBadge } from '../../components/StatusBadge.tsx'
import {
  CHECKIN_STEPS,
  todaysSymptoms,
  todaysValue,
  type CheckinRecords,
  type CheckinStep,
} from '../../lib/checkin.ts'
import { formatValue, indicatorDef, symptomLabel } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEvaluation } from '../../store/selectors.ts'

function stepSummary(step: CheckinStep, records: CheckinRecords): string {
  if (step.kind === 'coming_soon') return 'Coming soon'
  if (step.kind === 'symptoms') {
    const answered = todaysSymptoms(records)
    if (answered === null) return 'Not entered'
    return answered.length === 0
      ? 'None today'
      : answered.map(symptomLabel).join(', ')
  }
  const values = step.indicators.map((indicator) => {
    const value = todaysValue(records, indicator)
    return value === null ? null : formatValue(value, indicatorDef(indicator))
  })
  if (values.some((value) => value === null)) return 'Not entered'
  return values.join(' / ')
}

/** The last check-in step: today's values, the result, and Done. */
export function CheckinSummary({
  records,
  onBack,
}: {
  records: CheckinRecords
  onBack: () => void
}) {
  const evaluation = useAppStore(selectEvaluation)
  return (
    <div>
      <dl className="mt-4 divide-y divide-slate-200">
        {CHECKIN_STEPS.map((step) => (
          <div
            key={step.id}
            className="flex flex-wrap justify-between gap-x-4 py-2"
          >
            <dt className="font-semibold">{step.title}</dt>
            <dd className="text-xl">{stepSummary(step, records)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex flex-wrap items-center gap-2">
        <span>Your status after this check-in:</span>
        <StatusBadge status={evaluation.overall} />
      </p>
      <p className="mt-2 text-slate-700">
        Anything not entered stays due for today.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/" className={PRIMARY_BUTTON}>
          Done
        </Link>
        <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
