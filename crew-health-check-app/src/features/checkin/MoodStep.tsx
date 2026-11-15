import { useState, type FormEvent } from 'react'
import { todaysValue, type CheckinRecords } from '../../lib/checkin.ts'
import { indicatorDef } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { StepActions, type StepNavigation } from './StepActions.tsx'
import { StepHelp } from './StepHelp.tsx'

const SCALE = [1, 2, 3, 4, 5] as const
const END_WORDS: Partial<Record<number, string>> = {
  1: 'Very low',
  5: 'Very good',
}

/** Mood on a 1 to 5 tap scale. */
export function MoodStep({
  records,
  navigation,
}: {
  records: CheckinRecords
  navigation: StepNavigation
}) {
  const def = indicatorDef('mood')
  const addReading = useAppStore((state) => state.addReading)
  const [choice, setChoice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todaysValue(records, 'mood')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (choice === null) {
      setError('Choose a number from 1 to 5, or choose Skip for now.')
      return
    }
    addReading('mood', choice)
    navigation.onNext()
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset className="mt-4">
        <legend className="font-semibold">Mood today, from 1 to 5</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCALE.map((value) => (
            <label
              key={value}
              className="flex min-h-14 min-w-14 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-slate-500 px-3 py-1 has-checked:border-slate-900 has-checked:bg-slate-900 has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
            >
              <input
                type="radio"
                name="mood"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
                className="sr-only"
              />
              <span className="text-xl font-semibold">{value}</span>
              {END_WORDS[value] && <span>{END_WORDS[value]}</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {today !== null && (
        <p className="mt-2 text-slate-700">
          Entered today: {today}; a new choice replaces it.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-status-act-fg">
          {error}
        </p>
      )}
      <StepHelp def={def} />
      <StepActions navigation={navigation} />
    </form>
  )
}
