import { Link, useNavigate } from 'react-router'
import { BodyMap2D } from '../../components/BodyMap2D.tsx'
import { Card } from '../../components/Card.tsx'
import { StatusBadge } from '../../components/StatusBadge.tsx'
import { useAppStore } from '../../store/index.ts'
import { selectEvaluation } from '../../store/selectors.ts'
import { AlertList } from './AlertList.tsx'
import { HistoricalNote } from './HistoricalNote.tsx'
import { SecondOpinionsCard } from './SecondOpinionsCard.tsx'
import { StatusList } from './StatusList.tsx'
import { TodayCard } from './TodayCard.tsx'

/** Home (ARCHITECTURE.md section 19.1): "how am I doing today?" in five seconds. */
export function HomePage() {
  const evaluation = useAppStore(selectEvaluation)
  const hasReadings = useAppStore((state) =>
    state.readings.some(
      (reading) => reading.crewId === state.mission.activeCrewId,
    ),
  )
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">How you are doing today</h1>
        <StatusBadge status={evaluation.overall} />
      </div>
      <HistoricalNote />

      {!hasReadings && (
        <Card title="Welcome">
          <p>No readings yet for this mission.</p>
          <Link
            to="/check-in"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 font-semibold text-white"
          >
            Start your first check-in
          </Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title="Your body">
          <BodyMap2D
            regionStatus={evaluation.regionStatus}
            onSelect={(region) => void navigate(`/region/${region}`)}
          />
          <p className="mt-3 text-slate-600">
            Choose an area to see its readings and trends.
          </p>
        </Card>
        <div className="space-y-4">
          <AlertList evaluation={evaluation} />
          <SecondOpinionsCard evaluation={evaluation} />
          <TodayCard evaluation={evaluation} />
          <StatusList evaluation={evaluation} />
        </div>
      </div>
    </div>
  )
}
