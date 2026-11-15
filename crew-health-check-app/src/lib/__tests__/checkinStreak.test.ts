import { describe, expect, it } from 'vitest'
import type { IndicatorId, Reading } from '../../engine/index.ts'
import {
  CHECKIN_STEPS,
  checkinStreak,
  streakMilestone,
  type CheckinRecords,
} from '../checkin.ts'

// The check-in streak (ARCHITECTURE.md sections 19.1 and 31.11): derived
// from readings, counted up to today or yesterday, never stored.

const READING_INDICATORS: IndicatorId[] = CHECKIN_STEPS.filter(
  (step) => step.kind === 'number' || step.kind === 'scale',
).flatMap((step) => [...step.indicators])

function checkIn(
  day: number,
  options: { crewId?: string; skip?: IndicatorId; recheck?: IndicatorId } = {},
): Reading[] {
  return READING_INDICATORS.filter((id) => id !== options.skip).map((id) => ({
    crewId: options.crewId ?? 'c1',
    indicator: id,
    value: 1,
    day,
    atMs: (day - 1) * 86_400_000 + 8 * 3_600_000,
    origin: 'seed' as const,
    ...(options.recheck === id ? { purpose: 'recheck' as const } : {}),
  }))
}

function records(readings: Reading[], today: number): CheckinRecords {
  return { crewId: 'c1', today, readings, symptoms: [], noSymptomDays: {} }
}

const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) =>
    checkIn(from + index),
  ).flat()

describe('checkinStreak', () => {
  it("counts up to yesterday while today's check-in is not done", () => {
    expect(checkinStreak(records(days(1, 10), 11))).toBe(10)
  })

  it("includes today once today's check-in is complete", () => {
    expect(checkinStreak(records(days(1, 11), 11))).toBe(11)
  })

  it('starts again after a day without a check-in', () => {
    const readings = [...days(1, 4), ...days(6, 10)]
    expect(checkinStreak(records(readings, 11))).toBe(5)
  })

  it('needs every reading step: a day missing one does not count', () => {
    const readings = [
      ...days(1, 8),
      ...checkIn(9, { skip: 'mood' }),
      ...checkIn(10),
    ]
    expect(checkinStreak(records(readings, 11))).toBe(1)
  })

  it('never counts an urgent re-check as the day’s reading', () => {
    const readings = [
      ...days(1, 9),
      ...checkIn(10, { recheck: 'blood_glucose' }),
    ]
    expect(checkinStreak(records(readings, 11))).toBe(0)
  })

  it("counts only the active crew member's readings", () => {
    const readings = days(1, 10).map((reading) => ({
      ...reading,
      crewId: 'c2',
    }))
    expect(checkinStreak(records(readings, 11))).toBe(0)
  })

  it('is zero without readings, and never counts before mission day 1', () => {
    expect(checkinStreak(records([], 1))).toBe(0)
    expect(checkinStreak(records(checkIn(1), 1))).toBe(1)
  })
})

describe('streakMilestone', () => {
  it('names the highest milestone reached', () => {
    expect(streakMilestone(2)).toBeNull()
    expect(streakMilestone(3)).toBe('3-day check-in streak')
    expect(streakMilestone(13)).toBe('7-day check-in streak')
    expect(streakMilestone(14)).toBe('14-day check-in streak')
    expect(streakMilestone(141)).toBe('14-day check-in streak')
  })
})
