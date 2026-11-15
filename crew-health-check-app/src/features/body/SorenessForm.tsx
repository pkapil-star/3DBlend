import { useState, type FormEvent, type RefObject } from 'react'
import { entryLabel, type ReportProblem } from '../../bodyview/pins.ts'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../../components/buttonStyles.ts'
import { SourceLink } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import { bodyAreas } from '../../data/bodyView.ts'
import { useAppStore } from '../../store/index.ts'
import { ScoreField } from './ScoreField.tsx'
import {
  EMPTY_DRAFT,
  draftToInput,
  toAreaChoice,
  withArea,
  type AreaChoice,
  type SorenessDraft,
} from './sorenessDraft.ts'

const PROBLEM_TEXT: Record<ReportProblem, string> = {
  score: 'Enter a whole number from 0 to 10.',
  location: 'Describe where it is sore.',
  anchor: 'The pin could not be kept. Remove the pin and save again.',
}

const FIELD = 'min-h-11 w-full rounded-lg border-2 border-slate-500 px-3'

/** The soreness form, always available and keyboard first (section 22.5). */
export function SorenessForm({
  draft,
  setDraft,
  locationRef,
  placementUnchecked = false,
}: {
  draft: SorenessDraft
  setDraft: (draft: SorenessDraft) => void
  locationRef: RefObject<HTMLInputElement | null>
  /** True while the 3D patch is shown and its placement was not checked (section 22.4). */
  placementUnchecked?: boolean
}) {
  const addSorenessReport = useAppStore((state) => state.addSorenessReport)
  const [problems, setProblems] = useState<ReportProblem[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const named = bodyAreas.named.find((area) => area.id === draft.area)

  function chooseArea(area: AreaChoice) {
    setDraft(withArea(draft, area))
    if (area === 'other') locationRef.current?.focus()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = addSorenessReport(draftToInput(draft))
    if (!result.ok) {
      setProblems(result.problems)
      setSaved(null)
      if (result.problems.includes('location')) locationRef.current?.focus()
      return
    }
    setProblems([])
    setSaved(`Saved: ${entryLabel(result.report)}`)
    setDraft(EMPTY_DRAFT)
  }

  const has = (problem: ReportProblem) => problems.includes(problem)

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      aria-labelledby="soreness-form-title"
    >
      <h2 id="soreness-form-title" className="text-xl font-semibold">
        Report soreness
      </h2>
      <div className="space-y-2">
        <label htmlFor="soreness-area" className="block font-semibold">
          Where is it sore?
        </label>
        <p id="soreness-area-hint" className="text-slate-700">
          Left and right mean your own left and right.
        </p>
        <select
          id="soreness-area"
          value={draft.area}
          aria-describedby="soreness-area-hint"
          onChange={(event) => chooseArea(toAreaChoice(event.target.value))}
          className={`${FIELD} bg-white`}
        >
          <option value="">Choose an area</option>
          <optgroup label="Named area">
            {bodyAreas.named.map((area) => (
              <option key={area.id} value={area.id}>
                {area.label} ({area.detail})
              </option>
            ))}
          </optgroup>
          <optgroup label="General areas">
            {bodyAreas.general.map((area) => (
              <option key={area.id} value={area.id}>
                {area.label}
              </option>
            ))}
          </optgroup>
          <option value="other">Other, describe it</option>
        </select>
        {named && (
          <p className="flex flex-wrap items-center gap-2 text-slate-700">
            <span>
              {named.label} · {named.detail}. Source:
            </span>
            {named.sourceIds.map((id) => (
              <SourceLink key={id} sourceId={id} />
            ))}
            {placementUnchecked && <Tag>Placement not yet checked</Tag>}
          </p>
        )}
      </div>
      {draft.anchor !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="font-semibold">Pin placed on the 3D body</p>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => setDraft({ ...draft, anchor: null })}
          >
            Remove pin
          </button>
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="soreness-location" className="block font-semibold">
          Describe the place
        </label>
        <input
          id="soreness-location"
          ref={locationRef}
          type="text"
          value={draft.locationText}
          onChange={(event) =>
            setDraft({ ...draft, locationText: event.target.value })
          }
          aria-invalid={has('location')}
          aria-describedby={
            has('location') ? 'soreness-location-error' : undefined
          }
          className={FIELD}
        />
        {has('location') && (
          <p id="soreness-location-error" className="font-semibold">
            {PROBLEM_TEXT.location}
          </p>
        )}
      </div>
      <ScoreField
        value={draft.score}
        onChange={(score) => setDraft({ ...draft, score })}
        invalid={has('score')}
        errorId="soreness-score-error"
      />
      {has('score') && (
        <p id="soreness-score-error" className="font-semibold">
          {PROBLEM_TEXT.score}
        </p>
      )}
      <div className="space-y-2">
        <label htmlFor="soreness-note" className="block font-semibold">
          Activity note (optional)
        </label>
        <input
          id="soreness-note"
          type="text"
          placeholder="For example: after overhead work"
          value={draft.activityNote}
          onChange={(event) =>
            setDraft({ ...draft, activityNote: event.target.value })
          }
          className={FIELD}
        />
      </div>
      {has('anchor') && <p className="font-semibold">{PROBLEM_TEXT.anchor}</p>}
      <button type="submit" className={PRIMARY_BUTTON}>
        Save
      </button>
      <p role="status" className="font-semibold">
        {saved}
      </p>
    </form>
  )
}
