import type { MissionDay, MissionMs } from './types.ts'

export const MS_PER_DAY = 86_400_000

/** Mission day 1 starts at mission time 0 (ARCHITECTURE.md section 16). */
export function missionDayOf(ms: MissionMs): MissionDay {
  return Math.floor(ms / MS_PER_DAY) + 1
}

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/** "09:00" for a mission time. */
export function formatTimeOfDay(ms: MissionMs): string {
  const intoDay = ms % MS_PER_DAY
  const hours = Math.floor(intoDay / HOUR_MS)
  const minutes = Math.floor((intoDay % HOUR_MS) / MINUTE_MS)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
