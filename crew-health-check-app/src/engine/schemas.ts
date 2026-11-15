import { z } from 'zod'
import { BASELINE_WINDOWS } from './baseline.ts'

// Zod schemas for every health data file (ARCHITECTURE.md sections 7 and 11)
// and for the runtime records the engine receives. Types are derived from
// these schemas in types.ts, so the two cannot drift apart.

export const INDICATOR_IDS = [
  'systolic_bp',
  'diastolic_bp',
  'heart_rate',
  'body_temp',
  'blood_glucose',
  'sleep_hours',
  'mood',
  'reaction_time',
  'exercise_minutes',
  'near_vision',
] as const

export const SYMPTOM_IDS = [
  'headache',
  'blurred_vision',
  'nausea',
  'congestion',
  'rash',
  'dizziness',
  'back_pain',
] as const

export const CONTEXT_FEED_IDS = [
  'cabin_co2',
  'radiation_cumulative',
  'solar_event',
  'sep_risk',
] as const

export const REGION_IDS = [
  'head',
  'eyes',
  'heart',
  'core',
  'bones_muscle',
  'skin',
  'whole_body',
] as const

export const ENVIRONMENT_IDS = [
  'leo_station',
  'lunar_surface',
  'mars_transit',
  'mars_surface',
  'mars_rover',
] as const

export const indicatorIdSchema = z.enum(INDICATOR_IDS)
export const symptomIdSchema = z.enum(SYMPTOM_IDS)
export const contextFeedIdSchema = z.enum(CONTEXT_FEED_IDS)
export const regionIdSchema = z.enum(REGION_IDS)
export const environmentIdSchema = z.enum(ENVIRONMENT_IDS)
export const severitySchema = z.enum(['watch', 'act'])
export const thresholdBasisSchema = z.enum([
  'nasa-standard',
  'peer-reviewed',
  'clinical-general',
  'illustrative',
])
export const opSchema = z.enum(['gt', 'gte', 'lt', 'lte'])

type IndicatorId = z.infer<typeof indicatorIdSchema>
type SymptomId = z.infer<typeof symptomIdSchema>
type ContextFeedId = z.infer<typeof contextFeedIdSchema>

// Section 11.1. `modelThreshold` (decided 14 November 2026) compares with the
// threshold of the loaded model file, so no model number is typed in rules.json.
export const comparisonSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('absolute'),
    op: opSchema,
    value: z.number(),
  }),
  z.strictObject({
    kind: z.literal('baselineOffset'),
    op: opSchema,
    offset: z.number(),
  }),
  z.strictObject({
    kind: z.literal('baselinePercent'),
    op: opSchema,
    percent: z.number(),
  }),
  z.strictObject({ kind: z.literal('zScore'), op: opSchema, z: z.number() }),
  z.strictObject({
    kind: z.literal('modelThreshold'),
    op: opSchema,
    model: z.literal('sep-risk'),
  }),
])

export type Comparison = z.infer<typeof comparisonSchema>

// Section 11.2. Written out by hand because the schema is recursive.
export type Condition =
  | {
      type: 'latest'
      indicator: IndicatorId
      test: Comparison
      maxAgeDays?: number
    }
  | {
      type: 'streak'
      indicator: IndicatorId
      test: Comparison
      minCount: number
      windowDays: number
    }
  | {
      type: 'average'
      indicator: IndicatorId
      windowDays: number
      minReadings: number
      test: Comparison
    }
  | { type: 'symptom'; symptom: SymptomId; withinDays: number }
  | {
      type: 'context'
      feed: ContextFeedId
      windowDays: number
      test: Comparison
    }
  | { type: 'all'; of: Condition[] }
  | { type: 'any'; of: Condition[] }

