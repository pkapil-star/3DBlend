import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { Tag } from '../../components/Tag.tsx'
import type { ScenarioIndex } from '../../engine/index.ts'
import { environmentDef } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { fetchScenario, fetchScenarioIndex } from '../../store/seed.ts'

type IndexState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; index: ScenarioIndex }

/**
 * Loads one of the simulated scenarios (section 24). Loading replaces the
 * crew's readings, alert ticks and outbox with the scenario's own data.
 */
export function ScenarioPicker({ onLoaded }: { onLoaded: () => void }) {
  const loadScenario = useAppStore((state) => state.loadScenario)
  const currentId = useAppStore((state) => state.mission.scenarioId)
  const navigate = useNavigate()
  const [state, setState] = useState<IndexState>({ status: 'loading' })
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchScenarioIndex()
      .then((index) => {
        if (!cancelled) setState({ status: 'ready', index })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function load(scenarioId: string) {
    setLoadingId(scenarioId)
    setError(null)
    try {
      loadScenario(await fetchScenario(scenarioId))
      navigate('/')
      onLoaded()
    } catch {
      setError('The scenario could not be loaded. Try again.')
    } finally {
      setLoadingId(null)
    }
  }

  if (state.status === 'loading') {
    return <p role="status">Loading the scenario list…</p>
  }
  if (state.status === 'error') {
    return <p role="alert">The scenario list could not be loaded.</p>
  }
  return (
    <div>
      <h3 className="text-lg font-semibold">Load a scenario</h3>
      <p className="mt-1 text-slate-700">
        The crew members and their health readings are simulated in every
        scenario. A scenario marked &ldquo;Historical solar event&rdquo; also
        replays real records from NASA&rsquo;s DONKI catalog.
      </p>
      <ul className="mt-3 space-y-3">
        {state.index.scenarios.map((scenario) => (
          <li
            key={scenario.scenarioId}
            className="rounded-lg border border-slate-200 p-3"
          >
            <p className="font-semibold">{scenario.title}</p>
            <p className="text-slate-700">
              Day {scenario.missionDay} ·{' '}
              {environmentDef(scenario.environmentId).label}
              {scenario.scenarioId === currentId && ' · Loaded now'}
            </p>
            {scenario.basedOn && (
              <p className="mt-1">
                <Tag>Historical solar event</Tag>{' '}
                <span className="break-words">{scenario.basedOn}</span>
              </p>
            )}
            <button
              type="button"
              className={`mt-2 ${SECONDARY_BUTTON}`}
              aria-label={`Load scenario: ${scenario.title}`}
              disabled={loadingId !== null}
              onClick={() => void load(scenario.scenarioId)}
            >
              {loadingId === scenario.scenarioId ? 'Loading…' : 'Load'}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 font-semibold text-status-act-fg">
          {error}
        </p>
      )}
    </div>
  )
}
