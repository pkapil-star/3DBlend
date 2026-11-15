import { SEP_RISK_DURATION_FEATURE } from '../schemas.ts'
import {
  logisticContribution,
  logisticLogit,
  logisticOutput,
} from './logistic.ts'
import type {
  FlareObservation,
  MissionMs,
  SepRiskFeature,
  SepRiskModel,
} from '../types.ts'

// The sep-risk model in the app (ARCHITECTURE.md sections 26.5 and 26.10).
// This file mirrors ml/features.py and the arithmetic of ml/train_sep_risk.py
// step by step; the parity test proves the two give the same numbers.
// Pure functions: the model's numbers arrive as an argument.

/** What the model needs to know about one flare. */
export type FlareInput = Pick<
  FlareObservation,
  'classType' | 'sourceLocation' | 'riseMin' | 'durationMin' | 'cme'
>

// Peak X-ray flux in W/m2 of class 1.0 of each GOES letter.
const CLASS_BASE: Record<string, number> = {
  A: 1e-8,
  B: 1e-7,
  C: 1e-6,
  M: 1e-5,
  X: 1e-4,
}

const CLASS_PATTERN = /^([ABCMX])(\d+(?:\.\d+)?)$/
const LOCATION_PATTERN = /^([NS])(\d{1,2})([EW])(\d{1,3})$/

/** "X2.2" gives log10(2.2e-4); null for anything that is not a letter A, B, C, M or X and a positive number. */
export function log10PeakFlux(classType: string): number | null {
  const match = CLASS_PATTERN.exec(classType.trim())
  const base = match?.[1] === undefined ? undefined : CLASS_BASE[match[1]]
  const number = Number(match?.[2])
  if (base === undefined || !(number > 0)) return null
  return Math.log10(base * number)
}

/** "S17W33" gives 33: degrees of longitude, west positive. Null when it cannot be read. */
export function longitudeWestDeg(sourceLocation: string): number | null {
  const match = LOCATION_PATTERN.exec(sourceLocation.trim())
  if (!match) return null
  const latitude = Number(match[2])
  const longitude = Number(match[4])
  if (latitude > 90 || longitude > 180) return null
  return match[3] === 'W' ? longitude : -longitude
}

/** The value of every feature by name, or null when the flare cannot be scored. */
function featureValues(
  obs: FlareInput,
  durationImpute: number | null,
): Record<string, number> | null {
  const flux = log10PeakFlux(obs.classType)
  const longitudeDeg = longitudeWestDeg(obs.sourceLocation)
  if (flux === null || longitudeDeg === null) return null
  if (!(obs.riseMin >= 0)) return null
  let logDuration: number
  if (obs.durationMin === null) {
    if (durationImpute === null) return null
    logDuration = durationImpute
  } else if (obs.durationMin >= 0) {
    logDuration = Math.log1p(obs.durationMin)
  } else {
    return null
  }
  const longitude = (longitudeDeg * Math.PI) / 180
  return {
    log10_peak_flux: flux,
    lon_sin: Math.sin(longitude),
    lon_cos: Math.cos(longitude),
    log1p_rise_min: Math.log1p(obs.riseMin),
    log1p_duration_min: logDuration,
    has_cme: obs.cme ? 1 : 0,
    log1p_cme_speed: obs.cme ? Math.log1p(obs.cme.speedKms) : 0,
    cme_half_angle_deg: obs.cme ? obs.cme.halfAngleDeg : 0,
  }
}

/**
 * The feature values of one flare, in the order of the model file. A flare
 * without an end time takes the model file's `impute` value for the duration
 * feature. Null when the flare cannot be scored (unreadable class or
 * location, a negative time), so a bad record never becomes a score.
 */
export function flareFeatures(
  model: SepRiskModel,
  obs: FlareInput,
): number[] | null {
  const impute =
    model.features.find((feature) => feature.name === SEP_RISK_DURATION_FEATURE)
      ?.impute ?? null
  const values = featureValues(obs, impute)
  if (!values) return null
  const ordered: number[] = []
  for (const feature of model.features) {
    const value = values[feature.name]
    if (value === undefined) return null
    ordered.push(value)
  }
  return ordered
}

