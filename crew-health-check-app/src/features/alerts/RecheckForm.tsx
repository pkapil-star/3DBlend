import { useId, useState, type FormEvent } from 'react'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { PRIMARY_BUTTON } from '../../components/buttonStyles.ts'
import {
  isRecheck,
  recheckName,
  type IndicatorDef,
} from '../../engine/index.ts'
import { formatValue } from '../../lib/labels.ts'
import { parseReadingInput } from '../../lib/readingInput.ts'
import { useAppStore } from '../../store/index.ts'
import { selectToday } from '../../store/selectors.ts'

/**
 * An urgent re-check asked for by the steps (section 10). It is stored with
 * `purpose: "recheck"`: it counts for this alert, but never enters or replaces
 * the routine readings a baseline is built from. A blood sugar re-check is not
 * a fasting value.
 */
export function RecheckForm({ def }: { def: IndicatorDef }) {
  const addReading = useAppStore((state) => state.addReading)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const readings = useAppStore((state) => state.readings)
  const today = useAppStore(selectToday)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const name = recheckName(def)
  const todaysRechecks = readings.filter(
    (reading) =>
      reading.crewId === crewId &&
      reading.indicator === def.id &&
      reading.day === today &&
      isRecheck(reading),
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseReadingInput(text, def, 'Enter the re-check value.')
    if (!parsed.ok) {
      setError(parsed.message)
      setSaved(null)
      return
    }
    const result = addReading(def.id, parsed.value, 'recheck')
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setText('')
    setSaved(`Re-check saved: ${formatValue(parsed.value, def)}.`)
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-4 rounded-lg border border-slate-300 p-3"
    >
      <h3 className="font-semibold">Urgent re-check</h3>
      <p id={hintId} className="mt-1 text-slate-700">
        Enter a re-check here when the steps ask for one. It is not your routine
        daily measurement: it counts for this alert only and never changes your
        normal.
      </p>
      <label htmlFor={inputId} className="mt-2 block font-semibold">
        {name}, in {def.unit}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step={def.step}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="min-h-11 w-40 rounded-lg border-2 border-slate-500 px-3 text-xl"
        />
        <button type="submit" className={PRIMARY_BUTTON}>
          Save re-check
        </button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 font-semibold text-status-act-fg"
        >
          {error}
        </p>
      )}
      <p role="status" className="mt-2">
        {saved}
      </p>
      {todaysRechecks.length > 0 && (
        <p className="mt-1">
          Re-checks today:{' '}
          {todaysRechecks
            .map(
              (reading) =>
                `${formatValue(reading.value, def)} at ${formatTimeOfDay(reading.atMs)}`,
            )
            .join(', ')}
        </p>
      )}
    </form>
  )
}
