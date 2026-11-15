import { describe, expect, it } from 'vitest'
import {
  buildReport,
  entryLabel,
  pinVisibility,
  reportsForCrew,
  type SorenessInput,
} from '../pins.ts'
import type { PinAnchor, SorenessReport } from '../types.ts'

const context = { id: 'soreness:c1:100:1', crewId: 'c1', day: 142, atMs: 100 }

const shoulder: SorenessInput = {
  score: 4,
  areaId: 'shoulder_r_outer',
  locationText: 'Right outer shoulder',
  activityNote: 'after overhead work',
  anchor: null,
}

const anchor: PinAnchor = {
  modelId: 'crew-a',
  modelVersion: 'placeholder-1',
  target: 'patch_shoulder_r_outer',
  point: [-0.21, 1.42, 0.01],
  normal: [-1, 0, 0],
}

function report(overrides: Partial<SorenessReport>): SorenessReport {
  const built = buildReport(shoulder, context)
  if (!built.ok) throw new Error('fixture must be valid')
  return { ...built.report, ...overrides }
}

describe('buildReport', () => {
  it('builds a report for the given crew member and time', () => {
    const result = buildReport(shoulder, context)
    expect(result).toEqual({
      ok: true,
      report: { ...context, ...shoulder },
    })
  })

  it.each([0, 10])('accepts the score %s', (score) => {
    expect(buildReport({ ...shoulder, score }, context).ok).toBe(true)
  })

  it.each([-1, 11, 4.5, Number.NaN])('refuses the score %s', (score) => {
    expect(buildReport({ ...shoulder, score }, context)).toEqual({
      ok: false,
      problems: ['score'],
    })
  })

  it('requires the location words and trims them and the note', () => {
    expect(buildReport({ ...shoulder, locationText: '   ' }, context)).toEqual({
      ok: false,
      problems: ['location'],
    })
    const result = buildReport(
      { ...shoulder, locationText: '  Left calf ', activityNote: '  ' },
      context,
    )
    expect(result.ok && result.report.locationText).toBe('Left calf')
    expect(result.ok && result.report.activityNote).toBe('')
  })

  it('reports every problem at once', () => {
    const result = buildReport(
      { ...shoulder, score: 12, locationText: '' },
      context,
    )
    expect(result).toEqual({ ok: false, problems: ['score', 'location'] })
  })

  it('keeps a free pin with no area', () => {
    const result = buildReport(
      {
        ...shoulder,
        areaId: null,
        locationText: 'Left calf',
        anchor: { ...anchor, target: 'body' },
      },
      context,
    )
    expect(result.ok && result.report.areaId).toBeNull()
    expect(result.ok && result.report.anchor?.target).toBe('body')
  })

  it('refuses a malformed pin', () => {
    const broken = { ...anchor, point: [0, 1] } as unknown as PinAnchor
    expect(buildReport({ ...shoulder, anchor: broken }, context)).toEqual({
      ok: false,
      problems: ['anchor'],
    })
  })
})

describe('entryLabel', () => {
  it('reads like the list entry in section 22.5', () => {
    expect(entryLabel(report({}))).toBe(
      'Right outer shoulder · 4/10 · after overhead work · Crew-reported soreness',
    )
  })

  it('leaves out an empty note', () => {
    expect(
      entryLabel(
        report({ locationText: 'Left calf', score: 2, activityNote: '' }),
      ),
    ).toBe('Left calf · 2/10 · Crew-reported soreness')
  })

  it('never uses injury words', () => {
    expect(entryLabel(report({}))).not.toMatch(/strain|injur|inflam/i)
  })
})

describe('reportsForCrew', () => {
  it('keeps only the crew member’s own reports, newest first', () => {
    const reports = [
      report({ id: 'a', crewId: 'c1', atMs: 10 }),
      report({ id: 'b', crewId: 'c2', atMs: 20 }),
      report({ id: 'c', crewId: 'c1', atMs: 30 }),
    ]
    expect(reportsForCrew(reports, 'c1').map((entry) => entry.id)).toEqual([
      'c',
      'a',
    ])
    expect(reportsForCrew(reports, 'c2').map((entry) => entry.id)).toEqual([
      'b',
    ])
    expect(reportsForCrew(reports, 'c3')).toEqual([])
  })
})

describe('pinVisibility', () => {
  const pinned = report({ anchor })

  it('draws a pin only on the same model and version', () => {
    expect(
      pinVisibility(pinned, { id: 'crew-a', version: 'placeholder-1' }),
    ).toBe('drawn')
  })

  it('does not draw it on another version or another body, and keeps the text', () => {
    expect(pinVisibility(pinned, { id: 'crew-a', version: 'chirag-1' })).toBe(
      'other_version',
    )
    expect(
      pinVisibility(pinned, { id: 'crew-b', version: 'placeholder-1' }),
    ).toBe('other_version')
    expect(pinVisibility(pinned, null)).toBe('other_version')
    expect(entryLabel(pinned)).toContain('Right outer shoulder')
  })

  it('has nothing to draw for a report made without the 3D body', () => {
    expect(
      pinVisibility(report({ anchor: null }), {
        id: 'crew-a',
        version: 'placeholder-1',
      }),
    ).toBe('no_pin')
  })
})
