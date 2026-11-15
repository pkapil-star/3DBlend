import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import type { Evaluation } from '../../engine/index.ts'
import {
  checkinProgress,
  checkinStreak,
  streakMilestone,
} from '../../lib/checkin.ts'
import { indicatorDef } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { selectToday } from '../../store/selectors.ts'

/** Today's check-in progress and routine prompts (sections 9 and 19.1). */
export function TodayCard({ evaluation }: { evaluation: Evaluation }) {
  const today = useAppStore(selectToday)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const readings = useAppStore((state) => state.readings)
  const symptoms = useAppStore((state) => state.symptoms)
  const noSymptomDays = useAppStore((state) => state.noSymptomDays)
  const progress = checkinProgress({
    crewId,
    today,
    readings,
    symptoms,
    noSymptomDays,
  })
  const allDone = progress.done === progress.total
  const streak = checkinStreak({
    crewId,
    today,
    readings,
    symptoms,
    noSymptomDays,
  })
  const milestone = streakMilestone(streak)

  return (
    <Card title="Today">
      <p className="text-xl font-semibold">
        Check-in: {progress.done} of {progress.total} done
      </p>
      <Link
        to="/check-in"
        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 font-semibold text-white"
      >
        {progress.done === 0
          ? 'Start check-in'
          : allDone
            ? 'Review check-in'
            : 'Continue check-in'}
      </Link>

      {streak > 0 && (
        <p className="mt-3">
          <span className="font-semibold">Check-in streak:</span> {streak}{' '}
          {streak === 1 ? 'day' : 'days'}
          {milestone && ` (${milestone})`}
        </p>
      )}

      {progress.open.length > 0 && (
        <p className="mt-3">
          <span className="font-semibold">Still to do today:</span>{' '}
          {progress.open.join(', ')}
        </p>
      )}

      {evaluation.overdue.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold">Overdue measurements</h3>
          <ul className="mt-1 list-disc pl-6">
            {evaluation.overdue.map((id) => {
              const def = indicatorDef(id)
              return (
                <li key={id}>
                  {def.label}
                  {def.input === 'in_app_test' &&
                    ' (the in-app test is not available yet)'}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {evaluation.missingFeeds.length > 0 && (
        <p className="mt-4">
          <span className="font-semibold">Habitat feed:</span> no sample for
          today. Cabin CO2 and radiation cannot be checked until it arrives.
        </p>
      )}
    </Card>
  )
}
