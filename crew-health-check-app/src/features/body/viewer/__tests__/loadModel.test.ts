import { Color, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodyModels, sensorSites } from '../../../../data/bodyView.ts'
import type { ViewerColors } from '../colors.ts'
import {
  LOAD_STALL_MS,
  ModelLoadError,
  loadBodyModel,
  prepareModel,
  withStallTimeout,
} from '../loadModel.ts'

const colors: ViewerColors = {
  background: new Color(),
  surface: new Color(),
  patch: new Color(),
  pin: new Color(),
  pinSelected: new Color(),
  sensor: new Color(),
  sensorLost: new Color(),
  statusGood: new Color(),
  statusWatch: new Color(),
  statusAct: new Color(),
}

// A placeholder entry made from a contract-named model, so these tests do not
// depend on which crew members still use the placeholder in the manifest.
function entry(): (typeof bodyModels)[number] {
  const model = bodyModels.find((entry) => entry.nodeMap === undefined)
  if (!model) throw new Error('no contract-named model')
  return {
    ...model,
    status: 'placeholder',
    file: null,
    version: 'placeholder-1',
    layers: undefined,
  }
}

function materials() {
  return { body: new MeshStandardMaterial(), patch: new MeshStandardMaterial() }
}

function delivered(names: string[]): Group {
  const root = new Group()
  for (const name of names) {
    const mesh = new Mesh(new SphereGeometry(0.1), new MeshStandardMaterial())
    mesh.name = name
    root.add(mesh)
  }
  return root
}

afterEach(() => {
  vi.useRealTimers()
})

describe('loading a body (sections 22.8 and 22.10)', () => {
  it('builds the placeholder with every part and paints the body plain gray', async () => {
    const loaded = await loadBodyModel(
      entry(),
      colors,
      sensorSites.sites,
      new AbortController().signal,
    )
    expect(loaded.contract.outcome).toBe('accept')
    expect(loaded.patch).not.toBeNull()
    expect([...loaded.anchors.keys()]).toEqual([
      'chest',
      'upper_back',
      'forearm_l',
    ])
    const materialsUsed = new Set<unknown>()
    loaded.body.traverse((node) => {
      if (node instanceof Mesh) materialsUsed.add(node.material)
    })
    expect(materialsUsed.size).toBe(1)
    loaded.dispose()
  })

  it('degrades without the patch and an anchor: free pins only, that marker not drawn', () => {
    const loaded = prepareModel(
      entry(),
      delivered(['body', 'sensor_chest', 'sensor_forearm_l']),
      materials(),
      sensorSites.sites,
    )
    expect(loaded.contract).toEqual({
      outcome: 'degrade',
      missing: ['patch_shoulder_r_outer', 'sensor_upper_back'],
    })
    expect(loaded.patch).toBeNull()
    expect([...loaded.anchors.keys()]).toEqual(['chest', 'forearm_l'])
  })

  it('rejects a model without a body node, with the contract result', () => {
    const attempt = () =>
      prepareModel(
        entry(),
        delivered(['BODY_Skin', 'patch_shoulder_r_outer']),
        materials(),
        sensorSites.sites,
      )
    expect(attempt).toThrow(ModelLoadError)
    try {
      attempt()
    } catch (error) {
      expect(error instanceof ModelLoadError && error.contract?.outcome).toBe(
        'reject',
      )
    }
  })

  it('gives up after 15 seconds and disposes a result that arrives later', async () => {
    vi.useFakeTimers()
    let finish: (value: string) => void = () => undefined
    const slow = new Promise<string>((resolve) => {
      finish = resolve
    })
    const onLate = vi.fn()
    const result = withStallTimeout(
      () => slow,
      LOAD_STALL_MS,
      new AbortController().signal,
      onLate,
    )
    const expectation = expect(result).rejects.toThrow('Loading stalled')
    await vi.advanceTimersByTimeAsync(LOAD_STALL_MS)
    await expectation
    finish('late model')
    await vi.runAllTimersAsync()
    expect(onLate).toHaveBeenCalledWith('late model')
  })

  it('keeps waiting while data arrives and stops 15 seconds after the last data', async () => {
    vi.useFakeTimers()
    let progress: () => void = () => undefined
    const result = withStallTimeout(
      (onProgress) => {
        progress = onProgress
        return new Promise<string>(() => undefined)
      },
      LOAD_STALL_MS,
      new AbortController().signal,
      () => undefined,
    )
    let stopped = false
    result.catch(() => {
      stopped = true
    })
    for (let step = 0; step < 3; step++) {
      await vi.advanceTimersByTimeAsync(10_000)
      progress()
    }
    expect(stopped).toBe(false)
    const expectation = expect(result).rejects.toThrow('Loading stalled')
    await vi.advanceTimersByTimeAsync(LOAD_STALL_MS)
    await expectation
  })

  it('stops when cancelled and reports a failed file as a load error', async () => {
    const controller = new AbortController()
    const pending = withStallTimeout(
      () => new Promise(() => undefined),
      LOAD_STALL_MS,
      controller.signal,
      () => undefined,
    )
    controller.abort()
    await expect(pending).rejects.toThrow('Loading was cancelled')
    const failing = withStallTimeout(
      () => Promise.reject(new Error('404')),
      LOAD_STALL_MS,
      new AbortController().signal,
      () => undefined,
    )
    await expect(failing).rejects.toThrow('The file could not be loaded')
  })
})
