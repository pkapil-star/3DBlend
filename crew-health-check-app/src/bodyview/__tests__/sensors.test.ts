import { describe, expect, it } from 'vitest'
import {
  anchorReplay,
  hasSuitData,
  sensorReadout,
  trendText,
} from '../sensors.ts'
import type { SuitReplayFile, SuitSample } from '../types.ts'

const MIN = 60_000
const NOW = 1_000 * MIN
const settings = { staleAfterMin: 15, trendWindowMin: 60 }

function sample(
  minutesBeforeNow: number,
  tempC: number | null,
  site: SuitSample['site'] = 'chest',
): SuitSample {
  return {
    crewId: 'c1',
    site,
    atMs: NOW - minutesBeforeNow * MIN,
    contact: tempC !== null,
    tempC,
  }
}

describe('sensorReadout', () => {
  it('shows the newest valid sample as current while it is fresh', () => {
    const readout = sensorReadout(
      [sample(10, 34.0), sample(5, 34.1)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(readout.current).toEqual({ tempC: 34.1, atMs: NOW - 5 * MIN })
    expect(readout.contact).toBe('ok')
  })

  it('is still current at exactly 15 minutes and stale just after', () => {
    const samples = [sample(15, 34.0)]
    expect(
      sensorReadout(samples, 'c1', 'chest', NOW, settings).current,
    ).not.toBeNull()
    const later = sensorReadout(samples, 'c1', 'chest', NOW + 1, settings)
    expect(later.current).toBeNull()
    expect(later.lastValid).toEqual({ tempC: 34.0, atMs: NOW - 15 * MIN })
  })

  it('shows no current value once contact is lost, but keeps the last valid one', () => {
    const readout = sensorReadout(
      [
        sample(40, 32.5, 'forearm_l'),
        sample(35, 32.5, 'forearm_l'),
        sample(30, null, 'forearm_l'),
        sample(0, null, 'forearm_l'),
      ],
      'c1',
      'forearm_l',
      NOW,
      settings,
    )
    expect(readout.current).toBeNull()
    expect(readout.contact).toBe('lost')
    expect(readout.lastValid).toEqual({ tempC: 32.5, atMs: NOW - 35 * MIN })
  })

  it('shows no current value just after contact is lost, even if the last value is recent', () => {
    const readout = sensorReadout(
      [sample(5, 32.5), sample(0, null)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(readout.current).toBeNull()
    expect(readout.contact).toBe('lost')
  })

  it('says no data when there is no sample yet', () => {
    const readout = sensorReadout(
      [sample(-5, 34.0)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(readout).toEqual({
      site: 'chest',
      current: null,
      lastValid: null,
      contact: 'no_data',
      trend: [],
      trendDeltaC: null,
    })
  })

  it('reads only the requested crew member and site', () => {
    const other = { ...sample(5, 36.0), crewId: 'c2' }
    const readout = sensorReadout(
      [other, sample(5, 33.0, 'upper_back')],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(readout.contact).toBe('no_data')
  })

  it('gives the trend over the last hour as last minus first', () => {
    const samples = [
      sample(70, 32.0),
      sample(60, 33.0),
      sample(30, 33.2),
      sample(0, 33.5),
    ]
    const readout = sensorReadout(samples, 'c1', 'chest', NOW, settings)
    expect(readout.trend.map((value) => value.tempC)).toEqual([
      33.0, 33.2, 33.5,
    ])
    expect(readout.trendDeltaC).toBe(0.5)
    expect(trendText(readout, 60)).toBe('Up 0.5 °C in the last hour')
  })

  it('shows no trend for a sensor without a current reading', () => {
    const readout = sensorReadout(
      [sample(40, 33.0), sample(35, 33.4), sample(30, null)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(readout.trendDeltaC).toBe(0.4)
    expect(trendText(readout, 60)).toBeNull()
  })

  it('words a fall and no change', () => {
    const fall = sensorReadout(
      [sample(20, 34.3), sample(0, 34.0)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(trendText(fall, 60)).toBe('Down 0.3 °C in the last hour')
    const flat = sensorReadout(
      [sample(20, 34.0), sample(0, 34.0)],
      'c1',
      'chest',
      NOW,
      settings,
    )
    expect(trendText(flat, 30)).toBe('No change in the last 30 minutes')
  })
})

describe('anchorReplay', () => {
  const replay: SuitReplayFile = {
    schemaVersion: 1,
    simulated: true,
    label: 'Simulated skin temperature',
    generator: 'test',
    intervalMin: 5,
    fromOffsetMin: -5,
    toOffsetMin: 0,
    samples: [
      {
        crewId: 'c1',
        site: 'chest',
        offsetMin: -5,
        contact: true,
        tempC: 34.0,
      },
      { crewId: 'c1', site: 'chest', offsetMin: 0, contact: true, tempC: 34.1 },
    ],
  }

  it('places offsets on the mission clock at the anchor', () => {
    const samples = anchorReplay(replay, NOW)
    expect(samples.map((entry) => entry.atMs)).toEqual([NOW - 5 * MIN, NOW])
    expect(hasSuitData(samples, 'c1')).toBe(true)
    expect(hasSuitData(samples, 'c3')).toBe(false)
  })
})
