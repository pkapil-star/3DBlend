import { useEffect } from 'react'
import { useAppStore } from '../store/index.ts'
import { startMissionClock } from './missionClock.ts'

/**
 * Runs the mission clock while the app is open (section 16). Paused by
 * default: a scenario loads at speed 0, so time moves only when the
 * presenter tools set a speed.
 */
export function useMissionClock(): void {
  useEffect(
    () =>
      startMissionClock(
        () => useAppStore.getState().mission.speed,
        (missionMs) => useAppStore.getState().advanceTime(missionMs),
      ),
    [],
  )
}
