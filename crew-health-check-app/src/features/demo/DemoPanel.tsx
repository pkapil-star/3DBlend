import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ClockControls } from './ClockControls.tsx'
import { BodyViewControls } from './BodyViewControls.tsx'
import { CrewAndLinkControls } from './CrewAndLinkControls.tsx'
import { ResetToSeed } from './ResetToSeed.tsx'
import { ScenarioPicker } from './ScenarioPicker.tsx'
import { SuitReplayControls } from './SuitReplayControls.tsx'

/**
 * The presenter tools drawer (section 16), opened with Shift+D or the footer
 * link. A presenter tool only: the crew never needs it. Clock, crew,
 * environment and link, reset, the scenario picker (M4, completed in M6) and
 * the suit replay (B1) and the body view (B2).
 */
export function DemoPanel({ onClose }: { onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-panel-title"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="demo-panel-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold"
          >
            Presenter tools
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close presenter tools"
            className="inline-flex size-11 items-center justify-center rounded-lg border-2 border-slate-500"
          >
            <X aria-hidden="true" size={24} />
          </button>
        </div>
        <p className="mt-1 text-slate-700">
          For demonstrations only. Press Escape to close.
        </p>
        <div className="mt-4 space-y-6">
          <ClockControls />
          <CrewAndLinkControls />
          <SuitReplayControls />
          <BodyViewControls />
          <ResetToSeed onDone={onClose} />
          <ScenarioPicker onLoaded={onClose} />
        </div>
      </div>
    </div>
  )
}
