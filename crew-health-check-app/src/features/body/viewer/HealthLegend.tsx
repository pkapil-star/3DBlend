import type {
  OverlayRegion,
  OverlayStatus,
} from '../../../bodyview/healthOverlay.ts'
import { PARTS_TEXT } from '../../../bodyview/healthOverlay.ts'
import { SECONDARY_BUTTON } from '../../../components/buttonStyles.ts'
import { StatusBadge } from '../../../components/StatusBadge.tsx'
import { Tag } from '../../../components/Tag.tsx'

export interface LegendRow {
  region: OverlayRegion
  label: string
  status: OverlayStatus
  /** A second-opinion insight today names an indicator of this region. */
  insight: boolean
}

/**
 * The health overlay's controls and legend (section 22.12). The colours on
 * the body always come with this list, which gives each status as colour,
 * icon and word.
 */
export function HealthLegend(props: {
  rows: readonly LegendRow[]
  on: boolean
  onToggle: (on: boolean) => void
  canShowOrgans: boolean
  onShowAffected: () => void
  identify: boolean
  onIdentify: (on: boolean) => void
  picked: string | null
}) {
  const affected = props.rows.some(
    (row) => row.status === 'watch' || row.status === 'act',
  )
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-300 p-3">
      <legend className="px-1 font-semibold">Health status on the body</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={props.on}
          onChange={(event) => props.onToggle(event.target.checked)}
          className="size-5"
        />
        Colour the body by today&apos;s status
      </label>
      <p className="text-slate-700">
        Each area takes the status of its region on the Home screen, from your
        check-in compared with your own usual range. The colours show where to
        look; the region screens explain why.
      </p>
      {props.on && (
        <ul className="space-y-2">
          {props.rows.map((row) => (
            <li key={row.region} className="flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status} />
              <span className="font-semibold">{row.label}:</span>
              <span className="text-slate-700">{PARTS_TEXT[row.region]}</span>
              {row.insight && <Tag>Insight</Tag>}
            </li>
          ))}
        </ul>
      )}
      {props.on && props.canShowOrgans && affected && (
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={props.onShowAffected}
        >
          Show the organs behind each Watch or Act
        </button>
      )}
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={props.identify}
          onChange={(event) => props.onIdentify(event.target.checked)}
          className="size-5"
        />
        Tap to name a part (no pin is placed)
      </label>
      {props.identify && (
        <p aria-live="polite" className="font-semibold">
          {props.picked ?? 'Tap a part of the body to see its name.'}
        </p>
      )}
    </fieldset>
  )
}
