/** Scales the median absolute deviation to match the standard deviation of normal data (section 10). */
export const MAD_SCALE = 1.4826

function requireValues(values: readonly number[], what: string): void {
  if (values.length === 0) {
    throw new RangeError(`${what} needs at least one value`)
  }
}

function sortedAt(sorted: readonly number[], index: number): number {
  const value = sorted[index]
  if (value === undefined) {
    throw new RangeError(`index ${index} is outside the array`)
  }
  return value
}

export function median(values: readonly number[]): number {
  requireValues(values, 'median')
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sortedAt(sorted, middle)
  }
  return (sortedAt(sorted, middle - 1) + sortedAt(sorted, middle)) / 2
}

/** Median absolute deviation: the median distance from the median. */
export function mad(values: readonly number[]): number {
  requireValues(values, 'mad')
  const center = median(values)
  return median(values.map((value) => Math.abs(value - center)))
}

export function scaledMad(values: readonly number[]): number {
  return MAD_SCALE * mad(values)
}

export function mean(values: readonly number[]): number {
  requireValues(values, 'mean')
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
