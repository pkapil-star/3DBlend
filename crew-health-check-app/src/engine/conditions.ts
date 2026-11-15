import type { DailyValue, LatestValue } from './baseline.ts'
import {
  compareTo,
  describeCheck,
  targetFor,
  type ModelThresholds,
} from './comparison.ts'
import {
  formatDerived,
  formatReading,
  recheckName,
  withUnit,
} from './format.ts'
import { highestSepRisk, sepRiskScore, topFactors } from './models/sepRisk.ts'
import { mean } from './stats.ts'
import { formatTimeOfDay, missionDayOf } from './time.ts'
import type {
  Baseline,
  Comparison,
  Condition,
  ContextFeedId,
  ContextSample,
  EvidenceItem,
  FlareObservation,
  IndicatorDef,
  IndicatorId,
  MissionDay,
  MissionMs,
  SepRiskModel,
  SymptomReport,
} from './types.ts'

/** Everything a condition may look at, already filtered to one crew member and to `nowMs`. */
export interface ConditionContext {
  today: MissionDay
  indicators: ReadonlyMap<IndicatorId, IndicatorDef>
  /** Routine readings, one per day; urgent re-checks are not in here. */
  dailyValues: ReadonlyMap<IndicatorId, readonly DailyValue[]>
  /** The newest reading of each indicator, urgent re-checks included. */
  latest: ReadonlyMap<IndicatorId, LatestValue>
  baselines: Partial<Record<IndicatorId, Baseline>>
  symptoms: readonly SymptomReport[]
  context: readonly ContextSample[]
  modelThresholds: ModelThresholds
  /** The sep_risk feed works on mission time, not on mission days (section 26.10). */
  nowMs: MissionMs
  /** Real DONKI flares placed in the scenario. */
  spaceWeather: readonly FlareObservation[]
  /** null means the model is not loaded: the sep_risk feed has no value. */
  sepRiskModel: SepRiskModel | null
}

export interface ConditionResult {
  met: boolean
  /** What changed, for the alert screen; empty when the condition is not met. */
  evidence: EvidenceItem[]
}

const NOT_MET: ConditionResult = { met: false, evidence: [] }

type ConditionOf<T extends Condition['type']> = Extract<Condition, { type: T }>

/** Days today-windowDays+1 to today: "the last N days", today included. */
function inWindow(
  day: MissionDay,
  today: MissionDay,
  windowDays: number,
): boolean {
  return day > today - windowDays && day <= today
}

function dayWord(count: number): string {
  return count === 1 ? 'day' : 'days'
}

function reference(
  def: IndicatorDef,
  baseline: Baseline | null,
  test: Comparison,
  target: number,
): string {
  if (baseline?.ready) {
    return `Your normal: ${formatDerived(baseline.center, def)}`
  }
  return `Check: ${describeCheck(test.op, formatReading(target, def))}`
}

interface IndicatorInputs {
  def: IndicatorDef
  values: readonly DailyValue[]
  baseline: Baseline | null
  target: number
}

/** Shared set-up for indicator conditions; null means the condition cannot be met. */
function indicatorInputs(
  indicator: IndicatorId,
  test: Comparison,
  ctx: ConditionContext,
): IndicatorInputs | null {
  const def = ctx.indicators.get(indicator)
  if (!def) return null
  const baseline = ctx.baselines[indicator] ?? null
  const target = targetFor(test, baseline, ctx.modelThresholds)
  if (target === null) return null
  return { def, values: ctx.dailyValues.get(indicator) ?? [], baseline, target }
}

function evaluateLatest(
  condition: ConditionOf<'latest'>,
  ctx: ConditionContext,
): ConditionResult {
  const inputs = indicatorInputs(condition.indicator, condition.test, ctx)
  if (!inputs) return NOT_MET
  const latest = ctx.latest.get(condition.indicator)
  if (!latest) return NOT_MET
  if (
    condition.maxAgeDays !== undefined &&
    ctx.today - latest.day > condition.maxAgeDays
  ) {
    return NOT_MET
  }
  if (!compareTo(latest.value, condition.test.op, inputs.target)) return NOT_MET
  return {
    met: true,
    evidence: [
      {
        label: `${latest.recheck ? recheckName(inputs.def) : inputs.def.label}, latest`,
        value: `${formatReading(latest.value, inputs.def)} on day ${latest.day}`,
        reference: reference(
          inputs.def,
          inputs.baseline,
          condition.test,
          inputs.target,
        ),
      },
    ],
  }
}

