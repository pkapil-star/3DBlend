import { baselineWindowRange, type DailyValue } from '../baseline.ts'
import type {
  Baseline,
  IndicatorId,
  Insight,
  InsightFactor,
  MissionDay,
  PatternReadiness,
  PersonalPatternModel,
} from '../types.ts'
import { cholesky, solveCholesky, type Matrix } from './linalg.ts'

// The personal pattern model in the app (ARCHITECTURE.md section 26.18): is
// today's combination of daily readings unusual for this crew member, given
// how their own readings usually move together? This file mirrors
// ml/personal_pattern.py step by step; the parity test proves the two give
// the same numbers. It only ever produces an insight: never a status, an
// alert, a route or a message (decision D19).

/**
 * Ledoit-Wolf shrinkage of the second-moment matrix about zero: a port of
 * scikit-learn's LedoitWolf with assume_centered=True (ledoit_wolf_shrinkage
 * and _ledoit_wolf, block size larger than any matrix here).
 */
export function ledoitWolfSecondMoment(rows: Matrix): {
  matrix: number[][]
  shrinkage: number
} {
  const n = rows.length
  const p = rows[0]?.length ?? 0
  const at = (k: number, j: number) => rows[k]?.[j] ?? Number.NaN

  if (p === 1) {
    // scikit-learn: with one feature the result is the same whatever the shrinkage.
    let sum = 0
    for (let k = 0; k < n; k++) sum += at(k, 0) ** 2
    return { matrix: [[sum / n]], shrinkage: 0 }
  }

  // empirical[i][j] = sum over days of x_i x_j, divided by n later.
  const cross: number[][] = []
  const squaresCross: number[][] = []
  for (let i = 0; i < p; i++) {
    const crossRow: number[] = []
    const squaresRow: number[] = []
    for (let j = 0; j < p; j++) {
      let plain = 0
      let squared = 0
      for (let k = 0; k < n; k++) {
        plain += at(k, i) * at(k, j)
        squared += at(k, i) ** 2 * at(k, j) ** 2
      }
      crossRow.push(plain)
      squaresRow.push(squared)
    }
    cross.push(crossRow)
    squaresCross.push(squaresRow)
  }

  const traceTerms = cross.map((row, i) => (row[i] ?? Number.NaN) / n)
  const traceSum = traceTerms.reduce((sum, value) => sum + value, 0)
  const mu = traceSum / p
  let betaSum = 0
  let deltaSum = 0
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      betaSum += squaresCross[i]?.[j] ?? Number.NaN
      deltaSum += (cross[i]?.[j] ?? Number.NaN) ** 2
    }
  }
  deltaSum /= n ** 2
  let beta = (1 / (p * n)) * (betaSum / n - deltaSum)
  const delta = (deltaSum - 2 * mu * traceSum + p * mu ** 2) / p
  beta = Math.min(beta, delta)
  const shrinkage = beta === 0 ? 0 : beta / delta

  const empiricalTrace = traceSum
  const target = empiricalTrace / p
  const matrix = cross.map((row, i) =>
    row.map(
      (value, j) =>
        (1 - shrinkage) * (value / n) + (i === j ? shrinkage * target : 0),
    ),
  )
  return { matrix, shrinkage }
}

/** zᵀ S⁻¹ z and the contributions z_i (S⁻¹ z)_i, or null when S cannot be factorized. */
export function squaredDistance(
  matrix: Matrix,
  z: readonly number[],
): { distance: number; contributions: number[] } | null {
  const lower = cholesky(matrix)
  if (!lower) return null
  const solved = solveCholesky(lower, z)
  const contributions = z.map((value, index) => value * (solved[index] ?? 0))
  const distance = contributions.reduce((sum, value) => sum + value, 0)
  return { distance, contributions }
}

/** Each baseline day's distance under a fit on the other baseline days. */
export function leaveOneOut(rows: Matrix): number[] | null {
  const distances: number[] = []
  for (let index = 0; index < rows.length; index++) {
    const others = rows.filter((_, other) => other !== index)
    const { matrix } = ledoitWolfSecondMoment(others)
    const result = squaredDistance(matrix, rows[index] ?? [])
    if (!result) return null
    distances.push(result.distance)
  }
  return distances
}

export interface PatternScore {
  shrinkage: number
  matrix: number[][]
  squaredDistance: number
  contributions: number[]
  looDistances: number[]
  maxLoo: number
  /** Today's distance ÷ the largest leave-one-out distance; null when that is not positive. */
  score: number | null
  /** More unusual than every baseline day. */
  notable: boolean
}

/**
 * Today's numbers from the baseline days' z-scores (one row per day) and
 * today's z-scores. Null when a matrix cannot be factorized, which only
 * happens with degenerate, constant readings.
 */
