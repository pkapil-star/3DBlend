import { useState, type FormEvent } from 'react'
import { lastReadingPerDay, type IndicatorDef } from '../../engine/index.ts'
import {
  todaysValue,
  type CheckinRecords,
  type CheckinStep,
} from '../../lib/checkin.ts'
import { formatValue, indicatorDef } from '../../lib/labels.ts'
import { parseReadingInput } from '../../lib/readingInput.ts'
import { useAppStore } from '../../store/index.ts'
import { StepActions, type StepNavigation } from './StepActions.tsx'
import { StepHelp } from './StepHelp.tsx'

function yesterdaysValue(
  records: CheckinRecords,
  def: IndicatorDef,
): number | null {
  const own = records.readings.filter(
    (reading) => reading.crewId === records.crewId,
  )
  const yesterday = lastReadingPerDay(own, def.id).find(
    (entry) => entry.day === records.today - 1,
  )
  return yesterday?.value ?? null
}

interface FieldProps {
  def: IndicatorDef
  records: CheckinRecords
  text: string
  error: string | undefined
  onChange: (text: string) => void
}

function NumberField({ def, records, text, error, onChange }: FieldProps) {
  const inputId = `checkin-${def.id}`
  const yesterday = yesterdaysValue(records, def)
  const today = todaysValue(records, def.id)
  return (
    <div className="mt-4">
      <label htmlFor={inputId} className="block font-semibold">
        {def.label}
        {def.unit !== '' && <span className="font-normal"> ({def.unit})</span>}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        step={def.step}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
        className="mt-1 min-h-11 w-40 rounded-lg border-2 border-slate-500 px-3 text-xl"
      />
      <p id={`${inputId}-hint`} className="mt-1 text-slate-700">
        {yesterday !== null
          ? `Yesterday: ${formatValue(yesterday, def)}.`
          : 'No value from yesterday.'}
        {today !== null &&
          ` Entered today: ${formatValue(today, def)}; a new value replaces it.`}
      </p>
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1 font-semibold text-status-act-fg"
        >
          {error}
        </p>
      )}
      <StepHelp def={def} />
    </div>
  )
}

/** A step with one or two typed readings (blood pressure has two). */
export function NumberStep({
  step,
  records,
  navigation,
}: {
  step: CheckinStep
  records: CheckinRecords
  navigation: StepNavigation
}) {
  const addReading = useAppStore((state) => state.addReading)
  const defs = step.indicators.map(indicatorDef)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = defs.map((def) => ({
      def,
      result: parseReadingInput(texts[def.id] ?? '', def),
    }))
    const found: Record<string, string> = {}
    for (const { def, result } of parsed) {
      if (!result.ok) found[def.id] = result.message
    }
    setErrors(found)
    // Nothing is saved unless every value on the step is valid.
    if (Object.keys(found).length > 0) return
    for (const { def, result } of parsed) {
      if (result.ok) addReading(def.id, result.value)
    }
    navigation.onNext()
  }

  return (
    <form onSubmit={submit} noValidate>
      {defs.map((def) => (
        <NumberField
          key={def.id}
          def={def}
          records={records}
          text={texts[def.id] ?? ''}
          error={errors[def.id]}
          onChange={(text) =>
            setTexts((current) => ({ ...current, [def.id]: text }))
          }
        />
      ))}
      <StepActions navigation={navigation} />
    </form>
  )
}
