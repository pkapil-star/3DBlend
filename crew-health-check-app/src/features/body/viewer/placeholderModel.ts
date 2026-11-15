import {
  CapsuleGeometry,
  Group,
  LatheGeometry,
  Mesh,
  Object3D,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three'
import { BODY_NODE, PATCH_NODE } from '../../../bodyview/modelContract.ts'
import type { BodyProfile } from '../../../bodyview/types.ts'

// A simple mannequin built in code to the body model contract (section
// 22.9): a root named after the model, a `body` group, the right outer
// shoulder patch 2 mm above the skin and three sensor anchors on the surface.
// Meters, +Y up, facing +Z, the crew member's right side at negative X.
// The proportions below are drawing choices for a placeholder figure, not
// measurements of people; only the profile values come from the data.

const ARM_ANGLE = (40 * Math.PI) / 180
const DEPTH_RATIO = 0.7
const PATCH_GAP_M = 0.002
const UP = new Vector3(0, 1, 0)

function limb(
  from: Vector3,
  to: Vector3,
  radius: number,
  material: Material,
): Mesh {
  const axis = new Vector3().subVectors(to, from)
  const mesh = new Mesh(
    new CapsuleGeometry(radius, axis.length(), 6, 20),
    material,
  )
  mesh.position.addVectors(from, to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, axis.normalize())
  return mesh
}

function sphere(center: Vector3, radius: number, material: Material): Mesh {
  const mesh = new Mesh(new SphereGeometry(radius, 24, 16), material)
  mesh.position.copy(center)
  return mesh
}

function anchor(name: string, position: Vector3): Object3D {
  const node = new Object3D()
  node.name = name
  node.position.copy(position)
  return node
}

export function buildPlaceholder(
  profile: BodyProfile,
  modelId: string,
  materials: { body: Material; patch: Material },
): Group {
  const h = profile.heightCm / 100
  const crotchY = profile.inseamCm / 100
  const halfShoulders = profile.shoulderBreadthCm / 200
  // Circumference divided by pi gives a rough width (section 22.9).
  const chestHalf = profile.chestCm / 100 / Math.PI / 2
  const waistHalf = profile.waistCm / 100 / Math.PI / 2
  const hipHalf = profile.hipCm / 100 / Math.PI / 2

  const headR = 0.062 * h
  const headStretch = 1.12
  const headCenterY = h - headR * headStretch
  const shoulderY = 0.8 * h
  const chestY = 0.72 * h
  const upperBackY = 0.76 * h
  const shoulderR = 0.031 * h
  const forearmR = 0.021 * h
  const footR = 0.02 * h

  const root = new Group()
  root.name = modelId
  const body = new Group()
  body.name = BODY_NODE
  root.add(body)

  const torsoOutline: [number, number][] = [
    [0, crotchY - 0.01],
    [hipHalf * 0.55, crotchY],
    [hipHalf, crotchY + 0.06 * h],
    [waistHalf, 0.61 * h],
    [chestHalf, chestY],
    [chestHalf * 0.92, shoulderY - 0.02 * h],
    [0.05 * h, shoulderY + 0.015 * h],
    [0, shoulderY + 0.02 * h],
  ]
  const torso = new Mesh(
    new LatheGeometry(
      torsoOutline.map(([x, y]) => new Vector2(x, y)),
      40,
    ),
    materials.body,
  )
  torso.scale.z = DEPTH_RATIO
  body.add(torso)

  const head = new Mesh(new SphereGeometry(headR, 32, 24), materials.body)
  head.position.set(0, headCenterY, 0)
  head.scale.set(0.88, headStretch, 0.98)
  body.add(head)
  body.add(
    limb(
      new Vector3(0, shoulderY, 0),
      new Vector3(0, headCenterY - headR * 0.6, 0),
      0.028 * h,
      materials.body,
    ),
  )

  const joints = new Map<number, Vector3>()
  const forearmMid = new Map<number, Vector3>()
  for (const side of [-1, 1]) {
    const joint = new Vector3(side * (halfShoulders - shoulderR), shoulderY, 0)
    joints.set(side, joint)
    const direction = new Vector3(
      side * Math.sin(ARM_ANGLE),
      -Math.cos(ARM_ANGLE),
      0,
    )
    const elbow = joint
      .clone()
      .addScaledVector(direction, profile.upperArmCm / 100)
    const wrist = elbow
      .clone()
      .addScaledVector(direction, profile.forearmCm / 100)
    const handEnd = wrist.clone().addScaledVector(direction, 0.105 * h)
    forearmMid.set(side, elbow.clone().add(wrist).multiplyScalar(0.5))
    body.add(sphere(joint, shoulderR, materials.body))
    body.add(limb(joint, elbow, 0.026 * h, materials.body))
    body.add(limb(elbow, wrist, forearmR, materials.body))
    body.add(limb(wrist, handEnd, 0.02 * h, materials.body))

    const hip = new Vector3(side * hipHalf * 0.5, crotchY + 0.03 * h, 0)
    const knee = new Vector3(side * (hipHalf * 0.5 + 0.01), 0.285 * h, 0.01)
    const ankle = new Vector3(side * (hipHalf * 0.5 + 0.02), 0.045 * h, 0)
    body.add(limb(hip, knee, 0.039 * h, materials.body))
    body.add(limb(knee, ankle, 0.029 * h, materials.body))
    // The foot lies along +Z with its sole on y = 0.
    const footLength = profile.footCm / 100
    const heelZ = -0.05
    body.add(
      limb(
        new Vector3(ankle.x, footR, heelZ + footR),
        new Vector3(ankle.x, footR, heelZ + footLength - footR),
        footR,
        materials.body,
      ),
    )
  }

  const rightJoint = joints.get(-1) ?? new Vector3()
  // A shell over the outer (negative X) side of the right shoulder joint.
  const patch = new Mesh(
    new SphereGeometry(
      shoulderR + PATCH_GAP_M,
      24,
      12,
      -Math.PI / 3,
      (2 * Math.PI) / 3,
      Math.PI / 6,
      Math.PI * 0.4,
    ),
    materials.patch,
  )
  patch.name = PATCH_NODE
  patch.position.copy(rightJoint)
  root.add(patch)

  // Torso half-width between the chest and the shoulder line, as the lathe has it.
  const backT = (upperBackY - chestY) / (shoulderY - 0.02 * h - chestY)
  const backHalf = chestHalf * (1 - 0.08 * backT)
  const leftForearm = forearmMid.get(1) ?? new Vector3()
  const outward = new Vector3(Math.cos(ARM_ANGLE), Math.sin(ARM_ANGLE), 0)
  root.add(
    anchor('sensor_chest', new Vector3(0, chestY, chestHalf * DEPTH_RATIO)),
  )
  root.add(
    anchor(
      'sensor_upper_back',
      new Vector3(0, upperBackY, -backHalf * DEPTH_RATIO),
    ),
  )
  root.add(
    anchor(
      'sensor_forearm_l',
      leftForearm.clone().addScaledVector(outward, forearmR),
    ),
  )
  return root
}