const dayCount = z.number().int().positive()

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('latest'),
      indicator: indicatorIdSchema,
      test: comparisonSchema,
      maxAgeDays: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.literal('streak'),
      indicator: indicatorIdSchema,
      test: comparisonSchema,
      minCount: dayCount,
      windowDays: dayCount,
    }),
    z.strictObject({
      type: z.literal('average'),
      indicator: indicatorIdSchema,
      windowDays: dayCount,
      minReadings: dayCount,
      test: comparisonSchema,
    }),
    z.strictObject({
      type: z.literal('symptom'),
      symptom: symptomIdSchema,
      withinDays: dayCount,
    }),
    z.strictObject({
      type: z.literal('context'),
      feed: contextFeedIdSchema,
      windowDays: dayCount,
      test: comparisonSchema,
    }),
    z.strictObject({
      type: z.literal('all'),
      of: z.array(conditionSchema).min(1),
    }),
    z.strictObject({
      type: z.literal('any'),
      of: z.array(conditionSchema).min(1),
    }),
  ]),
)

const sourceIdListSchema = z.array(z.string().min(1))

export const indicatorDefSchema = z
  .strictObject({
    id: indicatorIdSchema,
    label: z.string().min(1),
    /**
     * Name of an urgent re-check of this indicator, when "<label> re-check"
     * would be wrong: a blood sugar re-check is not a fasting value.
     */
    recheckLabel: z.string().min(1).optional(),
    unit: z.string(),
    region: regionIdSchema,
    input: z.enum(['number', 'scale', 'in_app_test']),
    cadenceDays: dayCount,
    inputMin: z.number(),
    inputMax: z.number(),
    step: z.number().positive(),
    minSpread: z.number().positive(),
    howToMeasure: z.string().min(1),
    whyInSpace: z.string().min(1),
    sourceIds: sourceIdListSchema.min(1),
  })
  .refine((def) => def.inputMin < def.inputMax, {
    message: 'inputMin must be below inputMax',
  })

export const regionDefSchema = z.strictObject({
  id: regionIdSchema,
  label: z.string().min(1),
  indicators: z.array(indicatorIdSchema),
  symptoms: z.array(symptomIdSchema),
  contextFeeds: z.array(contextFeedIdSchema),
})

export const sourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int().nullable(),
  url: z.url(),
  kind: z.enum([
    'nasa',
    'peer-reviewed',
    'space-agency',
    'event-rules',
    'reference',
  ]),
  keyFinding: z.string().min(1),
  verified: z.boolean(),
})

export const environmentSchema = z
  .strictObject({
    id: environmentIdSchema,
    label: z.string().min(1),
    gravity: z.enum(['micro', 'lunar', 'mars']),
    oneWayDelaySecMin: z.number().nonnegative(),
    oneWayDelaySecMax: z.number().nonnegative(),
    notes: z.string().min(1),
    sourceIds: sourceIdListSchema,
  })
  .refine((env) => env.oneWayDelaySecMin <= env.oneWayDelaySecMax, {
    message: 'oneWayDelaySecMin must not exceed oneWayDelaySecMax',
  })

export const ruleSchema = z.strictObject({
  id: z.string().regex(/^R-[A-Z0-9]+-[0-9]{2}$/),
  title: z.string().min(1),
  region: regionIdSchema,
  severity: severitySchema,
  when: conditionSchema,
  timeToActMin: z.number().positive(),
  needsGround: z.boolean(),
  privateToCrew: z.boolean(),
  explain: z.strictObject({
    what: z.string().min(1),
    whySpace: z.string().min(1),
  }),
  protocolId: z.string().regex(/^P-[A-Z0-9]+(-[A-Z0-9]+)*$/),
  supersedes: z.array(z.string()),
  sourceIds: sourceIdListSchema,
  basis: thresholdBasisSchema,
})

export const protocolSchema = z.strictObject({
  id: z.string().regex(/^P-[A-Z0-9]+(-[A-Z0-9]+)*$/),
  title: z.string().min(1),
  // Says why the protocol is a draft and which timings are illustrative; the
  // protocol screen must show it with the "Draft guidance" tag (section 18).
  note: z.string().min(1),
  steps: z
    .array(
      z.strictObject({
        text: z.string().min(1),
        detail: z.string().min(1).optional(),
      }),
    )
    .min(3)
    .max(6),
  recheckAfterHours: z.number().positive().nullable(),
  escalateIf: z.string().min(1),
  reviewed: z.boolean(),
  sourceIds: sourceIdListSchema,
})

