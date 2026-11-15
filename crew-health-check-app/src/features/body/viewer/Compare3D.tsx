import { useEffect, useRef, useState } from 'react'
import { Box3, Vector3 } from 'three'
import type { BodyModelEntry } from '../../../bodyview/types.ts'
import { sensorSites } from '../../../data/bodyView.ts'
import { readViewerColors } from './colors.ts'
import { createViewer, type Viewer } from './createViewer.ts'
import { loadBodyModel, type LoadedModel } from './loadModel.ts'
import { ViewButtons } from './ViewButtons.tsx'

/** Space between the bodies' outstretched hands, in meters. */
const GAP_M = 0.2

/**
 * Both bodies side by side in one scene with one camera, so position and
 * scale are shared (section 22.7). No pins here.
 */
export default function Compare3D({
  models,
}: {
  models: readonly BodyModelEntry[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [description, setDescription] = useState('Showing the front')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const colors = readViewerColors(canvas)
    const viewer = createViewer(canvas, colors)
    viewerRef.current = viewer
    const controller = new AbortController()
    const loadedModels: LoadedModel[] = []
    void Promise.allSettled(
      models.map((model) =>
        loadBodyModel(model, colors, sensorSites.sites, controller.signal),
      ),
    ).then((results) => {
      const missing: string[] = []
      results.forEach((result, index) => {
        const model = models[index]
        if (result.status === 'fulfilled') {
          if (controller.signal.aborted) result.value.dispose()
          else loadedModels.push(result.value)
        } else if (model) missing.push(model.label)
      })
      if (controller.signal.aborted) return
      // Side by side by their own widths, so the arms never overlap.
      const ordered = [...loadedModels].sort(
        (a, b) => models.indexOf(a.entry) - models.indexOf(b.entry),
      )
      const boxes = ordered.map((loaded) =>
        new Box3().setFromObject(loaded.root),
      )
      const widths = boxes.map((box) => box.getSize(new Vector3()).x)
      let left =
        -(
          widths.reduce((sum, width) => sum + width, 0) +
          GAP_M * (ordered.length - 1)
        ) / 2
      ordered.forEach((loaded, index) => {
        const box = boxes[index]
        if (!box) return
        loaded.root.position.x = left - box.min.x
        left += (widths[index] ?? 0) + GAP_M
      })
      viewer.setContent(loadedModels.map((loaded) => loaded.root))
      setFailed(missing)
      setReady(true)
    })
    return () => {
      controller.abort()
      for (const loaded of loadedModels) loaded.dispose()
      viewer.dispose()
      viewerRef.current = null
    }
  }, [models])

  const names = models.map((model) => model.label).join(' and ')
  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Two 3D bodies side by side at the same scale: ${names}, from left to right`}
        className="block h-[420px] w-full rounded-lg border border-slate-300 lg:h-[520px]"
      />
      {!ready && <p className="text-slate-700">Loading the 3D bodies…</p>}
      {failed.map((label) => (
        <p key={label} role="alert" className="font-semibold">
          The 3D body of {label} could not be loaded.
        </p>
      ))}
      <ViewButtons
        viewer={() => viewerRef.current}
        description={description}
        onMoved={setDescription}
      />
    </div>
  )
}
