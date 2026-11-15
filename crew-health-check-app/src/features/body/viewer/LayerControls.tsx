import type { LayerState } from './loadModel.ts'

/**
 * Show or hide the anatomical layers of a delivered model (section 23.12).
 * Pins always go on the skin, so they need the skin layer shown.
 */
export function LayerControls({
  layers,
  onChange,
}: {
  layers: readonly LayerState[]
  onChange: (id: string, visible: boolean) => void
}) {
  const surfaceHidden = layers.some((layer) => layer.surface && !layer.visible)
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-300 p-3">
      <legend className="px-1 font-semibold">Anatomical layers</legend>
      <p className="text-slate-700">
        From an anatomical atlas model: typical anatomy for orientation, not
        your own body and not a finding about you.
      </p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {layers.map((layer) => (
          <label key={layer.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(event) => onChange(layer.id, event.target.checked)}
              className="size-5"
            />
            {layer.label}
          </label>
        ))}
      </div>
      {surfaceHidden && (
        <p className="font-semibold">
          Pins go on the skin only. Turn the skin layer on to place a pin.
        </p>
      )}
    </fieldset>
  )
}
