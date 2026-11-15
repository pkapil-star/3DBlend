import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TICK_MS, startMissionClock } from '../missionClock.ts'

// The ticker (ARCHITECTURE.md section 16): mission time moves by the real
// time that passed times the speed, at most four writes a second.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('startMissionClock', () => {
  it('at 600×, one real second moves the mission ten minutes, in four writes', () => {
    const writes: number[] = []
    const stop = startMissionClock(
      () => 600,
      (ms) => writes.push(ms),
    )
    vi.advanceTimersByTime(1000)
    stop()
    expect(TICK_MS).toBe(250)
    expect(writes).toHaveLength(4)
    expect(writes.reduce((sum, ms) => sum + ms, 0)).toBe(600_000)
  })

  it('writes nothing while paused, and nothing after it is stopped', () => {
    let speed = 0
    const writes: number[] = []
    const stop = startMissionClock(
      () => speed,
      (ms) => writes.push(ms),
    )
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
    speed = 60
    vi.advanceTimersByTime(250)
    expect(writes).toEqual([15_000])
    stop()
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([15_000])
  })
})
