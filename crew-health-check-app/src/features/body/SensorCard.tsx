import { Check, CircleDashed, Clock, Unplug } from 'lucide-react'
import { SENSOR_TAG, trendText } from '../../bodyview/sensors.ts'
import type { SensorReadout, SensorSite } from '../../bodyview/types.ts'
import { SourceList } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import { sensorSites } from '../../data/bodyView.ts'
import { agoText, formatTempC, whenText } from './format.ts'

function contactLine(readout: SensorReadout) {
  if (readout.contact === 'no_data') {
    return { Icon: CircleDashed, text: 'No samples yet' }
  }
  if (readout.contact === 'lost') {
    return {
      Icon: Unplug,
      text: 'Contact lost: the sensor is not touching the skin',
    }
  }
  if (readout.current === null) {
    return {
      Icon: Clock,
      text: `No new sample in the last ${sensorSites.staleAfterMin} minutes`,
    }
  }
  return { Icon: Check, text: 'Sensor contact OK' }
}

/**
 * One simulated suit sensor (section 22.6). Neutral styling, never status
 * colours: a skin temperature here is a local surface reading, not a health
 * status. A lost or stale sensor never shows a value as current.
 */
export function SensorCard({
  site,
  readout,
  nowMs,
  selected = false,
  onSelect,
  onTurn,
}: {
  site: SensorSite
  readout: SensorReadout
  nowMs: number
  selected?: boolean
  onSelect?: () => void
  /** Offered while this card is selected and the 3D body is shown. */
  onTurn?: () => void
}) {
  const { Icon, text } = contactLine(readout)
  const trend = trendText(readout, sensorSites.trendWindowMin)
  const titleId = `sensor-${site.id}-title`

  return (
    <article
      aria-labelledby={titleId}
      className={`space-y-2 rounded-lg border-2 p-4 ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-white'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {site.label}
        </h3>
        <Tag>{SENSOR_TAG}</Tag>
      </div>
      {readout.current ? (
        <p>
          <span className="text-2xl font-semibold">
            {formatTempC(readout.current.tempC)}
          </span>{' '}
          <span className="text-slate-700">
            at {whenText(readout.current.atMs)}
          </span>
        </p>
      ) : (
        <p className="text-xl font-semibold">No current reading</p>
      )}
      {readout.current === null && readout.lastValid !== null && (
        <p>
          Last valid reading: {formatTempC(readout.lastValid.tempC)} at{' '}
          {whenText(readout.lastValid.atMs)} (
          {agoText(nowMs, readout.lastValid.atMs)})
        </p>
      )}
      <p className="flex items-center gap-2">
        <Icon aria-hidden="true" size={20} />
        <span>{text}</span>
      </p>
      {trend && <p>{trend}</p>}
      <p className="text-slate-700">{sensorSites.cardNote}</p>
      <SourceList sourceIds={site.sourceIds} />
      {onSelect && (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className="inline-flex min-h-11 items-center rounded-lg border-2 border-slate-700 px-4 font-semibold"
        >
          {selected ? 'Marker highlighted' : 'Highlight marker'}
        </button>
      )}
      {selected && onTurn && (
        <button
          type="button"
          onClick={onTurn}
          className="ml-2 inline-flex min-h-11 items-center rounded-lg border-2 border-slate-700 px-4 font-semibold"
        >
          Turn to this sensor
        </button>
      )}
    </article>
  )
}