export const indicatorsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  indicators: z.array(indicatorDefSchema).min(1),
})
export const regionsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  regions: z.array(regionDefSchema).min(1),
})
export const sourcesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sources: z.array(sourceSchema).min(1),
})
export const environmentsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  // Minutes the ground needs to answer: a prototype assumption (section 13.2).
  groundHandlingMin: z.number().nonnegative(),
  groundHandlingNote: z.string().min(1),
  environments: z.array(environmentSchema).min(1),
})
export const rulesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rules: z.array(ruleSchema).min(1),
})
export const protocolsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  protocols: z.array(protocolSchema).min(1),
})

// Runtime records (section 7). Validated when scenarios and storage load (M2, M3).

const missionDaySchema = z.number().int().positive()
const missionMsSchema = z.number().nonnegative()

export const crewMemberSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
})

export const readingSchema = z.strictObject({
  crewId: z.string().min(1),
  indicator: indicatorIdSchema,
  value: z.number(),
  day: missionDaySchema,
  atMs: missionMsSchema,
  origin: z.enum(['seed', 'manual', 'in_app_test']),
  // "recheck" marks an urgent repeat measurement asked for by an action card,
  // such as a non-fasting blood sugar re-check. Re-checks count for "latest"
  // conditions but never enter a baseline or replace the day's routine
  // reading. Absent means routine.
  purpose: z.enum(['routine', 'recheck']).optional(),
})

export const symptomReportSchema = z.strictObject({
  crewId: z.string().min(1),
  symptom: symptomIdSchema,
  day: missionDaySchema,
  atMs: missionMsSchema,
})

export const contextSampleSchema = z.strictObject({
  day: missionDaySchema,
  cabin_co2: z.number().nonnegative(),
  radiation_dose: z.number().nonnegative(),
  solar_event: z.boolean(),
})

export const linkStateSchema = z.strictObject({
  oneWayDelaySec: z.number().nonnegative(),
  linkUp: z.boolean(),
  groundHandlingMin: z.number().nonnegative(),
  /** Mission time the link last came up; absent means up since the start (M6). */
  upSinceMs: z.number().nonnegative().optional(),
})

// Section 26.11: fixed now so the shapes do not move; used from A2.
export const flareObservationSchema = z.strictObject({
  donkiId: z.string().min(1),
  link: z.url(),
  day: missionDaySchema,
  peakMs: missionMsSchema,
  classType: z.string().min(1),
  sourceLocation: z.string().min(1),
  riseMin: z.number().nonnegative(),
  durationMin: z.number().nonnegative().nullable(),
  cme: z
    .strictObject({
      speedKms: z.number().nonnegative(),
      halfAngleDeg: z.number().nonnegative(),
    })
    .nullable(),
})

export const sepRiskFeatureSchema = z.strictObject({
  name: z.string().min(1),
  group: z.string().min(1),
  mean: z.number(),
  scale: z.number().positive(),
  coef: z.number(),
  impute: z.number().nullable(),
})

// The fields inference needs. The engine takes this shape, so a test can
// build a small model; the whole file is checked by sepRiskModelFileSchema.
export const sepRiskModelSchema = z.object({
  modelId: z.literal('sep-risk'),
  version: z.string().min(1),
  features: z.array(sepRiskFeatureSchema).min(1),
  intercept: z.number(),
  threshold: z.number().gt(0).lt(1),
})

/** The features of sep-risk v1, in the order of ml/features.py (section 26.5). */
export const SEP_RISK_FEATURE_NAMES = [
  'log10_peak_flux',
  'lon_sin',
  'lon_cos',
  'log1p_rise_min',
  'log1p_duration_min',
  'has_cme',
  'log1p_cme_speed',
  'cme_half_angle_deg',
] as const

