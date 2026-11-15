import { z } from 'zod'

// Schemas for the body view (ARCHITECTURE.md section 22.2). The body view is
// kept apart from the health engine: nothing here imports src/engine, and no
// value described here ever reaches evaluate() or the outbox (decision D11).

export const sensorSiteIdSchema = z.enum(['chest', 'upper_back', 'forearm_l'])

export const namedAreaIdSchema = z.enum(['shoulder_r_outer'])

export const generalAreaIdSchema = z.enum([
  'head',
  'neck',
  'chest',
  'upper_back',
  'lower_back',
  'abdomen',
  'shoulder_l',
  'shoulder_r',
  'upper_arm_l',
  'upper_arm_r',
  'forearm_l',
  'forearm_r',
  'hand_l',
  'hand_r',
  'hip_l',
  'hip_r',
  'thigh_l',
  'thigh_r',
  'knee_l',
  'knee_r',
  'calf_l',
  'calf_r',
  'foot_l',
  'foot_r',
])

export const bodyAreaIdSchema = z.union([
  namedAreaIdSchema,
  generalAreaIdSchema,
])

const sourceIdsSchema = z.array(z.string().min(1)).min(1)

/** Fictional measurements a body model is built to, in centimeters (section 23.8). */
export const bodyProfileSchema = z.strictObject({
  heightCm: z.number().positive(),
  inseamCm: z.number().positive(),
  shoulderBreadthCm: z.number().positive(),
  upperArmCm: z.number().positive(),
  forearmCm: z.number().positive(),
  chestCm: z.number().positive(),
  waistCm: z.number().positive(),
  hipCm: z.number().positive(),
  footCm: z.number().positive(),
})

const patchCheckSchema = z.strictObject({
  checked: z.boolean(),
  checkedBy: z.string().min(1).nullable(),
})

/**
 * Where each contract role sits in a delivered file whose own node names
 * differ (section 23.12). Without a map the names are the contract's own.
 */
export const nodeMapSchema = z.strictObject({
  body: z.string().min(1),
  patch_shoulder_r_outer: z.string().min(1),
  sensor_chest: z.string().min(1),
  sensor_upper_back: z.string().min(1),
  sensor_forearm_l: z.string().min(1),
})

/** One anatomical layer of a delivered model: a group node shown or hidden as a whole. */
export const modelLayerSchema = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  node: z.string().min(1),
  defaultVisible: z.boolean(),
})

export const bodyModelEntrySchema = z
  .strictObject({
    id: z.string().min(1),
    crewId: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(['placeholder', 'delivered']),
    /** Relative to the site's base URL; null for the placeholder built in code. */
    file: z.string().min(1).nullable(),
    version: z.string().min(1),
    madeWith: z.string().min(1),
    /** True if an AI tool generated or changed the geometry, directly or through a script it wrote. */
    aiAssisted: z.boolean(),
    profile: bodyProfileSchema,
    patchChecks: z.strictObject({ shoulder_r_outer: patchCheckSchema }),
    notes: z.string(),
    /** "contract": the fictional profile of section 23.8; "measured": values measured on the delivered model. */
    profileSource: z.enum(['contract', 'measured']).optional(),
    nodeMap: nodeMapSchema.optional(),
    layers: z.array(modelLayerSchema).min(1).optional(),
    /** Credit the model's licence requires wherever it is shown. */
    attribution: z.string().min(1).optional(),
  })
  .refine(
    (entry) => (entry.status === 'placeholder') === (entry.file === null),
    { message: 'a placeholder has no file; a delivered model has one' },
  )
  .refine(
    (entry) =>
      entry.layers === undefined ||
      new Set(entry.layers.map((layer) => layer.id)).size ===
        entry.layers.length,
    { message: 'layer ids must be unique' },
  )

export const bodyModelsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  models: z.array(bodyModelEntrySchema).min(1),
})

export const bodyAreasFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Areas with a patch object in each model and a checked label (section 22.4). */
  named: z
    .array(
      z.strictObject({
        id: namedAreaIdSchema,
        label: z.string().min(1),
        detail: z.string().min(1),
        patchObject: z.string().min(1),
        sourceIds: sourceIdsSchema,
      }),
    )
    .min(1),
  /** Plain location words for the form, with no 3D patch and no anatomical claim. */
  general: z
    .array(
      z.strictObject({ id: generalAreaIdSchema, label: z.string().min(1) }),
    )
    .min(1),
})

export const sensorSitesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Display settings, not health thresholds (section 22.6). */
  staleAfterMin: z.number().positive(),
  trendWindowMin: z.number().positive(),
  /** The sentence every sensor card shows under its reading. */
  cardNote: z.string().min(1),
  sites: z
    .array(
      z.strictObject({
        id: sensorSiteIdSchema,
        label: z.string().min(1),
        anchorNode: z.string().min(1),
        sourceIds: sourceIdsSchema,
      }),
    )
    .min(1),
})

const vector3Schema = z.tuple([z.number(), z.number(), z.number()])

/** Where a pin sits, in the model root's own coordinates (meters, +Y up, front faces +Z). */
export const pinAnchorSchema = z.strictObject({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  target: z.enum(['body', 'patch_shoulder_r_outer']),
  point: vector3Schema,
  normal: vector3Schema,
})

/** The 0 to 10 scale of the soreness form (section 22.5): 0 is none, 10 the worst imaginable. */
export const SORENESS_SCORE_MIN = 0
export const SORENESS_SCORE_MAX = 10
export const sorenessScoreSchema = z
  .number()
  .int()
  .min(SORENESS_SCORE_MIN)
  .max(SORENESS_SCORE_MAX)

export const sorenessReportSchema = z.strictObject({
  id: z.string().min(1),
  crewId: z.string().min(1),
  day: z.number().int().positive(),
  atMs: z.number().nonnegative(),
  score: sorenessScoreSchema,
  /** Null for a free pin or a place described only in words. */
  areaId: bodyAreaIdSchema.nullable(),
  locationText: z.string().trim().min(1),
  activityNote: z.string(),
  /** Null when the report was entered without the 3D body. */
  anchor: pinAnchorSchema.nullable(),
})

export const suitSampleSchema = z
  .strictObject({
    crewId: z.string().min(1),
    site: sensorSiteIdSchema,
    atMs: z.number(),
    contact: z.boolean(),
    tempC: z.number().nullable(),
  })
  .refine((sample) => sample.contact === (sample.tempC !== null), {
    message: 'a sample has a temperature exactly when the sensor has contact',
  })

/** public/seed/suit-replay.json, written by tools/simulator/suit.py (section 24.5). */
export const suitReplayFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  simulated: z.literal(true),
  label: z.string().min(1),
  generator: z.string().min(1),
  intervalMin: z.number().int().positive(),
  fromOffsetMin: z.number().int(),
  toOffsetMin: z.number().int(),
  samples: z.array(
    z
      .strictObject({
        crewId: z.string().min(1),
        site: sensorSiteIdSchema,
        offsetMin: z.number().int(),
        contact: z.boolean(),
        tempC: z.number().nullable(),
      })
      .refine((sample) => sample.contact === (sample.tempC !== null), {
        message:
          'a sample has a temperature exactly when the sensor has contact',
      }),
  ),
})
