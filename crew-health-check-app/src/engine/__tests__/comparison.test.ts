import { describe, expect, it } from 'vitest'
import {
  compareTo,
  describeCheck,
  targetFor,
  usesBaseline,
} from '../comparison.ts'
import type { Baseline } from '../types.ts'

const READY: Baseline = {
  ready: true,
  n: 10,
  center: 36.9,
  spread: 0.2,
  fromDay: 1,
  toDay: 28,
}
const NOT_READY: Baseline = { ready: false, n: 3, needed: 7 }
const NO_MODEL = { 'sep-risk': null }

describe('compareTo', () => {
  it('treats each operator at its boundary as the rule intends', () => {
    expect(compareTo(3, 'gt', 3)).toBe(false)
    expect(compareTo(3, 'gte', 3)).toBe(true)
    expect(compareTo(3, 'lt', 3)).toBe(false)
    expect(compareTo(3, 'lte', 3)).toBe(true)
    expect(compareTo(3.1, 'gt', 3)).toBe(true)
    expect(compareTo(2.9, 'lt', 3)).toBe(true)
  })

  it('is not fooled by floating-point noise at a boundary', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    expect(compareTo(0.1 + 0.2, 'lte', 0.3)).toBe(true)
    expect(compareTo(0.1 + 0.2, 'gt', 0.3)).toBe(false)
  })
})

describe('targetFor', () => {
  it('absolute: the stated value, with or without a baseline', () => {
    expect(
      targetFor(
        { kind: 'absolute', op: 'gte', value: 39 },
        NOT_READY,
        NO_MODEL,
      ),
    ).toBe(39)
    expect(
      targetFor({ kind: 'absolute', op: 'gte', value: 39 }, null, NO_MODEL),
    ).toBe(39)
  })

  it('baselineOffset: center plus offset', () => {
    expect(
      targetFor(
        { kind: 'baselineOffset', op: 'gte', offset: 1 },
        READY,
        NO_MODEL,
      ),
    ).toBeCloseTo(37.9, 12)
  })

  it('baselinePercent: center times (1 + percent/100)', () => {
    expect(
      targetFor(
        { kind: 'baselinePercent', op: 'gt', percent: 15 },
        READY,
        NO_MODEL,
      ),
    ).toBeCloseTo(36.9 * 1.15, 12)
  })

  it('zScore: center plus z spreads', () => {
    expect(
      targetFor({ kind: 'zScore', op: 'gt', z: 2 }, READY, NO_MODEL),
    ).toBeCloseTo(37.3, 12)
  })

  it('baseline comparisons cannot run while the baseline is not ready', () => {
    expect(
      targetFor(
        { kind: 'baselineOffset', op: 'gte', offset: 1 },
        NOT_READY,
        NO_MODEL,
      ),
    ).toBe(null)
    expect(
      targetFor(
        { kind: 'baselinePercent', op: 'gt', percent: 15 },
        null,
        NO_MODEL,
      ),
    ).toBe(null)
    expect(
      targetFor({ kind: 'zScore', op: 'gt', z: 2 }, NOT_READY, NO_MODEL),
    ).toBe(null)
  })

  it('modelThreshold: the loaded model file threshold, or nothing without a model', () => {
    // Fixture threshold for testing the mechanism only; not a model value.
    const fixtureThresholds = { 'sep-risk': 0.5 }
    const test = {
      kind: 'modelThreshold',
      op: 'gte',
      model: 'sep-risk',
    } as const
    expect(targetFor(test, null, fixtureThresholds)).toBe(0.5)
    expect(targetFor(test, null, NO_MODEL)).toBe(null)
  })
})

describe('usesBaseline and describeCheck', () => {
  it('flags only the baseline kinds', () => {
    expect(usesBaseline({ kind: 'baselineOffset', op: 'lt', offset: -1 })).toBe(
      true,
    )
    expect(
      usesBaseline({ kind: 'baselinePercent', op: 'gt', percent: 15 }),
    ).toBe(true)
    expect(usesBaseline({ kind: 'zScore', op: 'gt', z: 2 })).toBe(true)
    expect(usesBaseline({ kind: 'absolute', op: 'gt', value: 3 })).toBe(false)
    expect(
      usesBaseline({ kind: 'modelThreshold', op: 'gte', model: 'sep-risk' }),
    ).toBe(false)
  })

  it('words the operators plainly', () => {
    expect(describeCheck('gt', '3.0 mmHg')).toBe('above 3.0 mmHg')
    expect(describeCheck('gte', '39.0 °C')).toBe('at or above 39.0 °C')
    expect(describeCheck('lt', '70 mg/dL')).toBe('below 70 mg/dL')
    expect(describeCheck('lte', '5 h')).toBe('at or below 5 h')
  })
})