/** The feature that takes the model file's `impute` value when a flare has no end time. */
export const SEP_RISK_DURATION_FEATURE = 'log1p_duration_min'

const countSchema = z.number().int().nonnegative()
const intervalSchema = z.tuple([z.number(), z.number()])
// A score is null when its denominator is zero (for example precision with nothing flagged).
const scoreSchema = z.number().nullable()

const sepRiskSplitSchema = z.object({
  years: z.string().min(1),
  n: countSchema,
  positives: countSchema,
  excludedAmbiguous: countSchema,
})

const sepRiskScoresSchema = z.object({
  rocAuc: z.number(),
  prAuc: z.number(),
  brier: z.number().nonnegative(),
  brierSkill: scoreSchema,
  brierSkillVsOwnBaseRate: scoreSchema,
  tss: scoreSchema,
  hss: scoreSchema,
  precision: scoreSchema,
  recall: scoreSchema,
  falseAlarmRatio: scoreSchema,
  confusion: z.strictObject({
    tp: countSchema,
    fp: countSchema,
    tn: countSchema,
    fn: countSchema,
  }),
})

const sepRiskComparisonSchema = z.object({
  threshold: z.number(),
  validation: z.object({
    rocAuc: z.number(),
    tss: scoreSchema,
    brierSkill: scoreSchema,
  }),
  test: z.object({
    rocAuc: z.number(),
    rocAucCi95: intervalSchema,
    prAuc: z.number(),
    tss: scoreSchema,
    tssCi95: intervalSchema,
    brierSkill: scoreSchema,
    brierSkillVsOwnBaseRate: scoreSchema,
  }),
  shippedMinusThis: z.object({
    rocAuc: z.number(),
    rocAucCi95: intervalSchema,
    tss: z.number(),
    tssCi95: intervalSchema,
  }),
})

/**
 * src/data/models/sep-risk-v1.json, written by ml/train_sep_risk.py
 * (section 26.9). Checked when the app loads: the features must be exactly
 * the eight that sepRisk.ts computes, in the model file's order, and only
 * the duration feature may carry a value for a missing end time.
 */
