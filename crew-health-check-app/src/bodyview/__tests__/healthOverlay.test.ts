import { describe, expect, it } from 'vitest'
import {
  breathPhase,
  heartbeatPhase,
  latestValue,
  regionForPart,
  regionForSkinId,
  skinPointStatus,
  tintStrength,
  worse,
  zoneForPoint,
} from '../healthOverlay.ts'

describe('health status overlay mapping (section 22.12)', () => {
  it('takes the more serious status, and no data never hides a status', () => {
    expect(worse('good', 'watch')).toBe('watch')
    expect(worse('act', 'watch')).toBe('act')
    expect(worse('no_data', 'good')).toBe('good')
    expect(worse('no_data', 'no_data')).toBe('no_data')
  })

  it('maps the anatomical skin regions to app regions', () => {
    expect(regionForSkinId(1)).toBe('head')
    expect(regionForSkinId(3)).toBe('heart')
    expect(regionForSkinId(4)).toBe('heart')
    expect(regionForSkinId(5)).toBe('core')
    expect(regionForSkinId(8)).toBe('bones_muscle')
    expect(regionForSkinId(22)).toBe('bones_muscle')
    expect(regionForSkinId(0)).toBeNull()
  })

  it('finds a part region from its own name first, then its ancestors', () => {
    expect(regionForPart(['ORG_Heart_LeftVentricle', 'ORG_Heart'])).toBe(
      'heart',
    )
    expect(regionForPart(['ORG_Lung_L_SuperiorLobe'])).toBe('whole_body')
    expect(regionForPart(['MUSCLE_Diaphragm', 'SYSTEM_Respiratory'])).toBe(
      'whole_body',
    )
    expect(regionForPart(['BONE_Femur_L', 'SYSTEM_Skeletal'])).toBe(
      'bones_muscle',
    )
    expect(regionForPart(['ORG_Pancreas'])).toBe('core')
    expect(regionForPart(['BODY_Eye_L'])).toBe('eyes')
    expect(regionForPart(['LYMPH_Vessels', 'SYSTEM_Lymphatic'])).toBeNull()
  })

  it('zones a mannequin by height and distance from the midline', () => {
    const h = 1.75
    expect(zoneForPoint(0, 1.65, h)).toBe('head')
    expect(zoneForPoint(0.05, 1.35, h)).toBe('heart')
    expect(zoneForPoint(0.05, 1.05, h)).toBe('core')
    expect(zoneForPoint(0.45, 1.05, h)).toBe('bones_muscle') // a hand at hip height
    expect(zoneForPoint(0.1, 0.4, h)).toBe('bones_muscle') // a shin
  })

  it('shows the skin status on every skin point when it is more serious', () => {
    expect(skinPointStatus('heart', { heart: 'good', skin: 'watch' })).toBe(
      'watch',
    )
    expect(skinPointStatus('heart', { heart: 'act', skin: 'good' })).toBe('act')
    expect(skinPointStatus(null, { skin: 'good' })).toBe('good')
    expect(skinPointStatus('core', {})).toBe('no_data')
    expect(tintStrength('no_data')).toBe(0)
    expect(tintStrength('act')).toBeGreaterThan(tintStrength('good'))
  })

  it('reads the newest reading up to now for one crew member', () => {
    const readings = [
      { crewId: 'c1', indicator: 'heart_rate', value: 60, atMs: 100 },
      { crewId: 'c1', indicator: 'heart_rate', value: 72, atMs: 200 },
      { crewId: 'c1', indicator: 'heart_rate', value: 90, atMs: 300 },
      { crewId: 'c2', indicator: 'heart_rate', value: 50, atMs: 250 },
      { crewId: 'c1', indicator: 'body_temp', value: 37, atMs: 250 },
    ]
    expect(latestValue(readings, 'c1', 'heart_rate', 250)).toBe(72)
    expect(latestValue(readings, 'c2', 'heart_rate', 250)).toBe(50)
    expect(latestValue(readings, 'c3', 'heart_rate', 250)).toBeNull()
  })

  it('beats once per period and breathes between 0 and 1', () => {
    expect(heartbeatPhase(0, 60)).toBe(0)
    expect(heartbeatPhase(0.175, 60)).toBeCloseTo(1)
    expect(heartbeatPhase(0.5, 60)).toBe(0)
    expect(heartbeatPhase(1.175, 60)).toBeCloseTo(1)
    expect(heartbeatPhase(0.0875, 120)).toBeCloseTo(1)
    expect(breathPhase(0, 12)).toBe(0)
    expect(breathPhase(2.5, 12)).toBeCloseTo(1)
  })
})
