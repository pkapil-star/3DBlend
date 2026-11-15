// Number formatting for the model card screen. The model file holds the
// numbers at full precision; these functions only decide how many digits to
// show, the same way as the generated model card (ml/reports/sep-risk-v1.md).

const MISSING = 'not available'

/** A score such as ROC AUC: three decimals. */
export function score(value: number | null, digits = 3): string {
  return value === null ? MISSING : value.toFixed(digits)
}

/** A difference between two scores, with its sign. */
export function signed(value: number, digits = 3): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`
}

/** A share between 0 and 1 as a percent with one decimal. */
export function percent(value: number | null): string {
  return value === null ? MISSING : `${(value * 100).toFixed(1)}%`
}

/** A 95% interval. */
export function interval(pair: readonly [number, number], digits = 3): string {
  return `${pair[0].toFixed(digits)} to ${pair[1].toFixed(digits)}`
}

/** "2026-11-14" from an ISO time. */
export function dateOf(iso: string): string {
  return iso.slice(0, 10)
}

export type Finding = 'higher' | 'lower' | 'inconclusive'

/**
 * What a 95% interval of "shipped model minus other model" allows us to say.
 * An interval that includes zero is inconclusive: it does not show that the
 * two models perform equally.
 */
export function findingOf(difference: readonly [number, number]): Finding {
  if (difference[0] > 0) return 'higher'
  if (difference[1] < 0) return 'lower'
  return 'inconclusive'
}