export const sepRiskModelFileSchema = sepRiskModelSchema
  .extend({
    schemaVersion: z.literal(1),
    kind: z.literal('logistic-regression'),
    createdAt: z.string().min(1),
    label: z.string().min(1),
    data: z.object({
      source: z.string().min(1),
      sourceId: z.string().min(1),
      apiBase: z.url(),
      retrievedFrom: z.string().min(1),
      retrievedAt: z.string().min(1),
      firstFlare: z.string().min(1),
      lastFlare: z.string().min(1),
      filters: z.array(z.string().min(1)).min(1),
      dropped: z.record(z.string(), countSchema),
      sepRecordClasses: z.strictObject({
        observedOnly: countSchema,
        mixed: countSchema,
        modelOnly: countSchema,
        unknown: countSchema,
      }),
      splits: z.strictObject({
        train: sepRiskSplitSchema,
        validation: sepRiskSplitSchema,
        test: sepRiskSplitSchema,
      }),
    }),
    hyperparameters: z.object({
      C: z.number().positive(),
      penalty: z.literal('l2'),
      classWeight: z.null(),
    }),
    thresholdRule: z.string().min(1),
    metrics: z.object({
      validation: sepRiskScoresSchema,
      test: sepRiskScoresSchema.extend({
        rocAucCi95: intervalSchema,
        tssCi95: intervalSchema,
      }),
      testFlaggedAtThreshold: z.object({
        flagged: countSchema,
        of: countSchema,
      }),
      bootstrap: z.object({
        resamples: countSchema,
        used: countSchema,
        seed: z.number().int(),
        method: z.string().min(1),
      }),
      reliability: z
        .array(
          z.object({
            binFrom: z.number(),
            binTo: z.number(),
            n: countSchema,
            meanPredicted: z.number().nullable(),
            observed: z.number().nullable(),
          }),
        )
        .min(1),
    }),
    comparisons: z.object({
      climatology: z.object({
        trainingBaseRate: z.number().gt(0).lt(1),
        test: z.object({ brier: z.number().nonnegative() }),
      }),
      classOnly: sepRiskComparisonSchema,
      gradientBoosting: sepRiskComparisonSchema,
    }),
    limitations: z.array(z.string().min(1)).min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (model) =>
      model.features.length === SEP_RISK_FEATURE_NAMES.length &&
      model.features.every(
        (feature, index) => feature.name === SEP_RISK_FEATURE_NAMES[index],
      ),
    { message: 'features must be the eight sep-risk features, in order' },
  )
  .refine(
    (model) =>
      model.features.every(
        (feature) =>
          (feature.impute !== null) ===
          (feature.name === SEP_RISK_DURATION_FEATURE),
      ),
    {
      message:
        'only the duration feature carries a value for a missing end time',
    },
  )

// The personal pattern model (section 26.18). The fields inference needs; the
// whole file is checked by personalPatternModelFileSchema.
export const personalPatternModelSchema = z.object({
  modelId: z.literal('personal-pattern'),
  version: z.string().min(1),
  indicators: z.array(indicatorIdSchema).min(2),
  minIndicatorsToday: z.number().int().min(2),
  // Every baseline day needs a ready baseline, so never fewer than its minimum.
  minDays: z.number().int().min(BASELINE_WINDOWS.daily.minReadings),
})

const rateSchema = z.strictObject({
  flagged: countSchema,
  of: z.number().int().positive(),
  rate: z.number().min(0).max(1),
  ci95: intervalSchema,
})

const methodRatesSchema = z.object({
  model: rateSchema,
  rulesOnly: rateSchema,
  isolationForest: rateSchema,
})

/**
 * src/data/models/personal-pattern-v1.json, written by
 * ml/eval_personal_pattern.py. Its evaluation is simulated, and says so.
 */
export const personalPatternModelFileSchema = personalPatternModelSchema
  .extend({
    schemaVersion: z.literal(1),
    kind: z.literal('shrinkage-mahalanobis'),
    createdAt: z.string().min(1),
    label: z.string().min(1),
    designValues: z.array(z.string().min(1)),
    thresholdRule: z.string().min(1),
    headline: z.string().min(1),
    notableText: z.string().min(1),
    caveat: z.string().min(1),
    evaluation: z.object({
      simulated: z.literal(true),
      simulator: z.string().min(1),
      seed: z.number().int(),
      crewProfiles: z.array(z.string().min(1)).min(1),
      historiesPerProfile: z.number().int().positive(),
      histories: z.number().int().positive(),
      evaluationDays: intervalSchema,
      baselineDays: z.number().int().positive(),
      chanceIfExchangeable: z.number().gt(0).lt(1),
      shiftDays: z.number().int().positive(),
      sizeUnit: z.string().min(1),
      sizes: z.array(z.number().positive()).min(1),
      patterns: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            directions: z.partialRecord(indicatorIdSchema, z.number()),
          }),
        )
        .min(1),
      methods: z.object({
        model: z.string().min(1),
        rulesOnly: z.string().min(1),
        isolationForest: z.string().min(1),
      }),
      rulesEvaluated: z.array(z.string().min(1)),
      rulesNotEvaluated: z.array(z.string().min(1)),
      isolationForest: z.object({
        nEstimators: z.number().int().positive(),
        maxSamples: z.string().min(1),
        contamination: z.string().min(1),
        randomState: z.number().int(),
      }),
      falseNotice: methodRatesSchema,
      detection: z
        .array(
          methodRatesSchema.extend({
            pattern: z.string().min(1),
            size: z.number().positive(),
          }),
        )
        .min(1),
    }),
    limitations: z.array(z.string().min(1)).min(1),
    sourceIds: z.array(z.string().min(1)),
  })
  .refine(
    (model) => new Set(model.indicators).size === model.indicators.length,
    { message: 'indicators must not repeat' },
  )
  .refine((model) => model.minIndicatorsToday <= model.indicators.length, {
    message: 'minIndicatorsToday cannot exceed the number of indicators',
  })

