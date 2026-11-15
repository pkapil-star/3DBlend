import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '../../engine/index.ts'
import { loadScenario, readScenario } from '../../test/helpers.tsx'
import { emptyState, useAppStore } from '../index.ts'
import { STORAGE_KEY, readPersisted } from '../persistence.ts'
import { selectEvaluation, selectEvaluationInput } from '../selectors.ts'

const state = () => useAppStore.getState()

describe('loadScenario', () => {
  it('sets 09:00 on the mission day and the first crew member', () => {
    const scenario = loadScenario('sleep-debt')
    expect(state().mission.nowMs).toBe(
      (scenario.missionDay - 1) * MS_PER_DAY + 32_400_000,
    )
    expect(state().mission.activeCrewId).toBe('c1')
    expect(state().mission.scenarioId).toBe('sleep-debt')
    expect(state().readings).toHaveLength(scenario.readings.length)
  })

  it('starts a Mars scenario at Mars near: 180 s', () => {
    loadScenario('sleep-debt')
    expect(state().mission.environmentId).toBe('mars_transit')
    expect(state().mission.link).toEqual({
      oneWayDelaySec: 180,
      linkUp: true,
      groundHandlingMin: 5,
    })
  })

  it('starts solar-storm at the station: 0 s', () => {
    loadScenario('solar-storm')
    expect(state().mission.environmentId).toBe('leo_station')
    expect(state().mission.link.oneWayDelaySec).toBe(0)
  })

  it('replaces the previous scenario and clears interaction state', () => {
    loadScenario('sleep-debt')
    state().addReading('sleep_hours', 6)
    state().reportSymptoms([])
    loadScenario('baseline-healthy')
    expect(state().readings).toHaveLength(
      readScenario('baseline-healthy').readings.length,
    )
    expect(state().noSymptomDays).toEqual({})
    expect(state().alertState).toEqual({})
    expect(state().outbox).toEqual([])
  })
})

describe('addReading', () => {
  it('stores an in-range reading for the active crew member at mission time', () => {
    loadScenario('sleep-debt')
    const before = state().readings.length
    expect(state().addReading('sleep_hours', 6.5)).toEqual({ ok: true })
    expect(state().readings).toHaveLength(before + 1)
    expect(state().readings.at(-1)).toEqual({
      crewId: 'c1',
      indicator: 'sleep_hours',
      value: 6.5,
      day: 142,
      atMs: state().mission.nowMs,
      origin: 'manual',
    })
  })

  it('refuses an out-of-range value with a message and stores nothing', () => {
    loadScenario('sleep-debt')
    const before = state().readings.length
    expect(state().addReading('sleep_hours', 99)).toEqual({
      ok: false,
      message: 'Enter a value between 0 and 14 h.',
    })
    expect(state().addReading('body_temp', Number.NaN)).toEqual({
      ok: false,
      message: 'Enter a number.',
    })
    expect(state().readings).toHaveLength(before)
  })

  it('marks an urgent re-check so it stays out of the baseline', () => {
    loadScenario('low-glucose')
    state().addReading('blood_glucose', 95, 'recheck')
    expect(state().readings.at(-1)).toMatchObject({
      value: 95,
      purpose: 'recheck',
    })
  })
})

describe('reportSymptoms', () => {
  it('records "None today" as an explicit answer', () => {
    loadScenario('sleep-debt')
    state().reportSymptoms([])
    expect(state().noSymptomDays).toEqual({ c1: [142] })
    expect(state().symptoms).toEqual([])
  })

  it("replaces today's answer", () => {
    loadScenario('sleep-debt')
    state().reportSymptoms([])
    state().reportSymptoms(['headache', 'nausea'])
    expect(state().noSymptomDays).toEqual({ c1: [] })
    expect(state().symptoms.map((report) => report.symptom)).toEqual([
      'headache',
      'nausea',
    ])
    state().reportSymptoms(['rash'])
    expect(state().symptoms.map((report) => report.symptom)).toEqual(['rash'])
  })
})

describe('environment and delay', () => {
  it('setEnvironment uses the fixed delay, or Mars near for a Mars environment', () => {
    loadScenario('solar-storm')
    state().setEnvironment('lunar_surface')
    expect(state().mission.link.oneWayDelaySec).toBe(1.3)
    state().setEnvironment('mars_rover')
    expect(state().mission.link.oneWayDelaySec).toBe(180)
  })

  it('setDelay stays inside the environment range', () => {
    loadScenario('sleep-debt')
    state().setDelay(1320)
    expect(state().mission.link.oneWayDelaySec).toBe(1320)
    state().setDelay(99_999)
    expect(state().mission.link.oneWayDelaySec).toBe(1320)
    state().setDelay(5)
    expect(state().mission.link.oneWayDelaySec).toBe(180)
    state().setEnvironment('leo_station')
    state().setDelay(600)
    expect(state().mission.link.oneWayDelaySec).toBe(0)
  })
})

describe('persistence', () => {
  it('writes the stored slices under chc-state, version 2, and nothing derived', () => {
    loadScenario('early-mission')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored.version).toBe(2)
    expect(Object.keys(stored.state).sort()).toEqual([
      'alertState',
      'context',
      'crew',
      'mission',
      'noSymptomDays',
      'outbox',
      'prefs',
      'readings',
      'soreness',
      'spaceWeather',
      'suit',
      'symptoms',
    ])
    expect(readPersisted(stored.state)).not.toBeNull()
  })

  it('discards storage that fails validation', () => {
    expect(readPersisted(null)).toBeNull()
    expect(readPersisted({ mission: { nowMs: 'yesterday' } })).toBeNull()
    const tampered = {
      ...emptyState(),
      readings: [{ indicator: 'sleep_hours', value: 'six' }],
    }
    expect(readPersisted(tampered)).toBeNull()
  })

  it('accepts a valid stored state', () => {
    loadScenario('early-mission')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(readPersisted(stored.state)?.mission.scenarioId).toBe(
      'early-mission',
    )
  })
})

describe('selectors', () => {
  it('evaluates the active crew member from the health slices', () => {
    loadScenario('sleep-debt')
    const evaluation = selectEvaluation(state())
    expect(evaluation.alerts.map((alert) => alert.key)).toEqual([
      'R-SLEEP-01:c1',
    ])
    expect(Object.keys(selectEvaluationInput(state())).sort()).toEqual([
      'context',
      'crewId',
      'indicators',
      'link',
      'models',
      'nowMs',
      'readings',
      'rules',
      'spaceWeather',
      'symptoms',
    ])
  })

  it('returns the same evaluation object until a health slice changes', () => {
    loadScenario('sleep-debt')
    const first = selectEvaluation(state())
    expect(selectEvaluation(state())).toBe(first)
    state().addReading('body_temp', 38.9)
    expect(selectEvaluation(state())).not.toBe(first)
  })

  it('re-triages when the delay changes', () => {
    loadScenario('low-glucose')
    expect(selectEvaluation(state()).alerts[0]).toMatchObject({
      ruleId: 'R-GLU-02',
      route: 'consult_ground',
      replyEtaMin: 11,
    })
    state().setDelay(1320)
    expect(selectEvaluation(state()).alerts[0]).toMatchObject({
      route: 'act_on_board',
      replyEtaMin: 49,
    })
  })
})
