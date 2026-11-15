import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { missionDayOf } from '../../engine/index.ts'

const MINUTE_MS = 60_000

/** "day 142, 08:25" in mission time. */
export function whenText(atMs: number): string {
  return `day ${missionDayOf(atMs)}, ${formatTimeOfDay(atMs)}`
}

/** "35 min ago", "2 h 5 min ago" or "3 days ago". */
export function agoText(nowMs: number, atMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - atMs) / MINUTE_MS))
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) {
    const rest = minutes % 60
    return `${Math.floor(minutes / 60)} h${rest > 0 ? ` ${rest} min` : ''} ago`
  }
  const days = Math.floor(minutes / (24 * 60))
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export function formatTempC(tempC: number): string {
  return `${tempC.toFixed(1)} °C`
}
