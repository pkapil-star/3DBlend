import type { SensorReadout, SensorSiteId } from '../../bodyview/types.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { sensorSites } from '../../data/bodyView.ts'
import { SensorCard } from './SensorCard.tsx'
import type { SuitReplayState } from './suitReplay.ts'

/** The three suit sensor cards for the active crew member, or why there are none. */
export function SensorSection({
  replay,
  readouts,
  hasData,
  nowMs,
  selectedSite,
  onSelectSite,
  onTurn,
}: {
  replay: SuitReplayState
  readouts: readonly SensorReadout[]
  hasData: boolean
  nowMs: number
  selectedSite?: SensorSiteId | null
  onSelectSite?: (site: SensorSiteId | null) => void
  /** With the 3D body shown: turns the view to a sensor's side. */
  onTurn?: (site: SensorSiteId) => void
}) {
  return (
    <section aria-labelledby="sensors-title" className="space-y-3">
      <h2 id="sensors-title" className="text-xl font-semibold">
        Suit sensors
      </h2>
      {replay.status === 'loading' && (
        <p className="text-slate-700">Loading the simulated suit replay…</p>
      )}
      {replay.status === 'error' && (
        <div className="space-y-2">
          <p role="alert" className="font-semibold">
            The simulated suit replay could not be loaded.
          </p>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={replay.retry}
          >
            Try again
          </button>
        </div>
      )}
      {replay.status === 'ready' && !hasData && (
        <p className="text-slate-700">No suit data for this crew member.</p>
      )}
      {replay.status === 'ready' && hasData && (
        <>
          <div className="space-y-3">
            {sensorSites.sites.map((site) => {
              const readout = readouts.find((entry) => entry.site === site.id)
              if (!readout) return null
              const selected = selectedSite === site.id
              return (
                <SensorCard
                  key={site.id}
                  site={site}
                  readout={readout}
                  nowMs={nowMs}
                  selected={selected}
                  onSelect={
                    onSelectSite
                      ? () => onSelectSite(selected ? null : site.id)
                      : undefined
                  }
                  onTurn={onTurn ? () => onTurn(site.id) : undefined}
                />
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
