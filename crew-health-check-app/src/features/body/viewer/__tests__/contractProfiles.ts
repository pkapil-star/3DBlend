import type { BodyProfile } from '../../../../bodyview/types.ts'

/**
 * The fictional crew A and B profiles of section 23.8, which placeholders are
 * built to. Tests of the placeholder use these, whatever body crew A uses.
 */
export const CONTRACT_PROFILES: Record<'crew-a' | 'crew-b', BodyProfile> = {
  'crew-a': {
    heightCm: 175,
    inseamCm: 79,
    shoulderBreadthCm: 42,
    upperArmCm: 34,
    forearmCm: 27,
    chestCm: 102,
    waistCm: 86,
    hipCm: 98,
    footCm: 27,
  },
  'crew-b': {
    heightCm: 175,
    inseamCm: 84,
    shoulderBreadthCm: 37,
    upperArmCm: 31,
    forearmCm: 25,
    chestCm: 88,
    waistCm: 72,
    hipCm: 100,
    footCm: 25,
  },
}
