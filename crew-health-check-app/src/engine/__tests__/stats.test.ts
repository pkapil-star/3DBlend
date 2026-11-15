import { describe, expect, it } from 'vitest'
import { MAD_SCALE, mad, mean, median, scaledMad } from '../stats.ts'

describe('median', () => {
  it('takes the middle value of an odd-length list, in any order', () => {
    expect(median([5, 1, 3])).toBe(3)
  })

  it('averages the two middle values of an even-length list', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('handles a single value', () => {
    expect(median([7])).toBe(7)
  })

  it('does not change the input array', () => {
    const values = [3, 1, 2]
    median(values)
    expect(values).toEqual([3, 1, 2])
  })

  it('refuses an empty list', () => {
    expect(() => median([])).toThrow(RangeError)
  })
})

describe('mad and scaledMad', () => {
  it('is the median distance from the median', () => {
    // median 3; distances 2, 1, 0, 1, 2 -> median distance 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1)
  })

  it('ignores one wild value', () => {
    // median 3; distances 2, 1, 0, 1, 97 -> median distance 1
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
  })

  it('is zero when every value is the same', () => {
    expect(mad([6, 6, 6])).toBe(0)
  })

  it('scales by 1.4826', () => {
    expect(MAD_SCALE).toBe(1.4826)
    expect(scaledMad([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 12)
  })

  it('refuses an empty list', () => {
    expect(() => mad([])).toThrow(RangeError)
  })
})

describe('mean', () => {
  it('averages the values', () => {
    expect(mean([2, 4, 9])).toBe(5)
  })

  it('refuses an empty list', () => {
    expect(() => mean([])).toThrow(RangeError)
  })
})
