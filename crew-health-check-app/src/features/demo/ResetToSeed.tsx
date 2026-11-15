import { useState } from 'react'
import { useNavigate } from 'react-router'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { useAppStore } from '../../store/index.ts'
import { fetchScenario } from '../../store/seed.ts'

/**
 * "Reset to seed" (section 16): reloads the current scenario from its file,
 * which discards everything entered since. It asks once before doing so.
 */
export function ResetToSeed({ onDone }: { onDone: () => void }) {
  const scenarioId = useAppStore((state) => state.mission.scenarioId)
  const loadScenario = useAppStore((state) => state.loadScenario)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!scenarioId) return null

  async function reset(id: string) {
    setError(null)
    try {
      loadScenario(await fetchScenario(id))
      void navigate('/')
      onDone()
    } catch {
      setError('The scenario could not be loaded. Try again.')
    }
  }

  return (
    <section aria-labelledby="reset-title">
      <h3 id="reset-title" className="text-lg font-semibold">
        Reset to seed
      </h3>
      <p className="mt-1 text-slate-700">
        Reloads the current scenario and discards check-ins, ticked steps and
        messages entered since.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => void reset(scenarioId)}
            >
              Yes, reset to seed
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => setConfirming(true)}
          >
            Reset to seed
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 font-semibold">
          {error}
        </p>
      )}
    </section>
  )
}
