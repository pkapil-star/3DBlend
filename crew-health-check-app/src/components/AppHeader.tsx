import { formatTimeOfDay } from '../clock/missionClock.ts'
import { crewLabel } from '../lib/labels.ts'
import { useAppStore } from '../store/index.ts'
import { selectActiveCrew, selectToday } from '../store/selectors.ts'
import { EnvironmentControls } from './EnvironmentControls.tsx'
import { Tag } from './Tag.tsx'

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium">
        {value ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not set yet</span>
          </>
        )}
      </dd>
    </div>
  )
}

export function AppHeader() {
  const loaded = useAppStore((state) => state.mission.scenarioId !== null)
  const crew = useAppStore(selectActiveCrew)
  const today = useAppStore(selectToday)
  const nowMs = useAppStore((state) => state.mission.nowMs)

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xl font-semibold">Crew Health Check</p>
          <Tag>Simulated data</Tag>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Fact
              label="Crew member"
              value={loaded && crew ? crewLabel(crew) : null}
            />
            <Fact label="Mission day" value={loaded ? `Day ${today}` : null} />
            <Fact
              label="Mission time"
              value={loaded ? formatTimeOfDay(nowMs) : null}
            />
          </dl>
          {loaded && <EnvironmentControls />}
        </div>
      </div>
    </header>
  )
}
