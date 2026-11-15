import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  CONTRACT_NAMES,
  checkNodeNames,
  isContractRole,
  type ContractResult,
} from '../../../bodyview/modelContract.ts'
import type {
  BodyModelEntry,
  SensorSite,
  SensorSiteId,
} from '../../../bodyview/types.ts'
import type { ViewerColors } from './colors.ts'
import { buildPlaceholder } from './placeholderModel.ts'

// Loading a body (sections 22.8 and 23.12): the placeholder is built in code;
// a delivered file comes through GLTFLoader and may be stopped if no data
// arrives for 15 seconds. Either way the contract roles are checked before
// anything is shown. A delivered anatomical model keeps all its layers; only
// the layer holding the skin is painted plain gray, and pins go on the skin.

export const LOAD_STALL_MS = 15_000
const SEE_THROUGH_OPACITY = 0.25

export interface LayerState {
  id: string
  label: string
  /** True for the layer that holds the pickable body surface (the skin). */
  surface: boolean
  visible: boolean
}

export interface LoadedModel {
  entry: BodyModelEntry
  root: Group
  body: Object3D
  patch: Mesh | null
  anchors: Map<SensorSiteId, Object3D>
  contract: ContractResult
  layers: LayerState[]
  /** Meshes painted with the shared skin material (the skin layer, or the body of a contract model). */
  surfaceMeshes: Mesh[]
  /** The shared skin material; the health overlay switches it to vertex colours. */
  bodyMaterial: MeshStandardMaterial
  setLayerVisible(id: string, visible: boolean): void
  /** Pins may be placed only while the skin is shown. */
  surfacePickable(): boolean
  setPatchHighlight(on: boolean): void
  dispose(): void
}

export class ModelLoadError extends Error {
  readonly contract: ContractResult | null
  constructor(message: string, contract: ContractResult | null) {
    super(message)
    this.contract = contract
  }
}

interface Materials {
  body: MeshStandardMaterial
  patch: MeshStandardMaterial
}