// The Earth hospital model (section 26.19). The fields inference needs; the
// whole file is checked by earthHospitalModelFileSchema.

/** The five shared variables, in the order of ml/build_hospital_dataset.py. */
export const EARTH_HOSPITAL_INDICATORS = [
  'heart_rate',
  'body_temp',
  'systolic_bp',
  'diastolic_bp',
  'blood_glucose',
] as const

export const earthHospitalModelSchema = z.object({
  modelId: z.literal('earth-hospital'),
  version: z.string().min(1),
  features: z
    .array(
      z.object({
        name: z.string().min(1),
        indicator: indicatorIdSchema,
        physionet: z.string().min(1),
        mean: z.number(),
        scale: z.number().positive(),
        coef: z.number(),
      }),
    )
    .min(1),
  intercept: z.number(),
  threshold: z.number().gt(0).lt(1),
  targetFalsePositiveRate: z.number().gt(0).lt(1),
})

const hospitalScoresSchema = z.object({
  rows: countSchema,
  positiveRows: countSchema,
  rocAuc: z.number(),
  prAuc: z.number(),
  brier: z.number().nonnegative(),
  brierSkill: scoreSchema,
  sensitivity: scoreSchema,
  falsePositiveRate: scoreSchema,
  precision: scoreSchema,
  tss: scoreSchema,
  hss: scoreSchema,
  confusion: z.strictObject({
    tp: countSchema,
    fp: countSchema,
    tn: countSchema,
    fn: countSchema,
  }),
})

const hospitalIntervalsSchema = z.object({
  rocAuc: intervalSchema,
  tss: intervalSchema,
  sensitivity: intervalSchema,
  falsePositiveRate: intervalSchema,
})

const differenceSchema = z.object({
  value: z.number(),
  ci95: intervalSchema,
  finding: z.enum(['higher', 'lower', 'inconclusive']),
})

const hospitalComparisonSchema = z.object({
  threshold: z.number(),
  validation: hospitalScoresSchema,
  test: hospitalScoresSchema,
  testIntervals: hospitalIntervalsSchema,
  shippedMinusThis: z.object({
    test: z.object({ rocAuc: differenceSchema, tss: differenceSchema }),
  }),
})

const hospitalCountsSchema = z.object({
  patients: countSchema,
  rows: countSchema,
  positiveRows: countSchema,
  patientsWithPositiveRow: countSchema,
})

