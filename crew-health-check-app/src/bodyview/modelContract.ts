// The body model contract on the app side (ARCHITECTURE.md sections 22.10
// and 23.9). A model without `body` is rejected; a missing patch or sensor
// anchor only switches off that feature.

import type { NodeMap } from './types.ts'

export const BODY_NODE = 'body'
export const PATCH_NODE = 'patch_shoulder_r_outer'
export const SENSOR_NODES = [
  'sensor_chest',
  'sensor_upper_back',
  'sensor_forearm_l',
] as const

export type ContractRole = keyof NodeMap

/** The contract's own names: what a file without a node map must use. */
export const CONTRACT_NAMES: NodeMap = {
  body: BODY_NODE,
  patch_shoulder_r_outer: PATCH_NODE,
  sensor_chest: 'sensor_chest',
  sensor_upper_back: 'sensor_upper_back',
  sensor_forearm_l: 'sensor_forearm_l',
}

export function isContractRole(name: string): name is ContractRole {
  return name in CONTRACT_NAMES
}

export type ContractOutcome = 'accept' | 'degrade' | 'reject'

export interface ContractResult {
  outcome: ContractOutcome
  /** Required node names the model does not have, in contract order. */
  missing: string[]
}

/**
 * Checks that every contract role is present, under the file's own name when
 * a node map gives one. `missing` lists the roles, in contract order.
 */
export function checkNodeNames(
  names: Iterable<string>,
  nodeMap: NodeMap = CONTRACT_NAMES,
): ContractResult {
  const present = new Set(names)
  const roles: ContractRole[] = [BODY_NODE, PATCH_NODE, ...SENSOR_NODES]
  const missing = roles.filter((role) => !present.has(nodeMap[role]))
  if (missing.includes(BODY_NODE)) return { outcome: 'reject', missing }
  return { outcome: missing.length === 0 ? 'accept' : 'degrade', missing }
}

/** One line for people: "All required parts found" or what is missing. */
export function contractSummary(result: ContractResult): string {
  if (result.outcome === 'accept') return 'All required parts found'
  const list = result.missing.join(', ')
  return result.outcome === 'reject'
    ? `Rejected: no ${BODY_NODE} node (missing: ${list})`
    : `Usable with fewer features (missing: ${list})`
}

const GLB_MAGIC = 0x46546c67 // "glTF"
const JSON_CHUNK = 0x4e4f534a // "JSON"

/**
 * The JSON part of a binary glTF file (glTF 2.0, section 4.4 of the
 * specification): a 12-byte header, then a JSON chunk. Throws on anything
 * that is not a GLB, so a broken file can never half-load.
 */
export function readGlbJson(buffer: ArrayBuffer): unknown {
  if (buffer.byteLength < 20) throw new Error('Too short to be a GLB file')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file')
  if (view.getUint32(4, true) !== 2) throw new Error('Not glTF version 2')
  const chunkLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== JSON_CHUNK) {
    throw new Error('The first chunk is not JSON')
  }
  if (20 + chunkLength > buffer.byteLength) {
    throw new Error('The JSON chunk is cut off')
  }
  const text = new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength))
  return JSON.parse(text)
}

/** Node names in a parsed glTF document; an unexpected shape gives none. */
export function gltfNodeNames(gltf: unknown): string[] {
  if (typeof gltf !== 'object' || gltf === null || !('nodes' in gltf)) return []
  const nodes = gltf.nodes
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node: unknown) =>
    typeof node === 'object' &&
    node !== null &&
    'name' in node &&
    typeof node.name === 'string'
      ? [node.name]
      : [],
  )
}
