import { z } from 'zod'
import { sorenessReportSchema } from '../bodyview/schemas.ts'
import {
  contextSampleSchema,
  crewMemberSchema,
  environmentIdSchema,
  flareObservationSchema,
  groundMessageSchema,
  linkStateSchema,
  readingSchema,
  symptomReportSchema,
} from '../engine/schemas.ts'

// What is written to localStorage (ARCHITECTURE.md section 21). Nothing
// derived is stored: alerts, baselines and statuses are recomputed.

export const STORAGE_KEY = 'chc-state'
export const STORAGE_VERSION = 2

const alertInteractionSchema = z.strictObject({
  firstSeenDay: z.number().int().positive(),
  lastSeenDay: z.number().int().positive(),
  acknowledgedAtMs: z.number().nonnegative().nullable(),
  stepsDone: z.array(z.number().int().nonnegative()),
})

export const persistedStateSchema = z.strictObject({
  mission: z.strictObject({
    nowMs: z.number().nonnegative(),
    speed: z.union([z.literal(0), z.literal(1), z.literal(60), z.literal(600)]),
    environmentId: environmentIdSchema,
    link: linkStateSchema,
    activeCrewId: z.string().min(1),
    scenarioId: z.string().min(1).nullable(),
  }),
  crew: z.array(crewMemberSchema),
  readings: z.array(readingSchema),
  symptoms: z.array(symptomReportSchema),
  /** Days on which a crew member answered "None today", by crew id. */
  noSymptomDays: z.record(z.string(), z.array(z.number().int().positive())),
  context: z.array(contextSampleSchema),
  spaceWeather: z.array(flareObservationSchema),
  alertState: z.record(z.string(), alertInteractionSchema),
  outbox: z.array(groundMessageSchema),
  /** Crew-reported soreness (section 22.5). Never a health input. Added in B1. */
  soreness: z.array(sorenessReportSchema),
  /** When the suit replay was anchored; the samples themselves are never stored. Added in B1. */
  suit: z.strictObject({ anchorMs: z.number().nonnegative().nullable() }),
  prefs: z.strictObject({ show3d: z.boolean(), force2d: z.boolean() }),
})

export type PersistedState = z.infer<typeof persistedStateSchema>
export type AlertInteraction = z.infer<typeof alertInteractionSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Version 1 (before B1) had no body view. Its health data, alerts and
 * messages are kept as they are; the body view starts empty, with the suit
 * replay anchored at the stored mission time when a scenario is loaded, as
 * "Restart suit replay" would. Anything else is returned unchanged and then
 * validated like any stored state.
 */
export function migratePersisted(stored: unknown, version: number): unknown {
  if (version !== 1 || !isRecord(stored)) return stored
  const mission = isRecord(stored.mission) ? stored.mission : {}
  const anchorMs =
    typeof mission.nowMs === 'number' && typeof mission.scenarioId === 'string'
      ? mission.nowMs
      : null
  return {
    ...stored,
    soreness: [],
    suit: { anchorMs },
    prefs: { show3d: false, force2d: false },
  }
}

/**
 * Bad or outdated storage is discarded, never trusted: the app then starts
 * empty and loads the default scenario (section 21).
 */
export function readPersisted(stored: unknown): PersistedState | null {
  const result = persistedStateSchema.safeParse(stored)
  return result.success ? result.data : null
}
