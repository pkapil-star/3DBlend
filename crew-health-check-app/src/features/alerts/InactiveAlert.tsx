import { Link } from 'react-router'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { latestReading, recheckName } from '../../engine/index.ts'
import { alertPath, recheckIndicators, ruleIdOfKey } from '../../lib/alerts.ts'
import { formatValue, ruleById } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEvaluation } from '../../store/selectors.ts'

/**
 * An alert key that is not active now: the condition stopped being met (for
 * example after a normal re-check), a stronger alert covers it, or the link
 * is out of date.
 */
export function InactiveAlert({ alertKey }: { alertKey: string }) {
  const evaluation = useAppStore(selectEvaluation)
  const readings = useAppStore((state) => state.readings)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const rule = ruleById(ruleIdOfKey(alertKey))
  const own = readings.filter((reading) => reading.crewId === crewId)
  const superseded = evaluation.alerts.find(
    (alert) => alert.key === alertKey && alert.supersededBy !== null,
  )
  const stronger = superseded
    ? evaluation.alerts.find(
        (alert) =>
          alert.ruleId === superseded.supersededBy &&
          alert.crewId === superseded.crewId,
      )
    : undefined

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {rule ? rule.title : 'Alert not found'}
      </h1>
      {stronger ? (
        <p>
          A stronger alert covers this one:{' '}
          <Link
            to={alertPath(stronger.key)}
            className="underline underline-offset-4"
          >
            {ruleById(stronger.ruleId)?.title ?? stronger.ruleId}
          </Link>
          .
        </p>
      ) : (
        <p role="status">
          This alert is not active now: the latest data no longer meets its
          condition.
        </p>
      )}
      {rule && !stronger && (
        <ul className="space-y-1">
          {recheckIndicators(rule.when).map((def) => {
            const latest = latestReading(own, def.id)
            if (!latest) return null
            return (
              <li key={def.id}>
                Latest {latest.recheck ? recheckName(def) : def.label}:{' '}
                <span className="text-xl font-semibold">
                  {formatValue(latest.value, def)}
                </span>{' '}
                at {formatTimeOfDay(latest.atMs)} on day {latest.day}.
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/" className={SECONDARY_BUTTON}>
        Back to Home
      </Link>
    </div>
  )
}
