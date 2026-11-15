import { describe, expect, it } from 'vitest'
import { lastReadingPerDay } from '../../engine/index.ts'
import { loadScenario } from '../../test/helpers.tsx'
import { useAppStore } from '../index.ts'
import { STORAGE_KEY, readPersisted } from '../persistence.ts'
import { selectEvaluation } from '../selectors.ts'

// Milestone M4 (ARCHITECTURE.md section 31.6): the route changes with
// distance, and the outbox holds one message per alert and kind.

const store = () => useAppStore.getState()
const alertFor = (ruleId: string) =>
  selectEvaluation(store()).alerts.find((alert) => alert.ruleId === ruleId)
const messages = () =>
  store().outbox.map((message) => `${message.kind}:${message.alertKey}`)

describe('solar-storm across the four delay columns of section 13.5', () => {
  it('loads at the station: consult the ground, reply in 5 min', () => {
    loadScenario('solar-storm')
    expect(store().mission.environmentId).toBe('leo_station')
    expect(alertFor('R-RAD-01')).toMatchObject({
      route: 'consult_ground',
      replyEtaMin: 5,
    })
  })

  it('Moon base (1.3 s) stays consult the ground, about 5 min', () => {
    loadScenario('solar-storm')
    store().setEnvironment('lunar_surface')
    const alert = alertFor('R-RAD-01')
    expect(alert?.route).toBe('consult_ground')
    expect(alert?.replyEtaMin).toBeCloseTo(5.0433, 3)
  })

  it('Mars near (180 s) gives 11 min and consult the ground', () => {
    loadScenario('solar-storm')
    store().setEnvironment('mars_transit')
    expect(store().mission.link.oneWayDelaySec).toBe(180)
    expect(alertFor('R-RAD-01')).toMatchObject({
      route: 'consult_ground',
      replyEtaMin: 11,
    })
  })

  it('Mars far (1320 s) gives 49 min and act on board: the exit test', () => {
    loadScenario('solar-storm')
    store().setEnvironment('mars_transit')
    store().setDelay(1320)
    expect(alertFor('R-RAD-01')).toMatchObject({
      route: 'act_on_board',
      replyEtaMin: 49,
    })
  })

  it('the Mars rover has the same range and the same route logic', () => {
    loadScenario('solar-storm')
    store().setEnvironment('mars_rover')
    expect(alertFor('R-RAD-01')?.route).toBe('consult_ground')
    store().setDelay(1320)
    expect(alertFor('R-RAD-01')?.route).toBe('act_on_board')
  })

  it('keeps the delay inside the environment range', () => {
    loadScenario('solar-storm')
    store().setEnvironment('mars_surface')
    store().setDelay(5000)
    expect(store().mission.link.oneWayDelaySec).toBe(1320)
    store().setDelay(-10)
    expect(store().mission.link.oneWayDelaySec).toBe(180)
    store().setEnvironment('leo_station')
    store().setDelay(600)
    expect(store().mission.link.oneWayDelaySec).toBe(0)
  })
})

