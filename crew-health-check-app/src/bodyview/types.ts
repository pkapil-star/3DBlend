import type { z } from 'zod'
import type * as schemas from './schemas.ts'

// Body view types (ARCHITECTURE.md section 22.2). Data shapes come from the
// Zod schemas; the derived readout is declared here. Mission time values are
// plain numbers in milliseconds; the body view does not import engine types.

export type SensorSiteId = z.infer<typeof schemas.sensorSiteIdSchema>
export type NamedAreaId = z.infer<typeof schemas.namedAreaIdSchema>
export type GeneralAreaId = z.infer<typeof schemas.generalAreaIdSchema>
export type BodyAreaId = z.infer<typeof schemas.bodyAreaIdSchema>

export type BodyProfile = z.infer<typeof schemas.bodyProfileSchema>
export type BodyModelEntry = z.infer<typeof schemas.bodyModelEntrySchema>
export type BodyModelsFile = z.infer<typeof schemas.bodyModelsFileSchema>
export type BodyAreasFile = z.infer<typeof schemas.bodyAreasFileSchema>
export type SensorSitesFile = z.infer<typeof schemas.sensorSitesFileSchema>
export type SensorSite = SensorSitesFile['sites'][number]
export type NodeMap = z.infer<typeof schemas.nodeMapSchema>
export type ModelLayer = z.infer<typeof schemas.modelLayerSchema>
export type PinAnchor = z.infer<typeof schemas.pinAnchorSchema>
export type SorenessReport = z.infer<typeof schemas.sorenessReportSchema>
export type SuitSample = z.infer<typeof schemas.suitSampleSchema>
export type SuitReplayFile = z.infer<typeof schemas.suitReplayFileSchema>

export interface TimedValue {
  tempC: number
  atMs: number
}

/** Derived for display; never stored. Null `current` means "No current reading". */
export interface SensorReadout {
  site: SensorSiteId
  current: TimedValue | null
  lastValid: TimedValue | null
  contact: 'ok' | 'lost' | 'no_data'
  /** Valid samples in the trend window, oldest first. */
  trend: TimedValue[]
  /** Last minus first in the trend window; null with fewer than two samples. */
  trendDeltaC: number | null
}
