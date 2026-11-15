import { describe, expect, it } from 'vitest'
import { MS_PER_DAY, missionDayOf } from '../../engine/index.ts'
import { loadScenario } from '../../test/helpers.tsx'
import { useAppStore } from '../index.ts'

// Mission time, the link and the crew switch (ARCHITECTURE.md sections 15,
// 16 and 31.12), through the store's named actions.

const store = () => useAppStore.getState()

function sleepDebtAtMarsFar() {
  loadScenario('sleep-debt')
  store().setDelay(1320)
  const result = store().sendToGround('R-SLEEP-01:c1')
  expect(result).toEqual({ ok: true })
  const message = store().outbox.find((entry) => entry.kind === 'consult')
  if (!message) throw new Error('no consult was queued')
  return message
}

describe('the outbox over mission time', () => {
  it('exit test: at 600× a consult sent at Mars far is delivered after the one-way delay, with its reply time', () => {
    const sent = sleepDebtAtMarsFar()
    const { link } = store().mission
    expect(sent.status).toBe('in_transit')
    expect(sent.departedAtMs).toBe(sent.sentAtMs)
    expect(sent.replyDueAtMs).toBe(
      sent.sentAtMs + 2 * 1320_000 + link.groundHandlingMin * 60_000,
    )
    store().setSpeed(600)
    // 600×: 2.2 real seconds per minute-long tick of the ticker; the store
    // receives the same mission time, in steps of 150 s.
    for (let step = 0; step < 8; step++) store().advanceTime(150_000)
    expect(store().outbox[0]?.status).toBe('in_transit')
    store().advanceTime(150_000)
    expect(store().outbox[0]?.status).toBe('delivered')
    expect(store().outbox[0]?.arrivesAtMs).toBe(sent.sentAtMs + 1320_000)
  })

  it('keeps a message in the outbox while the link is down, and sends it when the link is back', () => {
    loadScenario('sleep-debt')
    store().setDelay(1320)
    store().setLinkUp(false)
    store().sendToGround('R-SLEEP-01:c1')
    store().advanceTime(MS_PER_DAY)
    expect(store().outbox[0]?.status).toBe('queued')
    const backAt = store().mission.nowMs
    store().setLinkUp(true)
    expect(store().outbox[0]).toMatchObject({
      status: 'in_transit',
      departedAtMs: backAt,
      arrivesAtMs: backAt + 1320_000,
    })
  })

  it('"+1 day" moves the mission day, and "+10 min" the time', () => {
    loadScenario('sleep-debt')
    const before = store().mission.nowMs
    store().advanceTime(10 * 60_000)
    expect(store().mission.nowMs).toBe(before + 600_000)
    store().advanceTime(MS_PER_DAY)
    expect(missionDayOf(store().mission.nowMs)).toBe(missionDayOf(before) + 1)
  })

  it('ignores a step that does not move forward', () => {
    loadScenario('sleep-debt')
    const before = store().mission.nowMs
    store().advanceTime(0)
    store().advanceTime(-5)
    store().advanceTime(Number.NaN)
    expect(store().mission.nowMs).toBe(before)
  })

  it('remembers the speed', () => {
    loadScenario('sleep-debt')
    expect(store().mission.speed).toBe(0)
    store().setSpeed(60)
    expect(store().mission.speed).toBe(60)
  })
})

describe('switching crew member', () => {
  it("shows the other member's alerts and queues their automatic messages", () => {
    loadScenario('solar-storm')
    expect(store().outbox.map((message) => message.crewId)).toEqual(['c1'])
    store().switchCrew('c2')
    expect(store().mission.activeCrewId).toBe('c2')
    expect(
      store()
        .outbox.map((message) => message.id)
        .sort(),
    ).toEqual(['consult:R-RAD-01:c1', 'consult:R-RAD-01:c2'])
  })

  it('refuses a crew member who is not in the scenario', () => {
    loadScenario('solar-storm')
    store().switchCrew('c9')
    expect(store().mission.activeCrewId).toBe('c1')
  })
})