function evaluateStreak(
  condition: ConditionOf<'streak'>,
  ctx: ConditionContext,
): ConditionResult {
  const inputs = indicatorInputs(condition.indicator, condition.test, ctx)
  if (!inputs) return NOT_MET
  const recent = inputs.values.filter((entry) =>
    inWindow(entry.day, ctx.today, condition.windowDays),
  )
  const passing = recent.filter((entry) =>
    compareTo(entry.value, condition.test.op, inputs.target),
  ).length
  if (passing < condition.minCount) return NOT_MET
  const check = describeCheck(
    condition.test.op,
    formatDerived(inputs.target, inputs.def),
  )
  return {
    met: true,
    evidence: [
      {
        label: `${inputs.def.label}, last ${condition.windowDays} days`,
        value: `${passing} of ${recent.length} readings ${check}`,
        reference: reference(
          inputs.def,
          inputs.baseline,
          condition.test,
          inputs.target,
        ),
      },
    ],
  }
}

function evaluateAverage(
  condition: ConditionOf<'average'>,
  ctx: ConditionContext,
): ConditionResult {
  const inputs = indicatorInputs(condition.indicator, condition.test, ctx)
  if (!inputs) return NOT_MET
  const recent = inputs.values.filter((entry) =>
    inWindow(entry.day, ctx.today, condition.windowDays),
  )
  if (recent.length < condition.minReadings) return NOT_MET
  const average = mean(recent.map((entry) => entry.value))
  if (!compareTo(average, condition.test.op, inputs.target)) return NOT_MET
  return {
    met: true,
    evidence: [
      {
        label: `${inputs.def.label}, ${condition.windowDays}-day average`,
        value: `${formatDerived(average, inputs.def)} (${recent.length} readings)`,
        reference: reference(
          inputs.def,
          inputs.baseline,
          condition.test,
          inputs.target,
        ),
      },
    ],
  }
}

function evaluateSymptom(
  condition: ConditionOf<'symptom'>,
  ctx: ConditionContext,
): ConditionResult {
  const reports = ctx.symptoms.filter(
    (report) =>
      report.symptom === condition.symptom &&
      inWindow(report.day, ctx.today, condition.withinDays),
  )
  if (reports.length === 0) return NOT_MET
  const latestDay = Math.max(...reports.map((report) => report.day))
  const name = condition.symptom.replaceAll('_', ' ')
  return {
    met: true,
    evidence: [
      {
        label: `Symptom reported: ${name}`,
        value: `Day ${latestDay}`,
        reference: `Within the last ${condition.withinDays} ${dayWord(condition.withinDays)}`,
      },
    ],
  }
}

// Labels and units for the habitat feeds, used only to word evidence items.
const FEED_DISPLAY: Record<ContextFeedId, { label: string; unit: string }> = {
  cabin_co2: { label: 'Cabin CO2', unit: 'mmHg' },
  radiation_cumulative: { label: 'Radiation dose, mission total', unit: 'mSv' },
  solar_event: { label: 'Solar particle event', unit: '' },
  sep_risk: { label: 'Experimental model score', unit: '' },
}

/** How many factors an alert shows with a model score (section 26.10). */
const FACTOR_COUNT = 3

/** The feed's value over the window, or null when there is none (section 11.2). */
function feedValue(
  feed: ContextFeedId,
  windowDays: number,
  ctx: ConditionContext,
): number | null {
  const recent = ctx.context.filter((sample) =>
    inWindow(sample.day, ctx.today, windowDays),
  )
  switch (feed) {
    case 'cabin_co2':
      return recent.length > 0
        ? mean(recent.map((sample) => sample.cabin_co2))
        : null
    case 'radiation_cumulative': {
      const toDate = ctx.context.filter((sample) => sample.day <= ctx.today)
      return toDate.length > 0
        ? toDate.reduce((sum, sample) => sum + sample.radiation_dose, 0)
        : null
    }
    case 'solar_event':
      if (recent.length === 0) return null
      return recent.some((sample) => sample.solar_event) ? 1 : 0
    case 'sep_risk':
      // A model feed on mission time: evaluateSepRisk handles it.
      return null
  }
}

