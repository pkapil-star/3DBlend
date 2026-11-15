import { healthData } from '../data/index.ts'
import { environmentDef } from '../lib/labels.ts'
import { delayWords, distanceLabel } from '../lib/route.ts'
import { useAppStore } from '../store/index.ts'

/** The Mars slider moves a minute at a time: 180 s to 1320 s in 19 steps. */
const DELAY_STEP_SEC = 60

/**
 * Environment and Earth link delay (section 14). The station and the Moon
 * have one fixed delay; the three Mars environments have a slider. Changing
 * either re-routes every alert at once (section 13).
 */
export function EnvironmentControls({
  idPrefix = '',
}: {
  /** Keeps ids unique when a second copy sits in the presenter tools. */
  idPrefix?: string
}) {
  const environmentId = useAppStore((state) => state.mission.environmentId)
  const link = useAppStore((state) => state.mission.link)
  const setEnvironment = useAppStore((state) => state.setEnvironment)
  const setDelay = useAppStore((state) => state.setDelay)
  const environment = environmentDef(environmentId)
  const fixed = environment.oneWayDelaySecMin === environment.oneWayDelaySecMax
  const distance = distanceLabel(environment, link.oneWayDelaySec)
  const delayText = `${delayWords(link.oneWayDelaySec)} each way${distance ? ` (${distance})` : ''}`
  const linkText = link.linkUp ? `Link up, ${delayText}` : 'Link down'

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <label
          htmlFor={`${idPrefix}environment`}
          className="block text-slate-600"
        >
          Environment
        </label>
        <select
          id={`${idPrefix}environment`}
          value={environmentId}
          onChange={(event) => {
            const next = healthData.environments.find(
              (entry) => entry.id === event.target.value,
            )
            if (next) setEnvironment(next.id)
          }}
          className="mt-0.5 min-h-11 max-w-full rounded-lg border-2 border-slate-500 bg-white px-2 font-medium"
        >
          {healthData.environments.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {fixed ? (
        <div>
          <p className="text-slate-600">Earth link</p>
          <p className="flex min-h-11 items-center font-medium">
            {linkText} (fixed)
          </p>
        </div>
      ) : (
        <div>
          <label
            htmlFor={`${idPrefix}link-delay`}
            className="block text-slate-600"
          >
            Earth link delay, one way
          </label>
          <div className="flex flex-wrap items-center gap-x-3">
            <input
              id={`${idPrefix}link-delay`}
              type="range"
              min={environment.oneWayDelaySecMin}
              max={environment.oneWayDelaySecMax}
              step={DELAY_STEP_SEC}
              value={link.oneWayDelaySec}
              onChange={(event) => setDelay(Number(event.target.value))}
              aria-valuetext={delayText}
              className="h-11 w-48"
            />
            {/* Plain text, not <output>: the slider already announces its
                value, and a live region would read it out twice. */}
            <p className="font-medium">{linkText}</p>
          </div>
        </div>
      )}
    </div>
  )
}
