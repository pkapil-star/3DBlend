import type {
  SensorReadout,
  SensorSiteId,
  SuitReplayFile,
  SuitSample,
  TimedValue,
} from './types.ts'

// Suit sensor readouts (ARCHITECTURE.md section 22.6). A simulated local
// surface reading: never a health input, never a stand-in for the daily
// body-temperature check.

const MINUTE_MS = 60_000

export const SENSOR_TAG = 'Simulated skin temperature'

/** Places the replay on the mission clock: atMs = anchorMs + offsetMin × 60 000. */
export function anchorReplay(
  replay: SuitReplayFile,
  anchorMs: number,
): SuitSample[] {
  return replay.samples.map((sample) => ({
    crewId: sample.crewId,
    site: sample.site,
    atMs: anchorMs + sample.offsetMin * MINUTE_MS,
    contact: sample.contact,
    tempC: sample.tempC,
  }))
}

/** True if the replay has any sample for this crew member. */
export function hasSuitData(
  samples: readonly SuitSample[],
  crewId: string,
): boolean {
  return samples.some((sample) => sample.crewId === crewId)
}

export interface ReadoutSettings {
  staleAfterMin: number
  trendWindowMin: number
}

/**
 * The readout rules of section 22.6, using only samples at or before nowMs:
 * the newest valid sample is current only while it is fresh; a lost or
 * expired sensor shows no current value, only its last valid one.
 */
export function sensorReadout(
  samples: readonly SuitSample[],
  crewId: string,
  site: SensorSiteId,
  nowMs: number,
  settings: ReadoutSettings,
): SensorReadout {
  const seen = samples
    .filter(
      (sample) =>
        sample.crewId === crewId &&
        sample.site === site &&
        sample.atMs <= nowMs,
    )
    .sort((a, b) => a.atMs - b.atMs)
  const valid: TimedValue[] = seen.flatMap((sample) =>
    sample.contact && sample.tempC !== null
      ? [{ tempC: sample.tempC, atMs: sample.atMs }]
      : [],
  )
  const newest = seen.at(-1)
  const lastValid = valid.at(-1) ?? null
  const fresh =
    lastValid !== null &&
    newest?.contact === true &&
    nowMs - lastValid.atMs <= settings.staleAfterMin * MINUTE_MS
  const trend = valid.filter(
    (value) => value.atMs >= nowMs - settings.trendWindowMin * MINUTE_MS,
  )
  const first = trend[0]
  const last = trend.at(-1)
  return {
    site,
    current: fresh ? lastValid : null,
    lastValid,
    contact: newest === undefined ? 'no_data' : newest.contact ? 'ok' : 'lost',
    trend,
    trendDeltaC:
      trend.length >= 2 && first !== undefined && last !== undefined
        ? roundTenth(last.tempC - first.tempC)
        : null,
  }
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * One line for the card, such as "Up 0.5 °C in the last hour". Only while
 * the sensor has a current reading: a lost or stale sensor shows no trend.
 */
export function trendText(
  readout: SensorReadout,
  trendWindowMin: number,
): string | null {
  if (readout.current === null || readout.trendDeltaC === null) return null
  const window =
    trendWindowMin === 60
      ? 'the last hour'
      : `the last ${trendWindowMin} minutes`
  const delta = readout.trendDeltaC
  if (delta === 0) return `No change in ${window}`
  const direction = delta > 0 ? 'Up' : 'Down'
  return `${direction} ${Math.abs(delta).toFixed(1)} °C in ${window}`
}
