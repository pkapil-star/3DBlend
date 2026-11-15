import { useState } from 'react'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { missionDayOf } from '../../engine/index.ts'
import { useAppStore } from '../../store/index.ts'

/**
 * "Restart suit replay" (section 24.5): anchors the simulated suit sensor
 * replay at the current mission time. Health alerts and messages are not
 * touched, because suit samples are never a health input (decision D11).
 */
export function SuitReplayControls() {
  const restartSuitReplay = useAppStore((state) => state.restartSuitReplay)
  const nowMs = useAppStore((state) => state.mission.nowMs)
  const [restartedAt, setRestartedAt] = useState<number | null>(null)

  function restart() {
    restartSuitReplay()
    setRestartedAt(nowMs)
  }

  return (
    <section aria-labelledby="suit-replay-title">
      <h3 id="suit-replay-title" className="text-lg font-semibold">
        Simulated suit sensors
      </h3>
      <p className="mt-1 text-slate-700">
        Starts the simulated suit replay again from the current mission time.
        Health alerts and messages are not affected.
      </p>
      <button
        type="button"
        className={`${SECONDARY_BUTTON} mt-2`}
        onClick={restart}
      >
        Restart suit replay
      </button>
      <p role="status" className="mt-2">
        {restartedAt !== null &&
          `Suit replay restarted at day ${missionDayOf(restartedAt)}, ${formatTimeOfDay(restartedAt)}.`}
      </p>
    </section>
  )
}
