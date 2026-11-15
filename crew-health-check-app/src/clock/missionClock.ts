import { MS_PER_DAY, missionDayOf } from '../engine/index.ts'

// Mission time is simulated: milliseconds since mission start, held in the
// store (ARCHITECTURE.md section 16). This is the only module allowed to read
// the real clock. The ticker moves mission time by the real time that passed
// times the speed, and writes it at most four times a second.

const HOUR_MS = 3_600_000

export const missionDay = missionDayOf

/** 09:00 on a mission day: the moment `loadScenario` sets (section 21). */
export function scenarioStartMs(day: number): number {
  return (day - 1) * MS_PER_DAY + 9 * HOUR_MS
}

/** Paused, real time, one minute a second, ten minutes a second. */
export const CLOCK_SPEEDS = [0, 1, 60, 600] as const
export type ClockSpeed = (typeof CLOCK_SPEEDS)[number]

/** At most four writes a second (section 16). */
export const TICK_MS = 250

/**
 * Starts the ticker. Every TICK_MS of real time it reports the mission time
 * that passed: the real time elapsed times the current speed. Nothing is
 * reported while paused. Returns the function that stops it.
 */
export function startMissionClock(
  speed: () => number,
  onAdvance: (missionMs: number) => void,
): () => void {
  let last = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    const elapsed = now - last
    last = now
    const factor = speed()
    if (factor > 0 && elapsed > 0) onAdvance(Math.round(elapsed * factor))
  }, TICK_MS)
  return () => clearInterval(timer)
}

export { formatTimeOfDay } from '../engine/index.ts'
