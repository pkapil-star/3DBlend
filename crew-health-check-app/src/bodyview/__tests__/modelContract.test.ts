import { describe, expect, it } from 'vitest'
import {
  checkNodeNames,
  contractSummary,
  gltfNodeNames,
  readGlbJson,
} from '../modelContract.ts'

const ALL = [
  'body',
  'patch_shoulder_r_outer',
  'sensor_chest',
  'sensor_upper_back',
  'sensor_forearm_l',
]

/** A tiny GLB built in the test: header and JSON chunk. */
function glb(
  document: unknown,
  { version = 2, magic = 'glTF' } = {},
): ArrayBuffer {
  let json = new TextEncoder().encode(JSON.stringify(document))
  const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20)
  padded.set(json)
  json = padded
  const buffer = new ArrayBuffer(20 + json.length)
  const view = new DataView(buffer)
  for (let index = 0; index < 4; index++) {
    view.setUint8(index, magic.charCodeAt(index))
  }
  view.setUint32(4, version, true)
  view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, json.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buffer, 20).set(json)
  return buffer
}

describe('checkNodeNames (section 23.9)', () => {
  it('accepts a model with every required node', () => {
    expect(checkNodeNames([...ALL, 'extra'])).toEqual({
      outcome: 'accept',
      missing: [],
    })
  })

  it('degrades when the patch or an anchor is missing', () => {
    const result = checkNodeNames(['body', 'sensor_chest'])
    expect(result).toEqual({
      outcome: 'degrade',
      missing: [
        'patch_shoulder_r_outer',
        'sensor_upper_back',
        'sensor_forearm_l',
      ],
    })
    expect(contractSummary(result)).toBe(
      'Usable with fewer features (missing: patch_shoulder_r_outer, sensor_upper_back, sensor_forearm_l)',
    )
  })

  it('rejects a model without body, whatever else it has', () => {
    const result = checkNodeNames(['BODY_Skin', ...ALL.slice(1)])
    expect(result.outcome).toBe('reject')
    expect(contractSummary(result)).toBe(
      'Rejected: no body node (missing: body)',
    )
  })
})

describe('readGlbJson', () => {
  it('reads the JSON chunk of a GLB built in the test', () => {
    const document = {
      asset: { version: '2.0' },
      nodes: ALL.map((name) => ({ name })),
    }
    const parsed = readGlbJson(glb(document))
    expect(parsed).toEqual(document)
    expect(checkNodeNames(gltfNodeNames(parsed)).outcome).toBe('accept')
  })

  it('refuses what is not a glTF 2 binary', () => {
    expect(() => readGlbJson(new ArrayBuffer(8))).toThrow('Too short')
    expect(() => readGlbJson(glb({}, { magic: 'nope' }))).toThrow(
      'Not a GLB file',
    )
    expect(() => readGlbJson(glb({}, { version: 1 }))).toThrow(
      'Not glTF version 2',
    )
  })

  it('finds no names in an unexpected document', () => {
    expect(gltfNodeNames(null)).toEqual([])
    expect(gltfNodeNames({ nodes: 'x' })).toEqual([])
    expect(gltfNodeNames({ nodes: [{ name: 3 }, { name: 'body' }] })).toEqual([
      'body',
    ])
  })
})