describe('the outbox', () => {
  it('queues one consult when the route is consult the ground', () => {
    loadScenario('solar-storm')
    expect(messages()).toEqual(['consult:R-RAD-01:c1'])
    // The station has no delay: the consult leaves and arrives at once (M6),
    // and its reply is expected after the ground's handling time.
    const sentAtMs = store().mission.nowMs
    expect(store().outbox[0]).toMatchObject({
      status: 'delivered',
      title: 'Solar particle event in progress',
      crewId: 'c1',
      sentAtMs,
      departedAtMs: sentAtMs,
      arrivesAtMs: sentAtMs,
      replyDueAtMs: sentAtMs + store().mission.link.groundHandlingMin * 60_000,
    })
  })

  it('moving the slider many times leaves one entry per alert and kind', () => {
    loadScenario('solar-storm')
    store().setEnvironment('mars_transit')
    for (let round = 0; round < 25; round++) {
      for (const delay of [180, 600, 780, 1320, 900, 240]) {
        store().setDelay(delay)
      }
    }
    store().setEnvironment('mars_rover')
    store().setDelay(1320)
    expect(messages().sort()).toEqual([
      'consult:R-RAD-01:c1',
      'report:R-RAD-01:c1',
    ])
    const ids = store().outbox.map((message) => message.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the report says who, which day, what changed, the route and the steps done', () => {
    loadScenario('solar-storm')
    store().toggleStep('R-RAD-01:c1', 0)
    store().toggleStep('R-RAD-01:c1', 1)
    store().setEnvironment('mars_transit')
    store().setDelay(1320)
    const report = store().outbox.find((message) => message.kind === 'report')
    expect(report?.body.split('\n')).toEqual([
      'From Crew member A, Commander, mission day 120.',
      'Alert: Solar particle event in progress.',
      expect.stringMatching(/^What changed: /),
      'Route: Act now on board. A reply from Earth would take about 49 min.',
      'Steps done so far: 1, 2.',
    ])
  })

  it('a self-care alert sends nothing unless the crew member chooses to', () => {
    loadScenario('sleep-debt')
    expect(alertFor('R-SLEEP-01')?.route).toBe('self_care')
    expect(store().outbox).toEqual([])

    expect(store().sendToGround('R-SLEEP-01:c1')).toEqual({ ok: true })
    expect(store().sendToGround('R-SLEEP-01:c1')).toEqual({ ok: true })
    expect(messages()).toEqual(['consult:R-SLEEP-01:c1'])
  })

  it('"Send to ground" is refused for an alert that is not active', () => {
    loadScenario('sleep-debt')
    expect(store().sendToGround('R-GLU-02:c1')).toEqual({
      ok: false,
      message: 'This alert is no longer active.',
    })
  })

  it('loading a scenario clears the outbox and the alert interactions', () => {
    loadScenario('solar-storm')
    store().acknowledgeAlert('R-RAD-01:c1')
    loadScenario('sleep-debt')
    expect(store().outbox).toEqual([])
    expect(Object.keys(store().alertState)).toEqual(['R-SLEEP-01:c1'])
    expect(store().alertState['R-SLEEP-01:c1']?.acknowledgedAtMs).toBeNull()
  })
})

describe('alert interactions', () => {
  it('records acknowledgement and step ticks, and stores them', () => {
    loadScenario('solar-storm')
    store().acknowledgeAlert('R-RAD-01:c1')
    store().toggleStep('R-RAD-01:c1', 2)
    store().toggleStep('R-RAD-01:c1', 0)
    store().toggleStep('R-RAD-01:c1', 2)

    const interaction = store().alertState['R-RAD-01:c1']
    expect(interaction).toEqual({
      firstSeenDay: 120,
      lastSeenDay: 120,
      acknowledgedAtMs: store().mission.nowMs,
      stepsDone: [0],
    })
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = readPersisted(JSON.parse(raw ?? 'null').state)
    expect(stored?.alertState['R-RAD-01:c1']).toEqual(interaction)
  })

  it('ignores a step index that is not a whole number', () => {
    loadScenario('solar-storm')
    store().toggleStep('R-RAD-01:c1', -1)
    store().toggleStep('R-RAD-01:c1', 1.5)
    expect(store().alertState['R-RAD-01:c1']?.stepsDone).toEqual([])
  })
})

describe('urgent glucose re-checks (section 10)', () => {
  it('a normal re-check clears the low reading alert without touching the fasting history', () => {
    loadScenario('low-glucose')
    const before = selectEvaluation(store()).baselines.blood_glucose
    expect(alertFor('R-GLU-02')).toBeDefined()

    expect(store().addReading('blood_glucose', 88, 'recheck')).toEqual({
      ok: true,
    })

    expect(alertFor('R-GLU-02')).toBeUndefined()
    expect(selectEvaluation(store()).baselines.blood_glucose).toEqual(before)
    const own = store().readings.filter((reading) => reading.crewId === 'c1')
    // Day 75 keeps its routine fasting value; the re-check never replaces it.
    expect(lastReadingPerDay(own, 'blood_glucose').at(-1)).toMatchObject({
      day: 75,
      value: 62,
    })
  })

  it('a still-low re-check keeps the alert and is never called fasting', () => {
    loadScenario('low-glucose')
    store().addReading('blood_glucose', 64, 'recheck')
    const evidence = alertFor('R-GLU-02')?.evidence[0]
    expect(evidence).toMatchObject({
      label: 'Blood sugar re-check (not fasting), latest',
      value: '64 mg/dL on day 75',
    })
    expect(evidence?.label).not.toMatch(/^Fasting/)
  })
})
