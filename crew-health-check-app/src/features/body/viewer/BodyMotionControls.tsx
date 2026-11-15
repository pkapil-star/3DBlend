import { Tag } from '../../../components/Tag.tsx'

export interface MotionState {
  animate: boolean
  heart: number
  breath: number
  profileB: number
}

/** Fixed animation pace for breathing: there is no breathing-rate reading to follow. */
export const ANIMATION_BREATHS_PER_MIN = 12

/**
 * Heartbeat, breathing and body-shape controls for a model with shape keys
 * (the 3DBlend viewer's sliders). Animation is off by default and only moves
 * the inner organs; it is a picture, not a measurement.
 */
export function BodyMotionControls(props: {
  state: MotionState
  onChange: (next: MotionState) => void
  heartRateBpm: number | null
  hasProfileB: boolean
}) {
  const { state, onChange } = props
  const slider = (label: string, key: 'heart' | 'breath' | 'profileB') => (
    <label className="flex min-h-11 flex-wrap items-center gap-3">
      <span className="w-44">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={state[key]}
        disabled={state.animate && key !== 'profileB'}
        onChange={(event) =>
          onChange({ ...state, [key]: Number(event.target.value) })
        }
        className="min-w-40 flex-1"
      />
    </label>
  )
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-300 p-3">
      <legend className="px-1 font-semibold">
        Heart, breathing and body shape
      </legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={state.animate}
          onChange={(event) =>
            onChange({ ...state, animate: event.target.checked })
          }
          className="size-5"
        />
        Animate the heartbeat and breathing
      </label>
      {state.animate && (
        <p className="flex flex-wrap items-center gap-2 text-slate-700">
          {props.heartRateBpm !== null
            ? `Heartbeat follows your latest heart rate: ${Math.round(props.heartRateBpm)} bpm.`
            : 'No heart rate reading yet: the heart beats at 60 per minute.'}{' '}
          Breathing uses a fixed pace of {ANIMATION_BREATHS_PER_MIN} per minute.
          <Tag>Simulated</Tag>
        </p>
      )}
      {slider('Heart contraction', 'heart')}
      {slider('Breath in', 'breath')}
      {props.hasProfileB && slider('Second body shape', 'profileB')}
      {state.profileB > 0 && (
        <p className="font-semibold">
          Pins can be placed only at the original body shape. Set the second
          body shape to 0 to place a pin.
        </p>
      )}
    </fieldset>
  )
}