function createMaterials(colors: ViewerColors): Materials {
  return {
    body: new MeshStandardMaterial({
      color: colors.surface,
      roughness: 0.85,
      metalness: 0,
    }),
    // Invisible until highlighted, but still hit by taps (raycasting ignores
    // opacity). The offset keeps a patch that lies close to the skin from
    // flickering into it when it is tinted.
    patch: new MeshStandardMaterial({
      color: colors.patch,
      roughness: 0.6,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  }
}

function ownMaterials(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material]
}

function disposeMaterials(material: Material | Material[], keep: Materials) {
  for (const entry of ownMaterials(material)) {
    if (entry !== keep.body && entry !== keep.patch) entry.dispose()
  }
}

function disposeTree(root: Object3D) {
  root.traverse((node) => {
    if (node instanceof Mesh) {
      node.geometry.dispose()
      for (const material of ownMaterials(node.material)) material.dispose()
    }
  })
}

function isInside(node: Object3D, ancestor: Object3D): boolean {
  for (let current: Object3D | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

/**
 * Checks the roles, paints the skin gray, keeps every other layer as
 * delivered and finds the patch and the sensor anchors.
 */
export function prepareModel(
  entry: BodyModelEntry,
  root: Group,
  materials: Materials,
  sites: readonly SensorSite[],
): LoadedModel {
  const nodeMap = entry.nodeMap ?? CONTRACT_NAMES
  const names: string[] = []
  root.traverse((node) => names.push(node.name))
  const contract = checkNodeNames(names, nodeMap)
  const body = root.getObjectByName(nodeMap.body)
  if (contract.outcome === 'reject' || body === undefined) {
    throw new ModelLoadError('The model has no body surface', contract)
  }
  const patchNode = root.getObjectByName(nodeMap.patch_shoulder_r_outer)
  const patch = patchNode instanceof Mesh ? patchNode : null

  const layers = (entry.layers ?? []).flatMap((layer) => {
    const node = root.getObjectByName(layer.node)
    return node
      ? [{ ...layer, object: node, surface: isInside(body, node) }]
      : []
  })
  const surfaceLayer = layers.find((layer) => layer.surface)
  // The skin, and whatever shares its layer (eyes, nails), is plain gray.
  const painted = surfaceLayer?.object ?? body
  const surfaceMeshes: Mesh[] = []
  painted.traverse((node) => {
    if (node instanceof Mesh && node !== patch) {
      disposeMaterials(node.material, materials)
      node.material = materials.body
      surfaceMeshes.push(node)
    }
  })
  if (patch) {
    disposeMaterials(patch.material, materials)
    patch.material = materials.patch
  }
  root.traverse((node) => {
    // Shape keys (heart, lungs, a second body profile) stay at rest, so the
    // surface under a pin never moves.
    if (node instanceof Mesh && node.morphTargetInfluences) {
      node.morphTargetInfluences.fill(0)
    }
    // Helpers the file marks hidden (region markers, measuring points) stay
    // hidden; the patch stays drawn because it must take taps.
    if (node !== patch && node.userData.default_visible === false) {
      node.visible = false
    }
  })
  for (const layer of layers) layer.object.visible = layer.defaultVisible
  for (
    let node = patch?.parent ?? null;
    node && node !== root;
    node = node.parent
  ) {
    node.visible = true
  }

  const anchors = new Map<SensorSiteId, Object3D>()
  for (const site of sites) {
    const name = isContractRole(site.anchorNode)
      ? nodeMap[site.anchorNode]
      : site.anchorNode
    const node = root.getObjectByName(name)
    if (node) anchors.set(site.id, node)
  }

  function updateSkin() {
    const innerShown = layers.some(
      (layer) => !layer.surface && layer.object.visible,
    )
    const seeThrough = innerShown && (surfaceLayer?.object.visible ?? true)
    materials.body.transparent = seeThrough
    materials.body.opacity = seeThrough ? SEE_THROUGH_OPACITY : 1
    materials.body.depthWrite = !seeThrough
    materials.body.needsUpdate = true
  }
  updateSkin()

  return {
    entry,
    root,
    body,
    patch,
    anchors,
    contract,
    surfaceMeshes,
    bodyMaterial: materials.body,
    get layers() {
      return layers.map(({ id, label, surface, object }) => ({
        id,
        label,
        surface,
        visible: object.visible,
      }))
    },
    setLayerVisible(id, visible) {
      const layer = layers.find((entry) => entry.id === id)
      if (!layer) return
      layer.object.visible = visible
      updateSkin()
    },
    surfacePickable() {
      return surfaceLayer?.object.visible ?? true
    },
    setPatchHighlight(on) {
      materials.patch.opacity = on ? 0.45 : 0
    },
    dispose() {
      root.removeFromParent()
      disposeTree(root)
      materials.body.dispose()
      materials.patch.dispose()
    },
  }
}

/**
 * Runs a load that reports progress, and rejects if no progress arrives for
 * `ms` or on abort. A large file may take long overall; only a stall stops it.
 * A result that arrives after the stop is handed to `onLate` for disposal.
 */
export function withStallTimeout<T>(
  run: (onProgress: () => void) => Promise<T>,
  ms: number,
  signal: AbortSignal,
  onLate: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = (error: ModelLoadError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () => stop(new ModelLoadError('Loading stalled', null)),
        ms,
      )
    }
    arm()
    signal.addEventListener(
      'abort',
      () => stop(new ModelLoadError('Loading was cancelled', null)),
      { once: true },
    )
    run(() => {
      if (!settled) arm()
    }).then(
      (value) => {
        if (settled) {
          onLate(value)
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) =>
        stop(
          error instanceof ModelLoadError
            ? error
            : new ModelLoadError('The file could not be loaded', null),
        ),
    )
  })
}

export async function loadBodyModel(
  entry: BodyModelEntry,
  colors: ViewerColors,
  sites: readonly SensorSite[],
  signal: AbortSignal,
  onProgress: (fraction: number | null) => void = () => undefined,
): Promise<LoadedModel> {
  const materials = createMaterials(colors)
  try {
    if (entry.file === null) {
      const root = buildPlaceholder(entry.profile, entry.id, materials)
      return prepareModel(entry, root, materials, sites)
    }
    const url = `${import.meta.env.BASE_URL}${entry.file}`
    const gltf = await withStallTimeout(
      (onData) =>
        new GLTFLoader().loadAsync(url, (event) => {
          onData()
          onProgress(event.total > 0 ? event.loaded / event.total : null)
        }),
      LOAD_STALL_MS,
      signal,
      (late) => disposeTree(late.scene),
    )
    const root = new Group()
    root.name = entry.id
    root.add(gltf.scene)
    try {
      return prepareModel(entry, root, materials, sites)
    } catch (error) {
      disposeTree(root)
      throw error
    }
  } catch (error) {
    materials.body.dispose()
    materials.patch.dispose()
    throw error
  }
}
