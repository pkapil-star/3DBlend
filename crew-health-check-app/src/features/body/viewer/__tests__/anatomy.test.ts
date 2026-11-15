import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import type { BodyModelEntry } from '../../../../bodyview/types.ts'
import { bodyModels, sensorSites } from '../../../../data/bodyView.ts'
import { prepareModel } from '../loadModel.ts'

// A small stand-in for a delivered anatomical model (section 23.12): its own
// node names, layer group nodes, a hidden helper group holding the shoulder
// overlay, sensor anchors and an inner mesh with a shape key.

function mesh(name: string, material = new MeshStandardMaterial()) {
  const node = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), material)
  node.name = name
  return node
}

function anatomicalFile() {
  const root = new Group()
  root.name = 'crew-a'
  const top = new Group()
  top.name = 'ROOT_CrewHealthCheck'
  root.add(top)
  const external = new Group()
  external.name = 'SYSTEM_ExternalBody'
  external.add(mesh('BODY_Skin'), mesh('BODY_Eye_L'))
  const skeleton = new Group()
  skeleton.name = 'SYSTEM_Skeletal'
  const boneMaterial = new MeshStandardMaterial()
  boneMaterial.name = 'MAT_Skeleton_Base'
  skeleton.add(mesh('BONE_Femur_L', boneMaterial))
  const heart = new Group()
  heart.name = 'SYSTEM_Cardiovascular'
  const beating = mesh('ORG_Heart_LeftVentricle')
  beating.morphTargetInfluences = [1]
  heart.add(beating)
  const regions = new Group()
  regions.name = 'GROUP_BodyRegions'
  regions.userData.default_visible = false
  const overlay = mesh('REGION_SHOULDER_RIGHT_DELTOID')
  overlay.userData.default_visible = false
  const otherRegion = mesh('REGION_KNEE_LEFT')
  otherRegion.userData.default_visible = false
  regions.add(overlay, otherRegion)
  const anchors = new Group()
  anchors.name = 'GROUP_SensorAnchors'
  for (const name of [
    'ANCHOR_SENSOR_CHEST',
    'ANCHOR_SENSOR_UPPER_BACK',
    'ANCHOR_SENSOR_LEFT_FOREARM',
  ]) {
    const anchor = new Object3D()
    anchor.name = name
    anchors.add(anchor)
  }
  top.add(external, skeleton, heart, regions, anchors)
  return { root, boneMaterial, beating, overlay, otherRegion, regions }
}

const placeholder = bodyModels[0]
if (!placeholder) throw new Error('no model')
const entry: BodyModelEntry = {
  ...placeholder,
  status: 'delivered',
  file: 'models/crew-a.glb',
  version: 'test-anatomy',
  profileSource: 'measured',
  nodeMap: {
    body: 'BODY_Skin',
    patch_shoulder_r_outer: 'REGION_SHOULDER_RIGHT_DELTOID',
    sensor_chest: 'ANCHOR_SENSOR_CHEST',
    sensor_upper_back: 'ANCHOR_SENSOR_UPPER_BACK',
    sensor_forearm_l: 'ANCHOR_SENSOR_LEFT_FOREARM',
  },
  layers: [
    {
      id: 'skin',
      label: 'Skin',
      node: 'SYSTEM_ExternalBody',
      defaultVisible: true,
    },
    {
      id: 'skeleton',
      label: 'Skeleton',
      node: 'SYSTEM_Skeletal',
      defaultVisible: false,
    },
    {
      id: 'heart_vessels',
      label: 'Heart and blood vessels',
      node: 'SYSTEM_Cardiovascular',
      defaultVisible: false,
    },
    {
      id: 'missing',
      label: 'Not in the file',
      node: 'SYSTEM_Nowhere',
      defaultVisible: false,
    },
  ],
}

function load() {
  const file = anatomicalFile()
  const materials = {
    body: new MeshStandardMaterial({ color: new Color().setScalar(0.6) }),
    patch: new MeshStandardMaterial({ transparent: true, opacity: 0 }),
  }
  const loaded = prepareModel(entry, file.root, materials, sensorSites.sites)
  return { ...file, loaded, materials }
}

describe('a delivered anatomical model (section 23.12)', () => {
  it('finds every contract role through the node map', () => {
    const { loaded } = load()
    expect(loaded.contract).toEqual({ outcome: 'accept', missing: [] })
    expect(loaded.body.name).toBe('BODY_Skin')
    expect(loaded.patch?.name).toBe('REGION_SHOULDER_RIGHT_DELTOID')
    expect([...loaded.anchors.keys()]).toEqual([
      'chest',
      'upper_back',
      'forearm_l',
    ])
  })

  it('keeps every layer, shows only the skin at first and skips a layer the file lacks', () => {
    const { loaded } = load()
    expect(loaded.layers).toEqual([
      { id: 'skin', label: 'Skin', surface: true, visible: true },
      { id: 'skeleton', label: 'Skeleton', surface: false, visible: false },
      {
        id: 'heart_vessels',
        label: 'Heart and blood vessels',
        surface: false,
        visible: false,
      },
    ])
  })

  it('paints only the skin layer gray and keeps the inner layers’ own materials', () => {
    const { loaded, materials, boneMaterial } = load()
    const skin = loaded.root.getObjectByName('BODY_Skin')
    const eye = loaded.root.getObjectByName('BODY_Eye_L')
    const bone = loaded.root.getObjectByName('BONE_Femur_L')
    expect(skin instanceof Mesh && skin.material).toBe(materials.body)
    expect(eye instanceof Mesh && eye.material).toBe(materials.body)
    expect(bone instanceof Mesh && bone.material).toBe(boneMaterial)
  })

  it('keeps shape keys at rest, so the surface under a pin never moves', () => {
    const { beating } = load()
    expect(beating.morphTargetInfluences).toEqual([0])
  })

  it('keeps hidden helpers hidden but the shoulder patch, and its group, drawn for taps', () => {
    const { overlay, otherRegion, regions } = load()
    expect(overlay.visible).toBe(true)
    expect(regions.visible).toBe(true)
    expect(otherRegion.visible).toBe(false)
  })

  it('makes the skin see-through while an inner layer is shown', () => {
    const { loaded, materials } = load()
    expect(materials.body.transparent).toBe(false)
    loaded.setLayerVisible('skeleton', true)
    expect(materials.body.transparent).toBe(true)
    expect(materials.body.opacity).toBeCloseTo(0.25)
    loaded.setLayerVisible('skeleton', false)
    expect(materials.body.opacity).toBe(1)
  })

  it('allows pins only while the skin is shown', () => {
    const { loaded } = load()
    expect(loaded.surfacePickable()).toBe(true)
    loaded.setLayerVisible('skin', false)
    expect(loaded.surfacePickable()).toBe(false)
    expect(loaded.layers.find((layer) => layer.id === 'skin')?.visible).toBe(
      false,
    )
  })

  it('rejects a file whose mapped body surface is missing', () => {
    const file = anatomicalFile()
    file.root.getObjectByName('BODY_Skin')?.removeFromParent()
    const materials = {
      body: new MeshStandardMaterial(),
      patch: new MeshStandardMaterial(),
    }
    expect(() =>
      prepareModel(entry, file.root, materials, sensorSites.sites),
    ).toThrow('The model has no body surface')
  })
})
