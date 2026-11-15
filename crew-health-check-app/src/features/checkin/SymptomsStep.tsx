import { useState, type FormEvent } from 'react'
import { SYMPTOM_IDS } from '../../engine/schemas.ts'
import type { SymptomId } from '../../engine/index.ts'
import { todaysSymptoms, type CheckinRecords } from '../../lib/checkin.ts'
import { symptomLabel } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { StepActions, type StepNavigation } from './StepActions.tsx'

const OPTION =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-slate-400 px-3'

/**
 * The daily symptom checklist. "None today" is an explicit answer, so that
 * "no symptoms" and "no answer" stay different things (section 8.1).
 */
export function SymptomsStep({
  records,
  navigation,
}: {
  records: CheckinRecords
  navigation: StepNavigation
}) {
  const reportSymptoms = useAppStore((state) => state.reportSymptoms)
  const answered = todaysSymptoms(records)
  const [chosen, setChosen] = useState<SymptomId[]>([])
  const [none, setNone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(symptom: SymptomId) {
    setNone(false)
    setChosen((current) =>
      current.includes(symptom)
        ? current.filter((entry) => entry !== symptom)
        : [...current, symptom],
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (chosen.length === 0 && !none) {
      setError('Tick your symptoms, or tick None today.')
      return
    }
    reportSymptoms(chosen)
    navigation.onNext()
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset className="mt-4">
        <legend className="font-semibold">Symptoms today</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SYMPTOM_IDS.map((symptom) => (
            <label key={symptom} className={OPTION}>
              <input
                type="checkbox"
                className="size-5"
                checked={chosen.includes(symptom)}
                onChange={() => toggle(symptom)}
              />
              {symptomLabel(symptom)}
            </label>
          ))}
          <label className={OPTION}>
            <input
              type="checkbox"
              className="size-5"
              checked={none}
              onChange={() => {
                setNone((current) => !current)
                setChosen([])
              }}
            />
            None today
          </label>
        </div>
      </fieldset>
      {answered !== null && (
        <p className="mt-2 text-slate-700">
          Answered today:{' '}
          {answered.length === 0
            ? 'None today'
            : answered.map(symptomLabel).join(', ')}
          . A new answer replaces it.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-status-act-fg">
          {error}
        </p>
      )}
      <StepActions navigation={navigation} />
    </form>
  )
}
