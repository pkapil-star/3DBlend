import { entryLabel, pinVisibility } from '../../bodyview/pins.ts'
import type { SorenessReport } from '../../bodyview/types.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { useAppStore } from '../../store/index.ts'
import { whenText } from './format.ts'

/**
 * The active crew member's soreness reports, newest first (section 22.5).
 * A report made on another version of the body keeps all its text; its pin
 * is simply not drawn.
 */
export function SorenessList({
  reports,
  model,
  selectedId,
  onSelect,
}: {
  reports: readonly SorenessReport[]
  model: { id: string; version: string } | null
  /** Only with the 3D body shown: selecting a report highlights its pin. */
  selectedId?: string | null
  onSelect?: (reportId: string | null) => void
}) {
  const removeSorenessReport = useAppStore(
    (state) => state.removeSorenessReport,
  )

  return (
    <section aria-labelledby="soreness-list-title" className="space-y-3">
      <h2 id="soreness-list-title" className="text-xl font-semibold">
        Your soreness reports
      </h2>
      {reports.length === 0 ? (
        <p className="text-slate-700">No soreness reported yet.</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const visibility = pinVisibility(report, model)
            const selected = selectedId === report.id
            return (
              <li
                key={report.id}
                className={`rounded-lg border-2 p-3 ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-white'}`}
              >
                <p className="font-semibold">{entryLabel(report)}</p>
                <p className="text-slate-700">
                  Saved at {whenText(report.atMs)}
                </p>
                {visibility === 'drawn' && (
                  <p className="text-slate-700">Pin on the 3D body</p>
                )}
                {visibility === 'other_version' && (
                  <p className="text-slate-700">
                    Made on an earlier version of this body. Text kept.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {onSelect && visibility === 'drawn' && (
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={SECONDARY_BUTTON}
                      onClick={() => onSelect(selected ? null : report.id)}
                    >
                      {selected ? 'Pin highlighted' : 'Highlight pin'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    aria-label={`Remove: ${entryLabel(report)}`}
                    onClick={() => removeSorenessReport(report.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
