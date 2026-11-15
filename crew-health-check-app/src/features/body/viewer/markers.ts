import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three'
import { sensorSiteIdSchema } from '../../../bodyview/schemas.ts'
import type { PinAnchor, SensorSiteId } from '../../../bodyview/types.ts'
import type { ViewerColors } from './colors.ts'

// Pins and sensor markers (section 22.8). They are children of the model
// root at their local positions, so they stay on the body however the view
// or the model turns. Each is pushed 3 mm out along the surface normal.

const PIN_RADIUS_M = 0.012
const SENSOR_RADIUS_M = 0.015
const LIFT_M = 0.003
const SELECTED_SCALE = 1.6
const GROUP_NAME = 'markers'

export type MarkerInfo =
  { kind: 'pin'; reportId: string } | { kind: 'sensor'; site: SensorSiteId }

export interface MarkerSet {
  /** Replaces every marker under the root. */
  update(
    root: Object3D,
    pins: readonly { id: string; anchor: PinAnchor }[],
    sensors: readonly {
      site: SensorSiteId
      anchor: Object3D
      contactLost: boolean
    }[],
    selection: { reportId: string | null; site: SensorSiteId | null },
  ): void
  /** Every marker mesh, for picking. */
  meshes(): Mesh[]
  dispose(): void
}

export function markerInfo(object: Object3D): MarkerInfo | null {
  const info: unknown = object.userData.marker
  if (typeof info !== 'object' || info === null) return null
  if ('reportId' in info && typeof info.reportId === 'string') {
    return { kind: 'pin', reportId: info.reportId }
  }
  if ('site' in info) {
    const site = sensorSiteIdSchema.safeParse(info.site)
    return site.success ? { kind: 'sensor', site: site.data } : null
  }
  return null
}

/**
 * The direction a sensor marker is lifted along. Contract anchors carry no
 * normal, so it points away from the body's vertical midline at that height.
 */
function sensorLift(position: Vector3): Vector3 {
  const away = new Vector3(position.x, 0, position.z)
  return away.lengthSq() > 0 ? away.normalize() : new Vector3(0, 0, 1)
}

export function createMarkerSet(colors: ViewerColors): MarkerSet {
  const pinGeometry = new SphereGeometry(PIN_RADIUS_M, 16, 12)
  const sensorGeometry = new SphereGeometry(SENSOR_RADIUS_M, 16, 12)
  const material = (color: ViewerColors['pin']) =>
    new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 })
  const materials = {
    pin: material(colors.pin),
    selected: material(colors.pinSelected),
    sensor: material(colors.sensor),
    sensorLost: material(colors.sensorLost),
  }
  let group: Group | null = null

  return {
    update(root, pins, sensors, selection) {
      group?.removeFromParent()
      group = new Group()
      group.name = GROUP_NAME
      for (const { id, anchor } of pins) {
        const selected = selection.reportId === id
        const mesh = new Mesh(
          pinGeometry,
          selected ? materials.selected : materials.pin,
        )
        const normal = new Vector3(...anchor.normal).normalize()
        mesh.position.set(...anchor.point).addScaledVector(normal, LIFT_M)
        mesh.scale.setScalar(selected ? SELECTED_SCALE : 1)
        mesh.userData.marker = {
          kind: 'pin',
          reportId: id,
        } satisfies MarkerInfo
        group.add(mesh)
      }
      root.updateWorldMatrix(true, true)
      for (const { site, anchor, contactLost } of sensors) {
        const selected = selection.site === site
        const local = root.worldToLocal(anchor.getWorldPosition(new Vector3()))
        const mesh = new Mesh(
          sensorGeometry,
          selected
            ? materials.selected
            : contactLost
              ? materials.sensorLost
              : materials.sensor,
        )
        mesh.position.copy(local).addScaledVector(sensorLift(local), LIFT_M)
        mesh.scale.setScalar(selected ? SELECTED_SCALE : 1)
        mesh.userData.marker = { kind: 'sensor', site } satisfies MarkerInfo
        group.add(mesh)
      }
      root.add(group)
    },
    meshes() {
      return (group?.children ?? []).filter(
        (child): child is Mesh => child instanceof Mesh,
      )
    },
    dispose() {
      group?.removeFromParent()
      group = null
      pinGeometry.dispose()
      sensorGeometry.dispose()
      for (const entry of Object.values(materials)) entry.dispose()
    },
  }
}
