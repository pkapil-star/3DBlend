import { Matrix4, Vector3, type Intersection, type Object3D } from 'three'
import type { PinAnchor } from '../../../bodyview/types.ts'

// Taps on the body (section 22.8). A pointer down and up within 6 px and
// 500 ms is a tap; anything else is a drag that turns the view. The times are
// pointer-event timestamps: interface timing, not mission time.

export const TAP_MAX_MOVE_PX = 6
export const TAP_MAX_MS = 500

export interface PointerSample {
  x: number
  y: number
  timeStamp: number
}

export function isTap(down: PointerSample, up: PointerSample): boolean {
  const moved = Math.hypot(up.x - down.x, up.y - down.y)
  return moved <= TAP_MAX_MOVE_PX && up.timeStamp - down.timeStamp <= TAP_MAX_MS
}

export interface PickResult {
  target: PinAnchor['target']
  point: PinAnchor['point']
  normal: PinAnchor['normal']
}

function isInside(object: Object3D, ancestor: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node === ancestor) return true
  }
  return false
}

const round = (value: number) => Math.round(value * 10_000) / 10_000

/**
 * A hit as the model root's own coordinates: the point with
 * `root.worldToLocal`, the surface normal turned the same way. A hit on the
 * shoulder patch, which sits 2 mm above the skin, names the patch.
 */
export function pickResultFromHit(
  hit: Intersection,
  root: Object3D,
  patch: Object3D | null,
): PickResult {
  root.updateWorldMatrix(true, true)
  const point = root.worldToLocal(hit.point.clone())
  const normal = (hit.face?.normal.clone() ?? new Vector3(0, 0, 1))
    .transformDirection(hit.object.matrixWorld)
    .transformDirection(new Matrix4().copy(root.matrixWorld).invert())
  return {
    target:
      patch !== null && isInside(hit.object, patch)
        ? 'patch_shoulder_r_outer'
        : 'body',
    point: [round(point.x), round(point.y), round(point.z)],
    normal: [round(normal.x), round(normal.y), round(normal.z)],
  }
}