/** One feature's share of the logit: coef × (value − mean) ÷ scale, as in Python. */
function contribution(feature: SepRiskFeature, value: number): number {
  return logisticContribution(feature, value)
}

function logitOf(model: SepRiskModel, values: readonly number[]): number {
  return logisticLogit(model.intercept, model.features, values)
}

/**
 * The model's output for one flare, between 0 and 1, or null when the flare
 * cannot be scored. The app shows it as an experimental score, not as a
 * probability (section 26.10).
 */
export function sepRiskProbability(
  model: SepRiskModel,
  obs: FlareInput,
): number | null {
  const values = flareFeatures(model, obs)
  if (!values) return null
  return logisticOutput(logitOf(model, values))
}

/**
 * The model output on the 0 to 100 score scale the app displays: a whole
 * number, kept between 1 and 99 so that it never reads as a certainty.
 * Display only; comparisons always use the unrounded output.
 */
export function sepRiskScore(output: number): number {
  return Math.min(99, Math.max(1, Math.round(output * 100)))
}

export interface SepRiskFactor {
  /** The display group of the model file, such as "Flare class". */
  group: string
  /** The group's summed share of the logit; the intercept plus all groups is the logit. */
  contribution: number
  /** "Flare class X2.2 raises the score" */
  text: string
}

function wholeOrOneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function groupSubject(group: string, obs: FlareInput): string {
  switch (group) {
    case 'Flare class':
      return `Flare class ${obs.classType}`
    case 'Source location':
      return `Source location ${obs.sourceLocation}`
    case 'Rise time':
      return `Rise time of ${wholeOrOneDecimal(obs.riseMin)} min`
    case 'Duration':
      return obs.durationMin === null
        ? 'No recorded end time (a typical duration is used)'
        : `Duration of ${wholeOrOneDecimal(obs.durationMin)} min`
    case 'CME':
      return obs.cme
        ? `Linked CME at ${wholeOrOneDecimal(obs.cme.speedKms)} km/s, half-angle ${wholeOrOneDecimal(obs.cme.halfAngleDeg)}°`
        : 'No linked CME'
    default:
      return group
  }
}

function direction(amount: number): string {
  if (amount > 0) return 'raises the score'
  if (amount < 0) return 'lowers the score'
  return 'does not move the score'
}

/**
 * The `n` display groups that move the score most, largest first. "Raises"
 * and "lowers" are relative to an average flare of the training years,
 * because every feature is measured from its training mean.
 */
export function topFactors(
  model: SepRiskModel,
  obs: FlareInput,
  n: number,
): SepRiskFactor[] {
  const values = flareFeatures(model, obs)
  if (!values) return []
  const byGroup = new Map<string, number>()
  model.features.forEach((feature, index) => {
    const amount = contribution(feature, values[index] ?? 0)
    byGroup.set(feature.group, (byGroup.get(feature.group) ?? 0) + amount)
  })
  return [...byGroup]
    .map(([group, amount]) => ({
      group,
      contribution: amount,
      text: `${groupSubject(group, obs)} ${direction(amount)}`,
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, n)
}

const HOUR_MS = 3_600_000

/**
 * The `sep_risk` context feed (section 26.10): the flare with the highest
 * model output among those whose peak lies in the last `windowDays × 24`
 * hours up to `nowMs`. A flare after `nowMs` has not happened yet. Null when
 * no flare in the window can be scored.
 */
export function highestSepRisk(
  model: SepRiskModel,
  flares: readonly FlareObservation[],
  nowMs: MissionMs,
  windowDays: number,
): { flare: FlareObservation; output: number } | null {
  const windowStartMs = nowMs - windowDays * 24 * HOUR_MS
  let best: { flare: FlareObservation; output: number } | null = null
  for (const flare of flares) {
    if (flare.peakMs > nowMs || flare.peakMs <= windowStartMs) continue
    const output = sepRiskProbability(model, flare)
    if (output === null) continue
    if (best === null || output > best.output) best = { flare, output }
  }
  return best
}
