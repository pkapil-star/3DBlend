import { earthHospitalModel, personalPatternModel } from '../data/index.ts'
import type {
  Baseline,
  Evaluation,
  Insight,
  InsightFactor,
  PatternReadiness,
  RegionId,
} from '../engine/index.ts'
import { formatNormal, formatValue, indicatorDef } from './labels.ts'

// Words for second-opinion insights (ARCHITECTURE.md section 26.17). The
// headline, note and caveat come from the model file. Nothing here states a
// percentage, a chance or a diagnosis: an insight is "unusual for you".

/** The hash route of the personal pattern model card. */
export const PERSONAL_PATTERN_CARD_PATH = '/model/personal-pattern'

/** The hash route of the Earth hospital model card. */
export const EARTH_HOSPITAL_CARD_PATH = '/model/earth-hospital'

/**
 * The model file wording behind an insight. None of it names a disease or
 * gives a number: the model card explains the label and the score.
 */
export function insightText(insight: Insight): {
  headline: string
  note: string
  caveat: string
  cardPath: string
  /** An extra tag that says where the model learned, or null. */
  originTag: string | null
} {
  if (insight.modelId === 'earth-hospital') {
    return {
      headline: earthHospitalModel.headline,
      note: earthHospitalModel.notableText,
      caveat: earthHospitalModel.caveat,
      cardPath: EARTH_HOSPITAL_CARD_PATH,
      originTag: 'Earth ICU data',
    }
  }
  return {
    headline: personalPatternModel.headline,
    note: personalPatternModel.notableText,
    caveat: personalPatternModel.caveat,
    cardPath: PERSONAL_PATTERN_CARD_PATH,
    originTag: null,
  }
}

function direction(factor: InsightFactor): string {
  return factor.z > 0 ? 'higher' : 'lower'
}

/** For the crew: "Sleep last night: lower than your normal" */
export function factorWords(factor: InsightFactor): string {
  return `${indicatorDef(factor.indicator).label}: ${direction(factor)} than your normal`
}

/** "5.25 h today, your normal 6.5 h", or null without today's value or a ready baseline. */
export function factorDetail(
  factor: InsightFactor,
  todayValue: number | null,
  baseline: Baseline | undefined,
): string | null {
  if (todayValue === null || !baseline?.ready) return null
  const def = indicatorDef(factor.indicator)
  return `${formatValue(todayValue, def)} today, your normal ${formatNormal(baseline.center, def)}`
}

/** For the ground: "Sleep last night: lower than usual for this crew member (5.25 h today, usual 6.5 h)" */
export function factorLineForGround(
  factor: InsightFactor,
  todayValue: number | null,
  baseline: Baseline | undefined,
): string {
  const def = indicatorDef(factor.indicator)
  const words = `${def.label}: ${direction(factor)} than usual for this crew member`
  if (todayValue === null || !baseline?.ready) return words
  return `${words} (${formatValue(todayValue, def)} today, usual ${formatNormal(baseline.center, def)})`
}

/** Today's insights with the factors that belong to one region (section 26.17). */
export function insightsForRegion(
  evaluation: Evaluation,
  regionId: RegionId,
): { insight: Insight; factors: InsightFactor[] }[] {
  return evaluation.insights.flatMap((insight) => {
    const factors = insight.factors.filter(
      (factor) => indicatorDef(factor.indicator).region === regionId,
    )
    return factors.length === 0 ? [] : [{ insight, factors }]
  })
}

/** The body regions an insight's factors belong to, for the region view. */
export function insightRegions(insight: Insight): RegionId[] {
  return [
    ...new Set(
      insight.factors.map((factor) => indicatorDef(factor.indicator).region),
    ),
  ]
}

/** The Home card's line when there is no insight to show. */
export function readinessWords(readiness: PatternReadiness): {
  line: string
  detail: string
} {
  if (!readiness.ready) {
    return {
      line: `Learning your pattern (${readiness.daysAvailable} of ${readiness.daysNeeded} days)`,
      detail: `The personal pattern model needs ${readiness.daysNeeded} days with your daily readings before it can give a second opinion.`,
    }
  }
  if (readiness.indicatorsToday < readiness.indicatorsNeeded) {
    return {
      line: "Second opinions run after today's check-in",
      detail: `They need at least ${readiness.indicatorsNeeded} of today's readings (${readiness.indicatorsToday} so far).`,
    }
  }
  return {
    line: 'No unusual patterns today',
    detail:
      "Taken together, today's readings are not more unusual than your recent baseline days.",
  }
}
