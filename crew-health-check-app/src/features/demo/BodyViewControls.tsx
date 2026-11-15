import { bodyModels } from '../../data/bodyView.ts'
import {
  loadStatusText,
  useBodyModelStatus,
} from '../../lib/bodyModelStatus.ts'
import { useAppStore } from '../../store/index.ts'

/**
 * "Force 2D" and the body model in use per crew member (sections 16 and
 * 22.10), with the contract result of its last load in this session.
 */
export function BodyViewControls() {
  const force2d = useAppStore((state) => state.prefs.force2d)
  const setForce2d = useAppStore((state) => state.setForce2d)
  const statuses = useBodyModelStatus((state) => state.byModel)

  return (
    <section aria-labelledby="body-view-title" className="space-y-2">
      <h3 id="body-view-title" className="text-lg font-semibold">
        Body view
      </h3>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={force2d}
          onChange={(event) => setForce2d(event.target.checked)}
          className="size-5"
        />
        Force 2D (hide the 3D body everywhere)
      </label>
      <ul className="space-y-1">
        {bodyModels.map((model) => (
          <li key={model.id}>
            {model.label}:{' '}
            {model.status === 'placeholder'
              ? 'Placeholder model'
              : 'Delivered model'}{' '}
            ({model.version}
            {model.file ? `, ${model.file}` : ''}).{' '}
            {loadStatusText(statuses[model.id], model.version)}.
          </li>
        ))}
        <li>Crew member C: no 3D body.</li>
      </ul>
    </section>
  )
}
