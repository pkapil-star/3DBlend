import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ViewerColors } from './colors.ts'

// The 3D scene (section 22.8): one camera with a narrow field of view, orbit
// controls without pan, two lights, no shadows, and a render only when
// something changed. Camera moves are instant: there is no animation at all,
// so reduced-motion settings are respected by design.

const FOV_DEG = 30
const FRAME_MARGIN = 1.15

export type ViewName = 'front' | 'back'

export interface Viewer {
  /** Shows these objects and frames the camera on them. */
  setContent(objects: readonly Object3D[]): void
  requestRender(): void
  rotateBy(degrees: number): void
  showView(view: ViewName): void
  resetView(): void
  /** Turns the camera to look at a point (in world space) from its side of the body. */
  turnTowards(point: Vector3): void
  /** The nearest hit at a canvas pixel among these objects, or null. */
  pick(
    clientX: number,
    clientY: number,
    targets: readonly Object3D[],
  ): Intersection | null
  /** The camera's direction around the body, in degrees: 0 is the front. */
  azimuthDeg(): number
  dispose(): void
}

export function createViewer(
  canvas: HTMLCanvasElement,
  colors: ViewerColors,
): Viewer {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(colors.background)
  const scene = new Scene()
  scene.add(new HemisphereLight(undefined, undefined, 1.6))
  const sun = new DirectionalLight(undefined, 1.8)
  sun.position.set(1.5, 3, 2.5)
  scene.add(sun)
  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.05, 50)
  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = false
  controls.minPolarAngle = 0.25

  const raycaster = new Raycaster()
  let content: readonly Object3D[] = []
  let frameDistance = 3
  let frame = 0

  function requestRender() {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      renderer.render(scene, camera)
    })
  }
  controls.addEventListener('change', requestRender)

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    requestRender()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  function setSpherical(change: (spherical: Spherical) => void) {
    const offset = camera.position.clone().sub(controls.target)
    const spherical = new Spherical().setFromVector3(offset)
    change(spherical)
    spherical.makeSafe()
    camera.position
      .copy(controls.target)
      .add(offset.setFromSpherical(spherical))
    controls.update()
    requestRender()
  }

  function frameContent() {
    const box = new Box3()
    for (const object of content) box.expandByObject(object)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const halfFov = MathUtils.degToRad(FOV_DEG / 2)
    const byHeight = ((size.y / 2) * FRAME_MARGIN) / Math.tan(halfFov)
    const byWidth =
      ((size.x / 2) * FRAME_MARGIN) / (Math.tan(halfFov) * camera.aspect)
    frameDistance = Math.max(byHeight, byWidth) + size.z / 2
    controls.target.copy(center)
    controls.minDistance = frameDistance * 0.45
    controls.maxDistance = frameDistance * 1.5
    // Never below the floor: at the farthest zoom the camera stays above y = 0.
    controls.maxPolarAngle = Math.acos(
      MathUtils.clamp(-(center.y * 0.9) / controls.maxDistance, -1, 1),
    )
    camera.position.set(center.x, center.y, center.z + frameDistance)
    controls.update()
    requestRender()
  }

  return {
    setContent(objects) {
      for (const object of content) scene.remove(object)
      content = objects
      for (const object of content) scene.add(object)
      frameContent()
    },
    requestRender,
    rotateBy(degrees) {
      setSpherical((spherical) => {
        spherical.theta += MathUtils.degToRad(degrees)
      })
    },
    showView(view) {
      setSpherical((spherical) => {
        spherical.theta = view === 'front' ? 0 : Math.PI
      })
    },
    resetView() {
      frameContent()
    },
    turnTowards(point) {
      const center = controls.target
      setSpherical((spherical) => {
        spherical.theta = Math.atan2(point.x - center.x, point.z - center.z)
      })
    },
    pick(clientX, clientY, targets) {
      const rect = canvas.getBoundingClientRect()
      const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects([...targets], true)[0] ?? null
    },
    azimuthDeg() {
      const offset = camera.position.clone().sub(controls.target)
      const degrees = MathUtils.radToDeg(Math.atan2(offset.x, offset.z))
      return Math.round(degrees)
    },
    dispose() {
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('change', requestRender)
      controls.dispose()
      for (const object of content) scene.remove(object)
      renderer.dispose()
    },
  }
}
