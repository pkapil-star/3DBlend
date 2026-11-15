import {
  isRecheck,
  type IndicatorId,
  type Reading,
  type SymptomReport,
} from '../engine/index.ts'

// The daily check-in's fixed step order (ARCHITECTURE.md section 19.2). Shared
// by the Check-in screen and Home's Today card.

export type CheckinStepKind = 'number' | 'scale' | 'symptoms' | 'coming_soon'

export interface CheckinStep {
  id: string
  title: string
  kind: CheckinStepKind
  /** Indicators entered on this step; blood pressure enters two. */
  indicators: readonly IndicatorId[]
}

export const CHECKIN_STEPS: readonly CheckinStep[] = [
  { id: 'sleep', title: 'Sleep', kind: 'number', indicators: ['sleep_hours'] },
  { id: 'mood', title: 'Mood', kind: 'scale', indicators: ['mood'] },
  { id: 'symptoms', title: 'Symptoms', kind: 'symptoms', indicators: [] },
  {
    id: 'blood-pressure',
    title: 'Blood pressure',
    kind: 'number',
    indicators: ['systolic_bp', 'diastolic_bp'],
  },
  {
    id: 'heart-rate',
    title: 'Heart rate',
    kind: 'number',
    indicators: ['heart_rate'],
  },
  {
    id: 'temperature',
    title: 'Temperature',
    kind: 'number',
    indicators: ['body_temp'],
  },
  {
    id: 'blood-sugar',
    title: 'Blood sugar',
    kind: 'number',
    indicators: ['blood_glucose'],
  },
  {
    id: 'exercise',
    title: 'Exercise',
    kind: 'number',
    indicators: ['exercise_minutes'],
  },
  // The in-app reaction test arrives in milestone M7.
  {
    id: 'reaction',
    title: 'Reaction test',
    kind: 'coming_soon',
    indicators: [],
  },
]

export interface CheckinRecords {
  crewId: string
  today: number
  readings: readonly Reading[]
  symptoms: readonly SymptomReport[]
  noSymptomDays: Readonly<Record<string, readonly number[]>>
}

/** Today's routine value for an indicator, if one was entered (the last one counts). */
export function todaysValue(
  records: CheckinRecords,
  indicator: IndicatorId,
): number | null {
  let value: number | null = null
  for (const reading of records.readings) {
    if (
      reading.crewId === records.crewId &&
      reading.indicator === indicator &&
      reading.day === records.today &&
      !isRecheck(reading)
    ) {
      value = reading.value
    }
  }
  return value
}

export function todaysSymptoms(
  records: CheckinRecords,
): SymptomReport['symptom'][] | null {
  const reported = records.symptoms
    .filter(
      (report) =>
        report.crewId === records.crewId && report.day === records.today,
    )
    .map((report) => report.symptom)
  if (reported.length > 0) return reported
  const answeredNone = (records.noSymptomDays[records.crewId] ?? []).includes(
    records.today,
  )
  return answeredNone ? [] : null
}

export function isStepDone(
  step: CheckinStep,
  records: CheckinRecords,
): boolean {
  if (step.kind === 'coming_soon') return false
  if (step.kind === 'symptoms') return todaysSymptoms(records) !== null
  return step.indicators.every(
    (indicator) => todaysValue(records, indicator) !== null,
  )
}

/** The steps that record readings. The streak is derived from readings only (section 19.1). */
const READING_STEPS = CHECKIN_STEPS.filter(
  (step) => step.kind === 'number' || step.kind === 'scale',
)

/**
 * Consecutive mission days with a completed check-in: every reading step has
 * a routine reading that day. Counted back from today if today's check-in is
 * complete, otherwise from yesterday, so an unfinished today never breaks
 * the streak. Derived, never stored, and it never scolds a missed day.
 */
export function checkinStreak(records: CheckinRecords): number {
  const logged = new Map<number, Set<IndicatorId>>()
  for (const reading of records.readings) {
    if (reading.crewId !== records.crewId || isRecheck(reading)) continue
    const day = logged.get(reading.day) ?? new Set<IndicatorId>()
    day.add(reading.indicator)
    logged.set(reading.day, day)
  }
  const complete = (day: number) =>
    READING_STEPS.every((step) =>
      step.indicators.every(
        (indicator) => logged.get(day)?.has(indicator) ?? false,
      ),
    )
  let day = complete(records.today) ? records.today : records.today - 1
  let count = 0
  while (day >= 1 && complete(day)) {
    count += 1
    day -= 1
  }
  return count
}

/** The streak lengths that earn a short message (section 19.1). */
const STREAK_MILESTONES = [14, 7, 3] as const

/** "7-day check-in streak" for the highest milestone reached, or null below the first. */
export function streakMilestone(days: number): string | null {
  const reached = STREAK_MILESTONES.find((milestone) => days >= milestone)
  return reached === undefined ? null : `${reached}-day check-in streak`
}

/** Steps the crew member can complete today (the coming-soon step does not count). */
export function checkinProgress(records: CheckinRecords) {
  const countable = CHECKIN_STEPS.filter((step) => step.kind !== 'coming_soon')
  const done = countable.filter((step) => isStepDone(step, records))
  const firstOpen = CHECKIN_STEPS.findIndex(
    (step) => step.kind !== 'coming_soon' && !isStepDone(step, records),
  )
  return {
    /** Titles of the steps still due today, in check-in order. Skipped steps stay here. */
    open: countable
      .filter((step) => !isStepDone(step, records))
      .map((step) => step.title),
    done: done.length,
    total: countable.length,
    firstOpenIndex: firstOpen,
  }
}