function contextEvidence(
  condition: ConditionOf<'context'>,
  value: number,
  target: number,
): EvidenceItem {
  const display = FEED_DISPLAY[condition.feed]
  if (condition.feed === 'solar_event') {
    return {
      label: display.label,
      value: 'In progress',
      reference:
        condition.windowDays === 1
          ? 'Today'
          : `Within the last ${condition.windowDays} days`,
    }
  }
  // The CO2 feed is each day's worst 1-hour average (section 8.2); the label
  // says so, because NASA's 3 mmHg limit applies to a 1-hour average.
  const label =
    condition.feed === 'cabin_co2'
      ? condition.windowDays === 1
        ? `${display.label}, today's worst 1-hour average`
        : `${display.label}, mean of the daily worst 1-hour averages over ${condition.windowDays} days`
      : display.label
  return {
    label,
    value: withUnit(value.toFixed(1), display.unit),
    reference: `Check: ${describeCheck(condition.test.op, withUnit(target.toFixed(1), display.unit))}`,
  }
}

/**
 * The model feed (section 26.10): the highest model output among the flares
 * of the last `windowDays × 24` hours, compared with the model file's own
 * threshold at full precision. The crew sees it as an experimental score from
 * 0 to 100 with the model version, never as a probability. No model, or no
 * flare in the window, means no value and the condition is not met.
 */
function evaluateSepRisk(
  condition: ConditionOf<'context'>,
  ctx: ConditionContext,
): ConditionResult {
  const model = ctx.sepRiskModel
  const target = targetFor(condition.test, null, ctx.modelThresholds)
  if (!model || target === null) return NOT_MET
  const top = highestSepRisk(
    model,
    ctx.spaceWeather,
    ctx.nowMs,
    condition.windowDays,
  )
  if (!top) return NOT_MET
  if (!compareTo(top.output, condition.test.op, target)) return NOT_MET
  const { flare } = top
  return {
    met: true,
    evidence: [
      {
        label: FEED_DISPLAY.sep_risk.label,
        value: `${sepRiskScore(top.output)} out of 100`,
        reference:
          `Flare ${flare.classType} at ${flare.sourceLocation}, peak on day ` +
          `${missionDayOf(flare.peakMs)} at ${formatTimeOfDay(flare.peakMs)}. ` +
          `Alert level: ${describeCheck(condition.test.op, String(sepRiskScore(target)))} out of 100. ` +
          `Model estimate from ${model.modelId} ${model.version}.`,
        model: {
          modelId: model.modelId,
          version: model.version,
          output: top.output,
          threshold: target,
          factors: topFactors(model, flare, FACTOR_COUNT).map(
            (factor) => factor.text,
          ),
          flare: { donkiId: flare.donkiId, link: flare.link },
        },
      },
    ],
  }
}

function evaluateContext(
  condition: ConditionOf<'context'>,
  ctx: ConditionContext,
): ConditionResult {
  if (condition.feed === 'sep_risk') return evaluateSepRisk(condition, ctx)
  // Context feeds have no personal baseline, so baseline comparisons never pass.
  const target = targetFor(condition.test, null, ctx.modelThresholds)
  if (target === null) return NOT_MET
  const value = feedValue(condition.feed, condition.windowDays, ctx)
  if (value === null) return NOT_MET
  if (!compareTo(value, condition.test.op, target)) return NOT_MET
  return { met: true, evidence: [contextEvidence(condition, value, target)] }
}

export function evaluateCondition(
  condition: Condition,
  ctx: ConditionContext,
): ConditionResult {
  switch (condition.type) {
    case 'latest':
      return evaluateLatest(condition, ctx)
    case 'streak':
      return evaluateStreak(condition, ctx)
    case 'average':
      return evaluateAverage(condition, ctx)
    case 'symptom':
      return evaluateSymptom(condition, ctx)
    case 'context':
      return evaluateContext(condition, ctx)
    case 'all': {
      const results = condition.of.map((child) => evaluateCondition(child, ctx))
      return results.every((result) => result.met)
        ? { met: true, evidence: results.flatMap((result) => result.evidence) }
        : NOT_MET
    }
    case 'any': {
      const met = condition.of
        .map((child) => evaluateCondition(child, ctx))
        .filter((result) => result.met)
      return met.length > 0
        ? { met: true, evidence: met.flatMap((result) => result.evidence) }
        : NOT_MET
    }
  }
}
