import {
  Box3,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
  type Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  BODY_NODE,
  PATCH_NODE,
  checkNodeNames,
} from '../../../../bodyview/modelContract.ts'
import { buildPlaceholder } from '../placeholderModel.ts'
import { CONTRACT_PROFILES } from './contractProfiles.ts'

const materials = {
  body: new MeshStandardMaterial(),
  patch: new MeshStandardMaterial(),
}

function build(id: keyof typeof CONTRACT_PROFILES) {
  const entry = { id, profile: CONTRACT_PROFILES[id] }
  const root = buildPlaceholder(entry.profile, entry.id, materials)
  root.updateMatrixWorld(true)
  const node = (name: string): Object3D => {
    const found = root.getObjectByName(name)
    if (!found) throw new Error(`missing ${name}`)
    return found
  }
  return { entry, root, node }
}

const world = (object: Object3D) => object.getWorldPosition(new Vector3())

describe.each(['crew-a', 'crew-b'] as const)(
  'placeholder for %s (section 22.9)',
  (id) => {
    const { entry, root, node } = build(id)
    const height = entry.profile.heightCm / 100
    const bodyBox = new Box3().setFromObject(node(BODY_NODE), true)

    it('is named after the model and has every contract node', () => {
      const names: string[] = []
      root.traverse((child) => names.push(child.name))
      expect(root.name).toBe(entry.id)
      expect(checkNodeNames(names)).toEqual({ outcome: 'accept', missing: [] })
    })

    it('is exactly the profile height, stands on y = 0 and is centered on x = 0', () => {
      expect(bodyBox.max.y).toBeCloseTo(height, 3)
      expect(bodyBox.min.y).toBeCloseTo(0, 3)
      expect((bodyBox.min.x + bodyBox.max.x) / 2).toBeCloseTo(0, 3)
    })

    it('has the right shoulder patch on the right side (negative x), high up', () => {
      const patchBox = new Box3().setFromObject(node(PATCH_NODE), true)
      const center = patchBox.getCenter(new Vector3())
      expect(center.x).toBeLessThan(0)
      expect(center.y).toBeGreaterThan(0.65 * height)
      expect(patchBox.max.x - patchBox.min.x).toBeGreaterThan(0)
      expect(
        Math.max(
          patchBox.max.y - patchBox.min.y,
          patchBox.max.z - patchBox.min.z,
        ),
      ).toBeGreaterThanOrEqual(0.06)
    })

    it('faces +Z: the chest anchor is in front of the back anchor; the left forearm is at positive x', () => {
      expect(world(node('sensor_chest')).z).toBeGreaterThan(
        world(node('sensor_upper_back')).z,
      )
      expect(world(node('sensor_forearm_l')).x).toBeGreaterThan(0)
    })

    it('puts each sensor anchor on the surface', () => {
      for (const name of [
        'sensor_chest',
        'sensor_upper_back',
        'sensor_forearm_l',
      ]) {
        const target = world(node(name))
        const outward = new Vector3(target.x, 0, target.z).normalize()
        const origin = target.clone().addScaledVector(outward, 1)
        const ray = new Raycaster(origin, outward.clone().negate())
        const [hit] = ray.intersectObject(node(BODY_NODE), true)
        expect(hit?.point.distanceTo(target) ?? 1, name).toBeLessThan(0.002)
      }
    })
  },
)

describe('the two placeholders', () => {
  it('differ as their profiles do: crew A has the broader shoulders', () => {
    const a = new Box3().setFromObject(build('crew-a').node(PATCH_NODE), true)
    const b = new Box3().setFromObject(build('crew-b').node(PATCH_NODE), true)
    expect(a.min.x).toBeLessThan(b.min.x)
  })
})
