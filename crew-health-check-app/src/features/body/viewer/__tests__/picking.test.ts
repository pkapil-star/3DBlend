import { Box3, Color, MeshStandardMaterial, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BODY_NODE, PATCH_NODE } from '../../../../bodyview/modelContract.ts'
import type { PinAnchor } from '../../../../bodyview/types.ts'
import type { ViewerColors } from '../colors.ts'
import { createMarkerSet, markerInfo } from '../markers.ts'
import { isTap, pickResultFromHit } from '../picking.ts'
import { buildPlaceholder } from '../placeholderModel.ts'
import { CONTRACT_PROFILES } from './contractProfiles.ts'

function model() {
  const root = buildPlaceholder(CONTRACT_PROFILES['crew-a'], 'crew-a', {
    body: new MeshStandardMaterial(),
    patch: new MeshStandardMaterial(),
  })
  root.updateMatrixWorld(true)
  const body = root.getObjectByName(BODY_NODE)
  const patch = root.getObjectByName(PATCH_NODE)
  if (!body || !patch) throw new Error('contract nodes missing')
  return { root, body, patch }
}

function castAt(
  target: Vector3,
  from: Vector3,
  objects: Parameters<Raycaster['intersectObjects']>[0],
) {
  const direction = target.clone().sub(from).normalize()
  return new Raycaster(from, direction).intersectObjects(objects, true)[0]
}

describe('isTap (section 22.8)', () => {
  const down = { x: 100, y: 100, timeStamp: 1000 }
  it('is a tap within 6 px and 500 ms, a drag otherwise', () => {
    expect(isTap(down, { x: 104, y: 104, timeStamp: 1500 })).toBe(true)
    expect(isTap(down, { x: 107, y: 100, timeStamp: 1100 })).toBe(false)
    expect(isTap(down, { x: 100, y: 100, timeStamp: 1501 })).toBe(false)
  })
})

describe('pickResultFromHit', () => {
  it('names the patch for a tap on the right outer shoulder', () => {
    const { root, body, patch } = model()
    const center = new Box3()
      .setFromObject(patch, true)
      .getCenter(new Vector3())
    const hit = castAt(center, center.clone().add(new Vector3(-1, 0.2, 0.3)), [
      body,
      patch,
    ])
    if (!hit) throw new Error('no hit')
    const pick = pickResultFromHit(hit, root, patch)
    expect(pick.target).toBe('patch_shoulder_r_outer')
    expect(pick.point[0]).toBeLessThan(0)
    expect(Math.hypot(...pick.normal)).toBeCloseTo(1, 3)
  })

  it('gives a free pin on the body for a tap on the left calf', () => {
    const { root, body, patch } = model()
    const target = new Vector3(0.1, 0.3, 0)
    const hit = castAt(target, new Vector3(0.1, 0.3, 2), [body, patch])
    if (!hit) throw new Error('no hit')
    const pick = pickResultFromHit(hit, root, patch)
    expect(pick.target).toBe('body')
    expect(pick.point[0]).toBeGreaterThan(0)
    expect(pick.point[1]).toBeCloseTo(0.3, 2)
    expect(pick.normal[2]).toBeGreaterThan(0.5)
  })

  it('stores the same local point however the model is turned', () => {
    const { root, body, patch } = model()
    const from = new Vector3(0.1, 0.3, 2)
    const before = pickResultFromHit(
      castAt(new Vector3(0.1, 0.3, 0), from, [body, patch]) ?? fail(),
      root,
      patch,
    )
    root.rotation.y = Math.PI / 3
    root.position.set(0.4, 0, -0.2)
    root.updateMatrixWorld(true)
    const worldPoint = root.localToWorld(new Vector3(...before.point))
    const outside = worldPoint
      .clone()
      .add(
        new Vector3(...before.normal)
          .transformDirection(root.matrixWorld)
          .multiplyScalar(1),
      )
    const after = pickResultFromHit(
      castAt(worldPoint, outside, [body, patch]) ?? fail(),
      root,
      patch,
    )
    after.point.forEach((value, axis) =>
      expect(value).toBeCloseTo(before.point[axis] ?? Number.NaN, 3),
    )
  })
})

function fail(): never {
  throw new Error('no hit')
}

describe('markers (section 22.8)', () => {
  const colors: ViewerColors = {
    background: new Color(),
    surface: new Color(),
    patch: new Color(),
    pin: new Color().setScalar(0.2),
    pinSelected: new Color().setScalar(0.4),
    sensor: new Color().setScalar(0.6),
    sensorLost: new Color().setScalar(0.8),
    statusGood: new Color(),
    statusWatch: new Color(),
    statusAct: new Color(),
  }
  const anchor: PinAnchor = {
    modelId: 'crew-a',
    modelVersion: 'placeholder-1',
    target: 'body',
    point: [0.1, 0.3, 0.05],
    normal: [0, 0, 1],
  }

  it('keeps a pin on the body when the model turns', () => {
    const { root } = model()
    const markers = createMarkerSet(colors)
    const chest = root.getObjectByName('sensor_chest') ?? fail()
    markers.update(
      root,
      [{ id: 'r1', anchor }],
      [{ site: 'chest', anchor: chest, contactLost: false }],
      {
        reportId: null,
        site: null,
      },
    )
    const pin =
      markers.meshes().find((mesh) => markerInfo(mesh)?.kind === 'pin') ??
      fail()
    const local = new Vector3(0.1, 0.3, 0.053)
    expect(pin.parent?.parent).toBe(root)
    root.rotation.set(0.3, 1.2, 0)
    root.position.set(1, 2, 3)
    root.updateMatrixWorld(true)
    const expected = root.localToWorld(local.clone())
    expect(
      pin.getWorldPosition(new Vector3()).distanceTo(expected),
    ).toBeLessThan(1e-9)
    markers.dispose()
  })

  it('enlarges and recolours the selected marker and greys a lost sensor', () => {
    const { root } = model()
    const markers = createMarkerSet(colors)
    const chest = root.getObjectByName('sensor_chest') ?? fail()
    const forearm = root.getObjectByName('sensor_forearm_l') ?? fail()
    markers.update(
      root,
      [{ id: 'r1', anchor }],
      [
        { site: 'chest', anchor: chest, contactLost: false },
        { site: 'forearm_l', anchor: forearm, contactLost: true },
      ],
      { reportId: 'r1', site: null },
    )
    const [pin, chestMarker, forearmMarker] = markers.meshes()
    expect(pin?.scale.x).toBeCloseTo(1.6)
    expect(markerInfo(chestMarker ?? fail())).toEqual({
      kind: 'sensor',
      site: 'chest',
    })
    expect(chestMarker?.material).not.toBe(forearmMarker?.material)
    expect(pin?.material).not.toBe(chestMarker?.material)
    markers.dispose()
  })
})
