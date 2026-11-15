import { describe, expect, it } from 'vitest'
import type { GroundMessage, LinkState } from '../../engine/index.ts'
import { advance, replyDueAtMs } from '../earthLink.ts'

// The outbox state machine (ARCHITECTURE.md sections 15 and 31.12):
// queued, in transit, delivered; link down keeps messages queued.

const MIN = 60_000

function message(fields: Partial<GroundMessage> = {}): GroundMessage {
  return {
    id: 'consult:R-TEST:c1',
    crewId: 'c1',
    alertKey: 'R-TEST:c1',
    insightKey: null,
    kind: 'consult',
    title: 'Test',
    body: 'Body',
    sentAtMs: 10 * MIN,
    arrivesAtMs: null,
    replyDueAtMs: null,
    status: 'queued',
    ...fields,
  }
}

const MARS_FAR: LinkState = {
  oneWayDelaySec: 1320,
  linkUp: true,
  groundHandlingMin: 5,
}

describe('advance', () => {
  it('sends a queued message at once while the link is up', () => {
    const [sent] = advance([message()], 10 * MIN, MARS_FAR)
    expect(sent).toMatchObject({
      status: 'in_transit',
      departedAtMs: 10 * MIN,
      arrivesAtMs: 10 * MIN + 1320_000,
    })
  })

  it("expects a consult's reply after delay + handling + delay; a report has none", () => {
    const [consult] = advance([message()], 10 * MIN, MARS_FAR)
    expect(consult?.replyDueAtMs).toBe(10 * MIN + 1320_000 + 5 * MIN + 1320_000)
    expect(replyDueAtMs(0, MARS_FAR)).toBe(2 * 1320_000 + 5 * MIN)
    const [report] = advance([message({ kind: 'report' })], 10 * MIN, MARS_FAR)
    expect(report?.replyDueAtMs).toBeNull()
  })

  it('delivers after exactly one delay, not a moment before', () => {
    const [sent] = advance([message()], 10 * MIN, MARS_FAR)
    if (!sent) throw new Error('missing')
    const arrival = 10 * MIN + 1320_000
    expect(advance([sent], arrival - 1, MARS_FAR)[0]?.status).toBe('in_transit')
    expect(advance([sent], arrival, MARS_FAR)[0]?.status).toBe('delivered')
  })

  it('goes from the outbox to delivered in one step when the time has passed', () => {
    const [done] = advance([message()], 10 * MIN + 3_000_000, MARS_FAR)
    expect(done?.status).toBe('delivered')
  })

  it('keeps messages queued while the link is down, and changes nothing', () => {
    const down = { ...MARS_FAR, linkUp: false }
    const messages = [message()]
    expect(advance(messages, 100 * MIN, down)).toBe(messages)
  })

  it('sends a waiting message when the link comes back up, not before', () => {
    const backUp = { ...MARS_FAR, upSinceMs: 40 * MIN }
    const [sent] = advance([message()], 40 * MIN, backUp)
    expect(sent?.departedAtMs).toBe(40 * MIN)
    expect(sent?.arrivesAtMs).toBe(40 * MIN + 1320_000)
  })

  it('lets a message already on its way arrive while the link is down', () => {
    const [sent] = advance([message()], 10 * MIN, MARS_FAR)
    if (!sent) throw new Error('missing')
    const down = { ...MARS_FAR, linkUp: false }
    expect(advance([sent], 10 * MIN + 1320_000, down)[0]?.status).toBe(
      'delivered',
    )
  })

  it('keeps the arrival time when the delay changes on the way', () => {
    const [sent] = advance([message()], 10 * MIN, MARS_FAR)
    if (!sent) throw new Error('missing')
    const near = { ...MARS_FAR, oneWayDelaySec: 180 }
    const [still] = advance([sent], 10 * MIN + 200_000, near)
    expect(still?.status).toBe('in_transit')
    expect(still?.arrivesAtMs).toBe(10 * MIN + 1320_000)
  })

  it('returns the same array when nothing moves', () => {
    const [sent] = advance([message()], 10 * MIN, MARS_FAR)
    if (!sent) throw new Error('missing')
    const messages = [sent]
    expect(advance(messages, 11 * MIN, MARS_FAR)).toBe(messages)
  })
})
