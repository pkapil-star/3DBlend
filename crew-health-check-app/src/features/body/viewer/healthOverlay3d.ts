import {
  Box3,
  BufferAttribute,
  Color,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import {
  regionForPart,
  regionForSkinId,
  skinPointStatus,
  tintStrength,
  zoneForPoint,
  type OverlayRegion,
  type OverlayStatus,
} from '../../../bodyview/healthOverlay.ts'
import type { ViewerColors } from './colors.ts'
import type { LoadedModel } from './loadModel.ts'

// The health status overlay (section 22.12) on a loaded body: skin vertices
// take their region's status colour, and inner parts of an anatomical model
// switch to a status material. Turning it off restores the file's look.

export type RegionStatuses = Partial<Record<OverlayRegion, OverlayStatus>>

export interface HealthOverlay {
  apply(statuses: RegionStatuses, on: boolean): void
  /** The region a picked mesh (and, on the skin, a vertex) belongs to. */
  regionOf(object: Object3D, vertex: number | null): OverlayRegion | null
  dispose(): void
}

interface SkinEntry {
  mesh: Mesh
  zones: (OverlayRegion | null)[]
  color: BufferAttribute
}

interface PartEntry {
  mesh: Mesh
  original: Material | Material[]
  region: OverlayRegion
}

/** The node's own name, then each ancestor's, up to (not including) the root. */
export function namesUpward(node: Object3D, root: Object3D): string[] {
  const names: string[] = []
  for (
    let current: Object3D | null = node;
    current && current !== root;
    current = current.parent
  ) {
    names.push(current.name)
  }
  return names
}

function skinZones(mesh: Mesh, box: Box3): (OverlayRegion | null)[] {
  const position = mesh.geometry.getAttribute('position')
  const ids = mesh.geometry.getAttribute('_region_id')
  const eye = mesh.name.startsWith('BODY_Eye_')
  const height = box.max.y - box.min.y
  const centreX = (box.min.x + box.max.x) / 2
  const point = new Vector3()
  const zones: (OverlayRegion | null)[] = []
  for (let i = 0; i < position.count; i++) {
    if (eye) zones.push('eyes')
    else if (ids) zones.push(regionForSkinId(Math.round(ids.getX(i))))
    else {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      zones.push(zoneForPoint(point.x - centreX, point.y - box.min.y, height))
    }
  }
  return zones
}

export function createHealthOverlay(
  model: LoadedModel,
  colors: ViewerColors,
): HealthOverlay {
  model.root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(model.body)
  const skin: SkinEntry[] = model.surfaceMeshes.map((mesh) => {
    const count = mesh.geometry.getAttribute('position').count
    return {
      mesh,
      zones: skinZones(mesh, box),
      color: new BufferAttribute(new Float32Array(count * 3), 3),
    }
  })
  const skinSet = new Set<Object3D>(model.surfaceMeshes)
  const parts: PartEntry[] = []
  model.root.traverse((node) => {
    if (!(node instanceof Mesh) || skinSet.has(node) || node === model.patch)
      return
    const region = regionForPart(namesUpward(node, model.root))
    if (region) parts.push({ mesh: node, original: node.material, region })
  })
  const partRegion = new Map(
    parts.map((part) => [part.mesh as Object3D, part.region]),
  )

  const statusColor: Record<OverlayStatus, Color> = {
    good: colors.statusGood,
    watch: colors.statusWatch,
    act: colors.statusAct,
    no_data: colors.surface,
  }
  const statusMaterial = (color: Color) =>
    new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.6,
      metalness: 0,
    })
  const materials = {
    good: statusMaterial(colors.statusGood),
    watch: statusMaterial(colors.statusWatch),
    act: statusMaterial(colors.statusAct),
  }

  function apply(statuses: RegionStatuses, on: boolean) {
    const body = model.bodyMaterial
    body.vertexColors = on
    // With vertex colours on, the material colour is a neutral multiplier and
    // the vertex colour carries the gray (or tinted) surface.
    if (on) body.color.setRGB(1, 1, 1)
    else body.color.copy(colors.surface)
    body.needsUpdate = true
    if (on) {
      const tinted = new Map<OverlayRegion | null, Color>()
      for (const entry of skin) {
        const array = entry.color.array as Float32Array
        entry.zones.forEach((zone, i) => {
          let color = tinted.get(zone)
          if (!color) {
            const status = skinPointStatus(zone, statuses)
            color = colors.surface
              .clone()
              .lerp(statusColor[status], tintStrength(status))
            tinted.set(zone, color)
          }
          array[i * 3] = color.r
          array[i * 3 + 1] = color.g
          array[i * 3 + 2] = color.b
        })
        entry.color.needsUpdate = true
        entry.mesh.geometry.setAttribute('color', entry.color)
      }
    }
    for (const part of parts) {
      const status = statuses[part.region]
      part.mesh.material =
        on && status && status !== 'no_data' ? materials[status] : part.original
    }
  }

  return {
    apply,
    regionOf(object, vertex) {
      const own = partRegion.get(object)
      if (own) return own
      const entry = skin.find((candidate) => candidate.mesh === object)
      return entry && vertex !== null ? (entry.zones[vertex] ?? null) : null
    },
    dispose() {
      for (const part of parts) part.mesh.material = part.original
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
