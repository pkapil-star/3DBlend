import type { z } from 'zod'
import type * as schemas from './schemas.ts'

// Domain types (ARCHITECTURE.md section 7). Data shapes come from the Zod
// schemas; the engine's own outputs are declared here.

export type { Comparison, Condition } from './schemas.ts'

export type IndicatorId = z.infer<typeof schemas.indicatorIdSchema>
export type SymptomId = z.infer<typeof schemas.symptomIdSchema>
export type ContextFeedId = z.infer<typeof schemas.contextFeedIdSchema>
export type RegionId = z.infer<typeof schemas.regionIdSchema>
export type EnvironmentId = z.infer<typeof schemas.environmentIdSchema>
export type Severity = z.infer<typeof schemas.severitySchema>
export type ThresholdBasis = z.infer<typeof schemas.thresholdBasisSchema>
export type Op = z.infer<typeof schemas.opSchema>

export type IndicatorDef = z.infer<typeof schemas.indicatorDefSchema>
export type RegionDef = z.infer<typeof schemas.regionDefSchema>
export type Source = z.infer<typeof schemas.sourceSchema>
export type Environment = z.infer<typeof schemas.environmentSchema>
export type Rule = z.infer<typeof schemas.ruleSchema>
export type Protocol = z.infer<typeof schemas.protocolSchema>

export type CrewMember = z.infer<typeof schemas.crewMemberSchema>
export type Reading = z.infer<typeof schemas.readingSchema>
export type SymptomReport = z.infer<typeof schemas.symptomReportSchema>
export type ContextSample = z.infer<typeof schemas.contextSampleSchema>
export type LinkState = z.infer<typeof schemas.linkStateSchema>
export type FlareObservation = z.infer<typeof schemas.flareObservationSchema>
export type SepRiskFeature = z.infer<typeof schemas.sepRiskFeatureSchema>
export type SepRiskModel = z.infer<typeof schemas.sepRiskModelSchema>
/** The whole model file, for the model card screen. Inference needs only SepRiskModel. */
export type SepRiskModelFile = z.infer<typeof schemas.sepRiskModelFileSchema>
export type PersonalPatternModel = z.infer<
  typeof schemas.personalPatternModelSchema
>
export type PersonalPatternModelFile = z.infer<
  typeof schemas.personalPatternModelFileSchema
>
export type EarthHospitalModel = z.infer<
  typeof schemas.earthHospitalModelSchema
>
export type EarthHospitalModelFile = z.infer<
  typeof schemas.earthHospitalModelFileSchema
>
export type ScenarioFile = z.infer<typeof schemas.scenarioFileSchema>
export type ScenarioIndex = z.infer<typeof schemas.scenarioIndexSchema>
export type GroundMessage = z.infer<typeof schemas.groundMessageSchema>

export type Status = 'good' | 'watch' | 'act' | 'no_data'
export type Route = 'self_care' | 'consult_ground' | 'act_on_board'

/** Mission time is counted in milliseconds since mission start. */
export type MissionMs = number
/** Mission day 1 is the first day: floor(ms / 86_400_000) + 1. */
export type MissionDay = number

/** Section 10. `needed` lets the UI say "Learning your normal (n of 7)". */
export type Baseline =
  | { ready: false; n: number; needed: number }
  | {
      ready: true
      n: number
      center: number
      spread: number
      fromDay: MissionDay
      toDay: MissionDay
    }

/**
 * Set on an evidence item whose value is a model output (section 26.10). The
 * screens use it to add the "Model estimate" tag, the factors, the limits of
 * the score and the link to the model card.
 */
export interface ModelEvidence {
  modelId: 'sep-risk'
  version: string
  /** The model's own output and threshold, 0 to 1, unrounded. */
  output: number
  threshold: number
  /** The largest contributions to the score, in words. */
  factors: string[]
  /** The real DONKI flare the score is for. */
  flare: { donkiId: string; link: string }
}

export interface EvidenceItem {
  label: string
  value: string
  reference: string
  model?: ModelEvidence
}

export interface Alert {
  key: string
  ruleId: string
  crewId: string
  severity: Severity
  region: RegionId
  firstSeenDay: MissionDay
  evidence: EvidenceItem[]
  route: Route
  replyEtaMin: number | null
  supersededBy: string | null
}

// Second opinions (section 26.17). An insight is derived and never stored. It
// never sets a status, creates or hides an alert, changes a route or queues
// a message by itself (decision D19).

export type InsightModelId = 'personal-pattern' | 'earth-hospital'

export interface InsightFactor {
  indicator: IndicatorId
  /** Today's z-score against the person's baseline (section 10). */
  z: number
  /** This indicator's share of the model's score. */
  contribution: number
}

export interface Insight {
  /** `${modelId}:${crewId}:${day}`: one insight per model, crew member and day. */
  key: string
  modelId: InsightModelId
  modelVersion: string
  crewId: string
  day: MissionDay
  /** personal-pattern: today's distance ÷ the largest baseline-day distance (above 1). */
  score: number
  /** At most three, largest first. */
  factors: InsightFactor[]
}

export interface PatternReadiness {
  ready: boolean
  /** Complete baseline days for today's indicators (before today's check-in: days with enough readings). */
  daysAvailable: number
  /** minDays from the model file. */
  daysNeeded: number
  /** The model's readings logged today. */
  indicatorsToday: number
  /** minIndicatorsToday from the model file. */
  indicatorsNeeded: number
}

export interface EvaluationInput {
  nowMs: MissionMs
  crewId: string
  readings: readonly Reading[]
  symptoms: readonly SymptomReport[]
  context: readonly ContextSample[]
  link: LinkState
  indicators: readonly IndicatorDef[]
  rules: readonly Rule[]
  /** Real DONKI flares placed in the scenario; read by the sep_risk feed. */
  spaceWeather: readonly FlareObservation[]
  models: {
    /** null turns the sep_risk feed off: no model, no outlook (section 26.15). */
    sepRisk: SepRiskModel | null
    /** null turns the personal pattern second opinion off: no insight. */
    personalPattern: PersonalPatternModel | null
    /** null turns the Earth hospital second opinion off: no insight (section 26.19). */
    earthHospital: EarthHospitalModel | null
  }
}

/** Data a region is missing, reported even while an alert is active. */
export interface RegionGaps {
  overdue: IndicatorId[]
  missingFeeds: ContextFeedId[]
}

export interface Evaluation {
  baselines: Partial<Record<IndicatorId, Baseline>>
  /** Active alerts; superseded ones are included and flagged. */
  alerts: Alert[]
  regionStatus: Record<RegionId, Status>
  overall: Status
  overdue: IndicatorId[]
  /** Daily habitat feeds with no sample for today; never treated as normal. */
  missingFeeds: ContextFeedId[]
  regionGaps: Record<RegionId, RegionGaps>
  /** Notable second opinions for today; never used by alerts, statuses or routes. */
  insights: Insight[]
  /** null while no personal pattern model is loaded. */
  patternReadiness: PatternReadiness | null
}