/** src/data/models/earth-hospital-v1.json, written by ml/train_earth_hospital.py. */
export const earthHospitalModelFileSchema = earthHospitalModelSchema
  .extend({
    schemaVersion: z.literal(1),
    kind: z.literal('logistic-regression'),
    createdAt: z.string().min(1),
    label: z.string().min(1),
    thresholdRule: z.string().min(1),
    headline: z.string().min(1),
    notableText: z.string().min(1),
    caveat: z.string().min(1),
    hyperparameters: z.object({ C: z.number().positive() }),
    data: z.object({
      source: z.string().min(1),
      version: z.string().min(1),
      page: z.url(),
      doi: z.url(),
      licenseOnPage: z.string().min(1),
      licenseFileFirstLine: z.string().min(1),
      citations: z.array(z.string().min(1)).min(1),
      retrieved: z.object({ start: z.string(), end: z.string() }),
      hospitals: z.record(
        z.string(),
        z.object({
          patients: countSchema,
          included: countSchema,
          rows: countSchema,
          positiveRows: countSchema,
          excluded: z.record(z.string(), countSchema),
        }),
      ),
      splits: z.object({
        train: hospitalCountsSchema,
        validation: hospitalCountsSchema,
        test: hospitalCountsSchema,
      }),
    }),
    metrics: z.object({
      validation: hospitalScoresSchema.extend({
        intervals: hospitalIntervalsSchema,
      }),
      test: hospitalScoresSchema.extend({ intervals: hospitalIntervalsSchema }),
      highestTssOnValidation: z.object({
        threshold: z.number(),
        tss: z.number(),
        sensitivity: z.number(),
        falsePositiveRate: z.number(),
      }),
      testPatients: z.object({
        patientsWithLabel: countSchema,
        ofThemFlaggedAtLeastOnce: countSchema,
        patientsWithoutLabel: countSchema,
        ofThemFlaggedAtLeastOnceWithout: countSchema,
      }),
      bootstrap: z.object({
        resamples: countSchema,
        used: countSchema,
        seed: z.number().int(),
      }),
    }),
    comparisons: z.object({
      temperatureOnly: hospitalComparisonSchema,
      gradientBoosting: hospitalComparisonSchema,
    }),
    scenarioCheck: z.object({
      note: z.string().min(1),
      fever: z.array(
        z.object({
          crewId: z.string(),
          moment: z.string(),
          day: z.number().int(),
          scored: z.boolean(),
          output: z.number().nullable(),
          notable: z.boolean(),
        }),
      ),
    }),
    limitations: z.array(z.string().min(1)).min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (model) =>
      model.features.length === EARTH_HOSPITAL_INDICATORS.length &&
      model.features.every(
        (feature, index) =>
          feature.indicator === EARTH_HOSPITAL_INDICATORS[index],
      ),
    { message: 'features must be the five shared indicators, in order' },
  )

// Scenario files generated by tools/simulator (section 24.1).

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

export const scenarioFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenarioId: slugSchema,
  title: z.string().min(1),
  simulated: z.literal(true),
  generator: z.string().min(1),
  missionDay: missionDaySchema,
  environmentId: environmentIdSchema,
  crew: z.array(crewMemberSchema).min(1),
  readings: z.array(readingSchema),
  symptoms: z.array(symptomReportSchema),
  context: z.array(contextSampleSchema),
  spaceWeather: z.array(flareObservationSchema),
  /** The real event a scenario uses, or null when everything is fictional. */
  basedOn: z.string().min(1).nullable(),
  expectedAlerts: z.array(
    z.strictObject({ crewId: z.string().min(1), ruleId: z.string().min(1) }),
  ),
  expectedInsights: z.array(
    z.strictObject({
      crewId: z.string().min(1),
      modelId: z.enum(['personal-pattern', 'earth-hospital']),
    }),
  ),
})

export const scenarioIndexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  simulated: z.literal(true),
  defaultScenarioId: slugSchema,
  scenarios: z
    .array(
      z.strictObject({
        scenarioId: slugSchema,
        title: z.string().min(1),
        environmentId: environmentIdSchema,
        missionDay: missionDaySchema,
        /** The scenario file's own note on the real events it replays, or null. */
        basedOn: z.string().min(1).nullable(),
      }),
    )
    .min(1),
})

/** public/data/space-weather.json: the real DONKI events used in scenarios (section 25). */
export const spaceWeatherFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.string().min(1),
  retrievedAt: z.string().min(1).nullable(),
  note: z.string().min(1),
  events: z.array(
    z.strictObject({
      donkiId: z.string().min(1),
      type: z.enum(['FLR', 'CME', 'SEP']),
      eventTime: z.string().min(1),
      link: z.url(),
      usedIn: z.array(slugSchema),
    }),
  ),
})

// Outbox message (section 15). Simulated replies were cut, so a message stops
// at "delivered"; nothing is really sent anywhere.
export const groundMessageSchema = z.strictObject({
  id: z.string().min(1),
  crewId: z.string().min(1),
  alertKey: z.string().min(1).nullable(),
  insightKey: z.string().min(1).nullable(),
  kind: z.enum(['report', 'consult']),
  title: z.string().min(1),
  body: z.string(),
  sentAtMs: missionMsSchema,
  /** When it actually left: later than sentAtMs if the link was down (M6). */
  departedAtMs: missionMsSchema.nullable().optional(),
  arrivesAtMs: missionMsSchema.nullable(),
  replyDueAtMs: missionMsSchema.nullable(),
  status: z.enum(['queued', 'in_transit', 'delivered']),
})
