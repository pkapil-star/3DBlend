import { Mesh, type Object3D } from 'three'

// Shape keys of the anatomical model (3DBlend docs/INTEGRATION_THREEJS.md):
// visual animation controls only. They encode no physiology.

export type MorphName =
  'Heart_Contract' | 'Lungs_Inhale' | 'Lungs_Exhale' | 'Profile_B'

export interface BodyMorphs {
  has(name: MorphName): boolean
  set(name: MorphName, value: number): void
}

export function findMorphs(root: Object3D): BodyMorphs {
  const targets = new Map<MorphName, { mesh: Mesh; index: number }[]>()
  root.traverse((node) => {
    if (!(node instanceof Mesh) || !node.morphTargetDictionary) return
    for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
      const key = name as MorphName
      targets.set(key, [...(targets.get(key) ?? []), { mesh: node, index }])
    }
  })
  return {
    has: (name) => (targets.get(name)?.length ?? 0) > 0,
    set(name, value) {
      for (const { mesh, index } of targets.get(name) ?? []) {
        if (mesh.morphTargetInfluences)
          mesh.morphTargetInfluences[index] = value
      }
    },
  }
}
