import { Suspense, lazy, useCallback } from 'react'
import { Link } from 'react-router'
import type { BodyModelEntry } from '../../bodyview/types.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { Tag } from '../../components/Tag.tsx'
import { useBodyModelStatus } from '../../lib/bodyModelStatus.ts'
import { useAppStore } from '../../store/index.ts'
import type { ModelStatus, Viewer3DProps } from './viewer/Viewer3D.tsx'
import { NO_3D_TEXT, use3dAvailable } from './body3d.ts'

const Viewer3D = lazy(() => import('./viewer/Viewer3D.tsx'))

export type ViewerInputs = Omit<Viewer3DProps, 'model' | 'onStatus'>

/**
 * The 3D part of the Body screen (sections 22.7 and 22.10): the toggle, the
 * model tags, the viewer and every fallback line. 2D first: off by default.
 */
export function BodyViewSection({
  model,
  viewer,
}: {
  model: BodyModelEntry | null
  viewer: ViewerInputs
}) {
  const available = use3dAvailable()
  const show3d = useAppStore((state) => state.prefs.show3d)
  const setShow3d = useAppStore((state) => state.setShow3d)
  const status = useBodyModelStatus((state) =>
    model ? state.byModel[model.id] : undefined,
  )
  const report = useBodyModelStatus((state) => state.report)
  const forget = useBodyModelStatus((state) => state.forget)
  const modelId = model?.id
  const version = model?.version
  const onStatus = useCallback(
    (next: ModelStatus) => {
      if (modelId !== undefined && version !== undefined) {
        report(modelId, { version, ...next })
      }
    },
    [report, modelId, version],
  )
  const failed =
    model !== null &&
    status?.version === model.version &&
    status.state === 'failed'

  return (
    <section aria-labelledby="body-3d-title" className="space-y-3">
      <h2 id="body-3d-title" className="text-xl font-semibold">
        3D body
      </h2>
      {!available && <p className="text-slate-700">{NO_3D_TEXT}</p>}
      {available && model === null && (
        <p className="text-slate-700">No 3D body for this crew member.</p>
      )}
      {available && model !== null && (
        <>
          <label className="flex min-h-11 items-center gap-3 font-semibold">
            <input
              type="checkbox"
              checked={show3d}
              onChange={(event) => setShow3d(event.target.checked)}
              className="size-5"
            />
            Show 3D body
          </label>
          {show3d && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {model.status === 'placeholder' && <Tag>Placeholder model</Tag>}
                {model.aiAssisted && <Tag>AI-assisted model</Tag>}
                {model.layers && <Tag>Anatomical atlas model</Tag>}
              </div>
              <p className="text-slate-700">
                A figure for showing where it is sore. It is not a copy of your
                body or of any astronaut. Tap the skin to place a pin, or use
                the form.
              </p>
              {failed ? (
                <div className="space-y-2">
                  <p role="alert" className="font-semibold">
                    The 3D body could not be loaded.
                  </p>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => forget(model.id)}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <Suspense
                  fallback={
                    <p className="text-slate-700">Loading the 3D view…</p>
                  }
                >
                  <Viewer3D {...viewer} model={model} onStatus={onStatus} />
                </Suspense>
              )}
            </div>
          )}
        </>
      )}
      <Link
        to="/body/compare"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Compare bodies
      </Link>
    </section>
  )
}
