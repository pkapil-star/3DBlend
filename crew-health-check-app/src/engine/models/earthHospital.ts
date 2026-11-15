import type { DailyValue } from '../baseline.ts'
import type {
  Baseline,
  EarthHospitalModel,
  IndicatorId,
  Insight,
  MissionDay,
} from '../types.ts'
import {
  logisticContribution,
  logisticLogit,
  logisticOutput,
} from './logistic.ts'
import { topFactors } from './personalPattern.ts'

// The Earth hospital model in the app (ARCHITECTURE.md section 26.19): a
// logistic regression learned from Earth ICU patients, which sees only
// today's changes from the crew member's own normal (decision D20). It only
// ever produces an insight: never a status, an alert, a route or a message
// (decision D19). The parity test matches it to ml/train_earth_hospital.py.

export interface EarthHospitalInput {
  today: MissionDay
  /** One routine value per day and indicator (lastReadingPerDay): urgent re-checks never enter. */
  dailyValues: ReadonlyMap<IndicatorId, readonly DailyValue[]>
  /** The baseline engine's baselines for the same day (section 10). */
  baselines: Partial<Record<IndicatorId, Baseline>>
}

export interface EarthHospitalAssessment {
  /** Today's z-scores in the model's feature order; null when the model cannot run today. */
  z: number[] | null
  /** The model output between 0 and 1; shown only on the model card, never on the crew card. */
  output: number | null
  notable: boolean
  contributions: number[] | null
}

const NOT_SCORED: EarthHospitalAssessment = {
  z: null,
  output: null,
  notable: false,
  contributions: null,
}

/**
 * Scores today when each of the model's indicators has a routine reading
 * today and a ready baseline; otherwise the model does not run.
 */
export function assessEarthHospital(
  model: EarthHospitalModel,
  input: EarthHospitalInput,
): EarthHospitalAssessment {
  const z: number[] = []
  for (const feature of model.features) {
    const today = (input.dailyValues.get(feature.indicator) ?? []).find(
      (entry) => entry.day === input.today,
    )
    const baseline = input.baselines[feature.indicator]
    if (!today || !baseline?.ready) return NOT_SCORED
    z.push((today.value - baseline.center) / baseline.spread)
  }
  const contributions = model.features.map((feature, index) =>
    logisticContribution(feature, z[index] ?? 0),
  )
  const output = logisticOutput(
    logisticLogit(model.intercept, model.features, z),
  )
  return { z, output, notable: output >= model.threshold, contributions }
}

/** The insight for today, or null below the model's threshold (an insight exists only then). */
export function earthHospitalInsight(
  model: EarthHospitalModel,
  crewId: string,
  today: MissionDay,
  assessment: EarthHospitalAssessment,
): Insight | null {
  const { z, output, contributions } = assessment
  if (!assessment.notable || !z || output === null || !contributions) {
    return null
  }
  return {
    key: `${model.modelId}:${crewId}:${today}`,
    modelId: model.modelId,
    modelVersion: model.version,
    crewId,
    day: today,
    score: output,
    factors: topFactors(
      model.features.map((feature) => feature.indicator),
      z,
      contributions,
    ),
  }
}
