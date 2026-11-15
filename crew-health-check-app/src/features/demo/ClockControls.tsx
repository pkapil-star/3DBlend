import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import {
  CLOCK_SPEEDS,
  formatTimeOfDay,
  type ClockSpeed,
} from '../../clock/missionClock.ts'
import { MS_PER_DAY, missionDayOf } from '../../engine/index.ts'
import { useAppStore } from '../../store/index.ts'

const SPEED_WORDS: Record<ClockSpeed, string> = {
  0: 'Paused',
  1: '1× (real time)',
  60: '60× (1 min a second)',
  600: '600× (10 min a second)',
}

const TEN_MINUTES_MS = 10 * 60_000

/** Mission clock for the presenter (section 16): pause, speed, "+10 min" and "+1 day". */
export function ClockControls() {
  const nowMs = useAppStore((state) => state.mission.nowMs)
  const speed = useAppStore((state) => state.mission.speed)
  const setSpeed = useAppStore((state) => state.setSpeed)
  const advanceTime = useAppStore((state) => state.advanceTime)

  return (
    <section aria-labelledby="clock-title">
      <h3 id="clock-title" className="text-lg font-semibold">
        Mission clock
      </h3>
      <p className="mt-1">
        Day {missionDayOf(nowMs)}, {formatTimeOfDay(nowMs)} ·{' '}
        {SPEED_WORDS[speed]}
      </p>
      <div
        role="group"
        aria-label="Clock speed"
        className="mt-2 flex flex-wrap gap-2"
      >
        {CLOCK_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={speed === option}
            onClick={() => setSpeed(option)}
            className={`${SECONDARY_BUTTON} ${speed === option ? 'bg-slate-900 text-white hover:bg-slate-700' : ''}`}
          >
            {SPEED_WORDS[option]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => advanceTime(TEN_MINUTES_MS)}
        >
          +10 min
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => advanceTime(MS_PER_DAY)}
        >
          +1 day
        </button>
      </div>
    </section>
  )
}