export function scoreToday(
  rows: Matrix,
  z: readonly number[],
): PatternScore | null {
  const { matrix, shrinkage } = ledoitWolfSecondMoment(rows)
  const today = squaredDistance(matrix, z)
  const looDistances = leaveOneOut(rows)
  if (!today || !looDistances) return null
  const maxLoo = Math.max(...looDistances)
  return {
    shrinkage,
    matrix,
    squaredDistance: today.distance,
    contributions: today.contributions,
    looDistances,
    maxLoo,
    score: maxLoo > 0 ? today.distance / maxLoo : null,
    notable: maxLoo > 0 && today.distance > maxLoo,
  }
}

/** The largest positive contributions, largest first; on a tie the model's indicator order wins. */
export function topFactors(
  indicators: readonly IndicatorId[],
  z: readonly number[],
  contributions: readonly number[],
  count = 3,
): InsightFactor[] {
  return indicators
    .map((indicator, index) => ({
      indicator,
      z: z[index] ?? Number.NaN,
      contribution: contributions[index] ?? Number.NaN,
      index,
    }))
    .sort((a, b) => b.contribution - a.contribution || a.index - b.index)
    .slice(0, count)
    .filter((factor) => factor.contribution > 0)
    .map(({ indicator, z: value, contribution }) => ({
      indicator,
      z: value,
      contribution,
    }))
}

export interface PatternInput {
  today: MissionDay
  /** One routine value per day and indicator (lastReadingPerDay): urgent re-checks never enter. */
  dailyValues: ReadonlyMap<IndicatorId, readonly DailyValue[]>
  /** The baseline engine's baselines for the same day (section 10). */
  baselines: Partial<Record<IndicatorId, Baseline>>
}

export interface PatternAssessment {
  readiness: PatternReadiness
  /** Today's indicators, in the model's order. */
  indicators: IndicatorId[]
  /** Today's z-scores, when the model could compute them. */
  z: number[] | null
  score: PatternScore | null
}

/**
 * Readiness and, when the model can score today, today's numbers. Before
 * today's check-in (fewer than minIndicatorsToday readings today) readiness
 * counts the window days with at least that many of the model's readings.
 */
export function assessPattern(
  model: PersonalPatternModel,
  input: PatternInput,
): PatternAssessment {
  const { fromDay, toDay } = baselineWindowRange(1, input.today)
  const byDay = new Map<IndicatorId, Map<MissionDay, number>>(
    model.indicators.map((indicator) => [
      indicator,
      new Map(
        (input.dailyValues.get(indicator) ?? []).map((entry) => [
          entry.day,
          entry.value,
        ]),
      ),
    ]),
  )
  const valueOn = (indicator: IndicatorId, day: MissionDay) =>
    byDay.get(indicator)?.get(day)
  const windowDays: MissionDay[] = []
  for (let day = Math.max(fromDay, 1); day <= toDay; day++) windowDays.push(day)

  const present = model.indicators.filter(
    (indicator) => valueOn(indicator, input.today) !== undefined,
  )
  const counts = {
    daysNeeded: model.minDays,
    indicatorsToday: present.length,
    indicatorsNeeded: model.minIndicatorsToday,
  }

  if (present.length < model.minIndicatorsToday) {
    const daysAvailable = windowDays.filter(
      (day) =>
        model.indicators.filter(
          (indicator) => valueOn(indicator, day) !== undefined,
        ).length >= model.minIndicatorsToday,
    ).length
    return {
      readiness: {
        ready: daysAvailable >= model.minDays,
        daysAvailable,
        ...counts,
      },
      indicators: present,
      z: null,
      score: null,
    }
  }

  const complete = windowDays.filter((day) =>
    present.every((indicator) => valueOn(indicator, day) !== undefined),
  )
  const readiness: PatternReadiness = {
    ready: complete.length >= model.minDays,
    daysAvailable: complete.length,
    ...counts,
  }
  const scales = present.map((indicator) => input.baselines[indicator])
  if (!readiness.ready || scales.some((baseline) => !baseline?.ready)) {
    return { readiness, indicators: present, z: null, score: null }
  }

  const zOf = (day: MissionDay) =>
    present.map((indicator, index) => {
      const baseline = scales[index]
      const value = valueOn(indicator, day)
      if (!baseline?.ready || value === undefined) return Number.NaN
      return (value - baseline.center) / baseline.spread
    })
  const z = zOf(input.today)
  return {
    readiness,
    indicators: present,
    z,
    score: scoreToday(complete.map(zOf), z),
  }
}

/** The insight for today, or null when today is not notable (an insight exists only then). */
export function personalPatternInsight(
  model: PersonalPatternModel,
  crewId: string,
  today: MissionDay,
  assessment: PatternAssessment,
): Insight | null {
  const { score, z } = assessment
  if (!score?.notable || !z) return null
  return {
    key: `${model.modelId}:${crewId}:${today}`,
    modelId: model.modelId,
    modelVersion: model.version,
    crewId,
    day: today,
    score: score.squaredDistance / score.maxLoo,
    factors: topFactors(assessment.indicators, z, score.contributions),
  }
}
