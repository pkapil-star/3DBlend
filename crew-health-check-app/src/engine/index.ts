import {
  computeBaseline,
  lastReadingPerDay,
  latestReading,
  type DailyValue,
  type LatestValue,
} from './baseline.ts'
import type { ConditionContext } from './conditions.ts'
import {
  assessEarthHospital,
  earthHospitalInsight,
} from './models/earthHospital.ts'
import {
  assessPattern,
  personalPatternInsight,
} from './models/personalPattern.ts'
import { evaluateRules } from './rules.ts'
import {
  missingContextFeeds,
  overallStatus,
  overdueIndicators,
  regionGaps,
  regionStatuses,
} from './status.ts'
import { missionDayOf } from './time.ts'
import type {
  Baseline,
  Evaluation,
  EvaluationInput,
  IndicatorDef,
  IndicatorId,
} from './types.ts'

export * from './types.ts'
export { replyEtaMinutes, triage } from './triage.ts'
export { MS_PER_DAY, formatTimeOfDay, missionDayOf } from './time.ts'
export {
  flareFeatures,
  highestSepRisk,
  sepRiskProbability,
  sepRiskScore,
  topFactors,
  type FlareInput,
  type SepRiskFactor,
} from './models/sepRisk.ts'
export {
  assessEarthHospital,
  earthHospitalInsight,
  type EarthHospitalAssessment,
} from './models/earthHospital.ts'
export {
  assessPattern,
  ledoitWolfSecondMoment,
  personalPatternInsight,
  scoreToday,
  topFactors as patternFactors,
  type PatternAssessment,
  type PatternScore,
} from './models/personalPattern.ts'
export {
  BASELINE_WINDOWS,
  computeBaseline,
  isRecheck,
  lastReadingPerDay,
  latestReading,
  type DailyValue,
} from './baseline.ts'
export { CONTEXT_FEED_REGION, DAILY_CONTEXT_FEEDS } from './status.ts'
export { recheckName } from './format.ts'
export { findDataProblems, type HealthData } from './validateData.ts'

/**
 * The engine's public entry point (section 11.4): baselines, rules, triage and
 * status for one crew member at mission time `nowMs`. Pure: the same input
 * always gives the same evaluation.
 */
export function evaluate(input: EvaluationInput): Evaluation {
  const today = missionDayOf(input.nowMs)
  const readings = input.readings.filter(
    (reading) => reading.crewId === input.crewId && reading.atMs <= input.nowMs,
  )
  const symptoms = input.symptoms.filter(
    (report) => report.crewId === input.crewId && report.atMs <= input.nowMs,
  )
  const context = input.context.filter((sample) => sample.day <= today)

  const indicators = new Map<IndicatorId, IndicatorDef>()
  const dailyValues = new Map<IndicatorId, DailyValue[]>()
  const latest = new Map<IndicatorId, LatestValue>()
  const baselines: Partial<Record<IndicatorId, Baseline>> = {}
  for (const def of input.indicators) {
    const values = lastReadingPerDay(readings, def.id)
    indicators.set(def.id, def)
    dailyValues.set(def.id, values)
    const newest = latestReading(readings, def.id)
    if (newest) latest.set(def.id, newest)
    baselines[def.id] = computeBaseline(values, def, today)
  }

  const ctx: ConditionContext = {
    today,
    indicators,
    dailyValues,
    latest,
    baselines,
    symptoms,
    context,
    modelThresholds: { 'sep-risk': input.models.sepRisk?.threshold ?? null },
    nowMs: input.nowMs,
    spaceWeather: input.spaceWeather,
    sepRiskModel: input.models.sepRisk,
  }

  const alerts = evaluateRules(input.rules, ctx, input.link, input.crewId)
  const overdue = overdueIndicators(input.indicators, dailyValues, today)
  const missingFeeds = missingContextFeeds(context, today)
  const gaps = regionGaps(input.indicators, overdue, missingFeeds)
  const regionStatus = regionStatuses(alerts, input.indicators, gaps)

  // Second opinions run last and read only what the rules read; nothing above
  // depends on them (decision D19, the second-opinion invariance test).
  const patternModel = input.models.personalPattern
  const pattern = patternModel
    ? assessPattern(patternModel, { today, dailyValues, baselines })
    : null
  const insight =
    patternModel && pattern
      ? personalPatternInsight(patternModel, input.crewId, today, pattern)
      : null
  const hospitalModel = input.models.earthHospital
  const hospital = hospitalModel
    ? earthHospitalInsight(
        hospitalModel,
        input.crewId,
        today,
        assessEarthHospital(hospitalModel, { today, dailyValues, baselines }),
      )
    : null

  return {
    baselines,
    alerts,
    regionStatus,
    overall: overallStatus(regionStatus),
    overdue,
    missingFeeds,
    regionGaps: gaps,
    insights: [insight, hospital].filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    ),
    patternReadiness: pattern?.readiness ?? null,
  }
}
