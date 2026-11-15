import { describe, expect, it } from 'vitest'
import { scenarioStartMs } from '../../clock/missionClock.ts'
import { loadScenario } from '../../test/helpers.tsx'
import { emptyState, useAppStore } from '../index.ts'
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  migratePersisted,
  readPersisted,
} from '../persistence.ts'

const shoulder = {
  score: 4,
  areaId: 'shoulder_r_outer' as const,
  locationText: 'Right outer shoulder',
  activityNote: 'after overhead work',
  anchor: null,
}

describe('soreness reports in the store', () => {
  it('saves a report for the active crew member at the current mission time', () => {
    const scenario = loadScenario('sleep-debt')
    const result = useAppStore.getState().addSorenessReport(shoulder)
    expect(result.ok).toBe(true)
    const [saved] = useAppStore.getState().soreness
    expect(saved).toMatchObject({
      crewId: 'c1',
      day: scenario.missionDay,
      atMs: scenarioStartMs(scenario.missionDay),
      score: 4,
    })
  })

  it('refuses an invalid report and stores nothing', () => {
    loadScenario('sleep-debt')
    const result = useAppStore
      .getState()
      .addSorenessReport({ ...shoulder, score: 11 })
    expect(result).toEqual({ ok: false, problems: ['score'] })
    expect(useAppStore.getState().soreness).toEqual([])
  })

  it('gives two reports at the same moment different ids', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport(shoulder)
    useAppStore.getState().addSorenessReport(shoulder)
    const ids = useAppStore.getState().soreness.map((report) => report.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('keeps each crew member’s reports separate', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport(shoulder)
    useAppStore.getState().switchCrew('c2')
    useAppStore.getState().addSorenessReport({
      ...shoulder,
      areaId: 'calf_l',
      locationText: 'Left calf',
    })
    const byCrew = useAppStore
      .getState()
      .soreness.map((report) => [report.crewId, report.locationText])
    expect(byCrew).toEqual([
      ['c1', 'Right outer shoulder'],
      ['c2', 'Left calf'],
    ])
  })

  it('removes one report', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport(shoulder)
    const [saved] = useAppStore.getState().soreness
    useAppStore.getState().removeSorenessReport(saved?.id ?? '')
    expect(useAppStore.getState().soreness).toEqual([])
  })

  it('loading a scenario clears soreness and anchors the suit replay at its start', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport(shoulder)
    const scenario = loadScenario('fever')
    expect(useAppStore.getState().soreness).toEqual([])
    expect(useAppStore.getState().suit.anchorMs).toBe(
      scenarioStartMs(scenario.missionDay),
    )
  })

  it('restarting the suit replay re-anchors it at the current mission time', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().advanceTime(45 * 60_000)
    useAppStore.getState().restartSuitReplay()
    expect(useAppStore.getState().suit.anchorMs).toBe(
      useAppStore.getState().mission.nowMs,
    )
  })

  it('keeps the 3D and Force 2D preferences', () => {
    useAppStore.getState().setShow3d(true)
    useAppStore.getState().setForce2d(true)
    expect(useAppStore.getState().prefs).toEqual({
      show3d: true,
      force2d: true,
    })
    loadScenario('fever')
    expect(useAppStore.getState().prefs).toEqual({
      show3d: true,
      force2d: true,
    })
  })
})

describe('storage version 2 (section 21)', () => {
  /** The stored shape before B1: no soreness, no suit, empty prefs. */
  function storedVersion1() {
    const state = emptyState()
    return {
      mission: { ...state.mission, nowMs: 5_000_000, scenarioId: 'fever' },
      crew: state.crew,
      readings: state.readings,
      symptoms: state.symptoms,
      noSymptomDays: state.noSymptomDays,
      context: state.context,
      spaceWeather: state.spaceWeather,
      alertState: state.alertState,
      outbox: state.outbox,
      prefs: {},
    }
  }

  it('migrates a version 1 state and keeps its health data', () => {
    const migrated = readPersisted(migratePersisted(storedVersion1(), 1))
    expect(migrated).not.toBeNull()
    expect(migrated?.soreness).toEqual([])
    expect(migrated?.suit).toEqual({ anchorMs: 5_000_000 })
    expect(migrated?.prefs).toEqual({ show3d: false, force2d: false })
    expect(migrated?.mission.scenarioId).toBe('fever')
  })

  it('leaves the replay unanchored when no scenario was loaded', () => {
    const before = {
      ...storedVersion1(),
      mission: { ...storedVersion1().mission, scenarioId: null },
    }
    expect(readPersisted(migratePersisted(before, 1))?.suit).toEqual({
      anchorMs: null,
    })
  })

  it('discards broken storage instead of trusting it', () => {
    expect(readPersisted(migratePersisted('nonsense', 1))).toBeNull()
    expect(readPersisted(migratePersisted({ mission: 1 }, 1))).toBeNull()
  })

  it('restores a stored version 1 state through the store', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: storedVersion1(), version: 1 }),
    )
    await useAppStore.persist.rehydrate()
    const state = useAppStore.getState()
    expect(state.mission.scenarioId).toBe('fever')
    expect(state.suit).toEqual({ anchorMs: 5_000_000 })
    expect(STORAGE_VERSION).toBe(2)
  })
})
