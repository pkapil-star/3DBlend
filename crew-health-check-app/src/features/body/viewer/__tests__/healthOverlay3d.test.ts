import {
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three'
import { describe, expect, it } from 'vitest'
import { bodyModels, sensorSites } from '../../../../data/bodyView.ts'
import type { ViewerColors } from '../colors.ts'
import { createHealthOverlay } from '../healthOverlay3d.ts'
import { prepareModel } from '../loadModel.ts'
import { buildPlaceholder } from '../placeholderModel.ts'

const colors: ViewerColors = {
  background: new Color(),
  surface: new Color(0.5, 0.5, 0.5),
  patch: new Color(),
  pin: new Color(),
  pinSelected: new Color(),
  sensor: new Color(),
  sensorLost: new Color(),
  statusGood: new Color(0, 1, 0),
  statusWatch: new Color(1, 1, 0),
  statusAct: new Color(1, 0, 0),
}

const materials = () => ({
  body: new MeshStandardMaterial(),
  patch: new MeshStandardMaterial(),
})

function named<T extends { name: string }>(object: T, name: string): T {
  object.name = name
  return object
}

/** A tiny anatomical model: chest skin (region 3), a heart and a lymph vessel. */
function anatomical() {
  const entry = bodyModels.find((model) => model.nodeMap?.body === 'BODY_Skin')
  if (!entry) throw new Error('no anatomical entry')
  const skinGeometry = new SphereGeometry(0.3)
  const count = skinGeometry.getAttribute('position').count
  skinGeometry.setAttribute(
    '_region_id',
    new BufferAttribute(new Float32Array(count).fill(3), 1),
  )
  const skin = named(
    new Mesh(skinGeometry, new MeshStandardMaterial()),
    'BODY_Skin',
  )
  const heartOriginal = new MeshStandardMaterial()
  const heart = named(
    new Mesh(new SphereGeometry(0.05), heartOriginal),
    'ORG_Heart',
  )
  const lymph = named(
    new Mesh(new SphereGeometry(0.05), new MeshStandardMaterial()),
    'LYMPH_ThoracicDuct',
  )
  const root = new Group()
  root.add(named(new Group(), 'SYSTEM_ExternalBody').add(skin))
  root.add(named(new Group(), 'SYSTEM_Cardiovascular').add(heart))
  root.add(named(new Group(), 'SYSTEM_Lymphatic').add(lymph))
  const model = prepareModel(entry, root, materials(), sensorSites.sites)
  return { model, skin, heart, heartOriginal, lymph }
}

function vertexColor(geometry: BufferGeometry, index: number): Color {
  const color = geometry.getAttribute('color')
  return new Color(color.getX(index), color.getY(index), color.getZ(index))
}

describe('health status overlay on the 3D body (section 22.12)', () => {
  it('tints the skin and the inner parts by their region, and restores them when off', () => {
    const { model, skin, heart, heartOriginal, lymph } = anatomical()
    const lymphOriginal = lymph.material
    const overlay = createHealthOverlay(model, colors)

    overlay.apply({ heart: 'act', skin: 'good' }, true)
    expect(model.bodyMaterial.vertexColors).toBe(true)
    const expected = colors.surface.clone().lerp(colors.statusAct, 0.8)
    expect(vertexColor(skin.geometry, 0).getHex()).toBe(expected.getHex())
    expect((heart.material as MeshStandardMaterial).color.getHex()).toBe(
      colors.statusAct.getHex(),
    )
    expect(lymph.material).toBe(lymphOriginal)
    expect(overlay.regionOf(heart, null)).toBe('heart')
    expect(overlay.regionOf(skin, 0)).toBe('heart')

    overlay.apply({ heart: 'no_data' }, true)
    expect(heart.material).toBe(heartOriginal)

    overlay.apply({ heart: 'act' }, false)
    expect(model.bodyMaterial.vertexColors).toBe(false)
    expect(model.bodyMaterial.color.getHex()).toBe(colors.surface.getHex())
    expect(heart.material).toBe(heartOriginal)
    overlay.dispose()
  })

  it('zones a body without region data by height: the placeholder head takes the head status', () => {
    const entry = bodyModels[0]
    if (!entry) throw new Error('no body model')
    const root = buildPlaceholder(entry.profile, entry.id, materials())
    const model = prepareModel(
      { ...entry, nodeMap: undefined, layers: undefined },
      root,
      materials(),
      sensorSites.sites,
    )
    const overlay = createHealthOverlay(model, colors)
    overlay.apply(
      { head: 'watch', heart: 'good', core: 'good', bones_muscle: 'good' },
      true,
    )
    const watch = colors.surface.clone().lerp(colors.statusWatch, 0.7).getHex()
    const good = colors.surface.clone().lerp(colors.statusGood, 0.35).getHex()
    const seen = new Set<number>()
    for (const mesh of model.surfaceMeshes) {
      const count = mesh.geometry.getAttribute('position').count
      for (let i = 0; i < count; i += 7) {
        seen.add(vertexColor(mesh.geometry, i).getHex())
      }
    }
    expect(seen.has(watch)).toBe(true)
    expect(seen.has(good)).toBe(true)
    overlay.dispose()
  })
})
