import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { bodyModels, sensorSites } from '../../../../data/bodyView.ts'
import { prepareModel } from '../loadModel.ts'

// The behaviour checks of section 23.12 on every delivered anatomical model
// whose file is present. On a tree without a delivered model there is nothing
// to check; the structure checks are in tools/check_body_model.py.

const DEFAULT_VIEW_MAX_TRIANGLES = 150_000
const anatomical = bodyModels.filter(
  (model) => model.status === 'delivered' && model.layers && model.file,
)

async function parse(file: string): Promise<Group> {
  const bytes = readFileSync(join(process.cwd(), 'public', file))
  // A copy made in this realm: jsdom and Node each have their own
  // ArrayBuffer, and GLTFLoader checks for this realm's.
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const root = new Group()
  root.add(gltf.scene)
  return root
}

function triangles(object: Object3D): number {
  let count = 0
  object.traverseVisible((node) => {
    if (node instanceof Mesh) {
      const geometry = node.geometry
      count +=
        (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3
    }
  })
  return count
}

describe('delivered anatomical models', () => {
  it('are listed only with their file present', () => {
    for (const model of anatomical) {
      expect(existsSync(join(process.cwd(), 'public', model.file ?? ''))).toBe(
        true,
      )
    }
  })

  it.each(anatomical.map((model) => [model.id, model] as const))(
    '%s: scale, layers, patch, anchors and picking behave as the app needs',
    async (_id, model) => {
      const root = await parse(model.file ?? '')
      root.name = model.id
      const loaded = prepareModel(
        model,
        root,
        { body: new MeshStandardMaterial(), patch: new MeshStandardMaterial() },
        sensorSites.sites,
      )
      root.updateMatrixWorld(true)
      expect(loaded.contract.outcome).toBe('accept')
      expect(loaded.layers.length).toBe(model.layers?.length)
      expect(loaded.layers.filter((layer) => layer.surface)).toHaveLength(1)

      const skinBox = new Box3().setFromObject(loaded.body)
      expect(skinBox.max.y - skinBox.min.y).toBeCloseTo(
        model.profile.heightCm / 100,
        2,
      )
      expect(Math.abs(skinBox.min.y)).toBeLessThan(0.01)
      expect(triangles(root)).toBeLessThanOrEqual(DEFAULT_VIEW_MAX_TRIANGLES)

      // A tap at the middle of the shoulder patch hits the patch before the skin.
      const patch = loaded.patch
      if (!patch) throw new Error('no patch')
      const center = new Box3().setFromObject(patch).getCenter(new Vector3())
      const from = center.clone().add(new Vector3(-1, 0.1, 0.2))
      const hits = new Raycaster(
        from,
        center.clone().sub(from).normalize(),
      ).intersectObjects([loaded.body, patch], true)
      expect(hits[0]?.object).toBe(patch)

      // Each anchor lies on the skin, within 2 mm.
      for (const anchor of loaded.anchors.values()) {
        const point = anchor.getWorldPosition(new Vector3())
        const outward = new Vector3(point.x, 0, point.z).normalize()
        const ray = new Raycaster(
          point.clone().addScaledVector(outward, 0.3),
          outward.clone().negate(),
        )
        const [hit] = ray.intersectObject(loaded.body, true)
        expect(hit?.point.distanceTo(point) ?? 1).toBeLessThan(0.002)
      }

      // Shape keys rest at zero; hiding the skin stops pins.
      root.traverse((node) => {
        if (node instanceof Mesh && node.morphTargetInfluences) {
          expect(node.morphTargetInfluences.every((value) => value === 0)).toBe(
            true,
          )
        }
      })
      const skin = loaded.layers.find((layer) => layer.surface)
      loaded.setLayerVisible(skin?.id ?? '', false)
      expect(loaded.surfacePickable()).toBe(false)
      loaded.dispose()
    },
    60_000,
  )
})
