import type { Viewer } from './createViewer.ts'
import { viewDescription } from './viewText.ts'

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-slate-700 bg-white px-3 font-semibold text-slate-900 hover:bg-slate-100'

/**
 * The button equivalents of dragging (section 22.8): every camera move can be
 * made by keyboard, and a live line says which side is shown.
 */
export function ViewButtons({
  viewer,
  description,
  onMoved,
}: {
  viewer: () => Viewer | null
  description: string
  onMoved: (description: string) => void
}) {
  function move(action: (current: Viewer) => void) {
    const current = viewer()
    if (!current) return
    action(current)
    onMoved(viewDescription(current.azimuthDeg()))
  }
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Turn the 3D view"
      >
        <button
          type="button"
          className={BUTTON}
          onClick={() => move((v) => v.rotateBy(45))}
        >
          Rotate left
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => move((v) => v.rotateBy(-45))}
        >
          Rotate right
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => move((v) => v.showView('front'))}
        >
          Front
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => move((v) => v.showView('back'))}
        >
          Back
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => move((v) => v.resetView())}
        >
          Reset view
        </button>
      </div>
      <p aria-live="polite" className="text-slate-700">
        {description}
      </p>
    </div>
  )
}
