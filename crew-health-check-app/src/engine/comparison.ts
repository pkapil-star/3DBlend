import type { Baseline, Comparison, Op } from './types.ts'

/** Thresholds of the loaded model files; null when a model is not loaded. */
export interface ModelThresholds {
  'sep-risk': number | null
}

// Readings are stored as decimals such as 37.9, and a baseline sum such as
// 36.9 + 1.0 can land a hair away from it. The tolerance keeps boundary
// readings on the side the rule intends.
const TOLERANCE = 1e-9

export function compareTo(value: number, op: Op, target: number): boolean {
  switch (op) {
    case 'gt':
      return value > target + TOLERANCE
    case 'gte':
      return value >= target - TOLERANCE
    case 'lt':
      return value < target - TOLERANCE
    case 'lte':
      return value <= target + TOLERANCE
  }
}

/**
 * The value a reading is compared with, or null when the comparison cannot run:
 * a baseline comparison while the baseline is not ready, or a model threshold
 * while the model is not loaded (sections 10 and 11.1).
 * A z-score test `z op k` is the same as `value op center + k × spread`,
 * because the spread is always positive.
 */
export function targetFor(
  test: Comparison,
  baseline: Baseline | null,
  modelThresholds: ModelThresholds,
): number | null {
  switch (test.kind) {
    case 'absolute':
      return test.value
    case 'baselineOffset':
      return baseline?.ready ? baseline.center + test.offset : null
    case 'baselinePercent':
      return baseline?.ready ? baseline.center * (1 + test.percent / 100) : null
    case 'zScore':
      return baseline?.ready ? baseline.center + test.z * baseline.spread : null
    case 'modelThreshold':
      return modelThresholds[test.model]
  }
}

export function usesBaseline(test: Comparison): boolean {
  return (
    test.kind === 'baselineOffset' ||
    test.kind === 'baselinePercent' ||
    test.kind === 'zScore'
  )
}

const OP_WORDS: Record<Op, string> = {
  gt: 'above',
  gte: 'at or above',
  lt: 'below',
  lte: 'at or below',
}

export function describeCheck(op: Op, targetText: string): string {
  return `${OP_WORDS[op]} ${targetText}`
}
