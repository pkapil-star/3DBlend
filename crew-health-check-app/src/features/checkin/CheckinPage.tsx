import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CHECKIN_STEPS,
  checkinProgress,
  type CheckinRecords,
} from '../../lib/checkin.ts'
import { useAppStore } from '../../store/index.ts'
import { selectToday } from '../../store/selectors.ts'
import { CheckinSummary } from './CheckinSummary.tsx'
import { MoodStep } from './MoodStep.tsx'
import { NumberStep } from './NumberStep.tsx'
import { StepActions, type StepNavigation } from './StepActions.tsx'
import { SymptomsStep } from './SymptomsStep.tsx'

const SUMMARY_INDEX = CHECKIN_STEPS.length

function useCheckinRecords(): CheckinRecords {
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const today = useAppStore(selectToday)
  const readings = useAppStore((state) => state.readings)
  const symptoms = useAppStore((state) => state.symptoms)
  const noSymptomDays = useAppStore((state) => state.noSymptomDays)
  return { crewId, today, readings, symptoms, noSymptomDays }
}

function ComingSoonStep({ navigation }: { navigation: StepNavigation }) {
  function submit(event: FormEvent) {
    event.preventDefault()
    navigation.onNext()
  }
  return (
    <form onSubmit={submit}>
      <p className="mt-4">
        Reaction test: coming soon. There is nothing to enter yet.
      </p>
      <StepActions
        navigation={navigation}
        submitLabel="Continue"
        skippable={false}
      />
    </form>
  )
}

/** The guided daily check (ARCHITECTURE.md section 19.2): one step at a time, in a fixed order. */
export function CheckinPage() {
  const records = useCheckinRecords()
  const [index, setIndex] = useState(() => {
    const first = checkinProgress(records).firstOpenIndex
    return first === -1 ? SUMMARY_INDEX : first
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // Move focus to the new step's heading, so keyboard and screen reader users
  // land on it. Not on the first render: that would steal focus on page load.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    heading.current?.focus()
  }, [index])

  const step = CHECKIN_STEPS[index]
  const navigation: StepNavigation = {
    onNext: () => setIndex((current) => Math.min(SUMMARY_INDEX, current + 1)),
    onBack:
      index > 0 ? () => setIndex((current) => Math.max(0, current - 1)) : null,
  }

  return (
    <section aria-labelledby="checkin-heading" className="max-w-2xl">
      <h1 id="checkin-heading" className="text-2xl font-semibold">
        Daily check-in
      </h1>
      <h2 ref={heading} tabIndex={-1} className="mt-3 text-xl font-semibold">
        {step
          ? `Step ${index + 1} of ${CHECKIN_STEPS.length}: ${step.title}`
          : 'Summary of today'}
      </h2>

      {!step && (
        <CheckinSummary
          records={records}
          onBack={() => setIndex(SUMMARY_INDEX - 1)}
        />
      )}
      {step?.kind === 'number' && (
        <NumberStep
          key={step.id}
          step={step}
          records={records}
          navigation={navigation}
        />
      )}
      {step?.kind === 'scale' && (
        <MoodStep records={records} navigation={navigation} />
      )}
      {step?.kind === 'symptoms' && (
        <SymptomsStep records={records} navigation={navigation} />
      )}
      {step?.kind === 'coming_soon' && (
        <ComingSoonStep navigation={navigation} />
      )}
    </section>
  )
}
