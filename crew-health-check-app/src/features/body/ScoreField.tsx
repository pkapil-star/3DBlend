import type { KeyboardEvent } from 'react'
import {
  SORENESS_SCORE_MAX,
  SORENESS_SCORE_MIN,
} from '../../bodyview/schemas.ts'

const STEP_BY_KEY = new Map([
  ['ArrowRight', 1],
  ['ArrowUp', 1],
  ['ArrowLeft', -1],
  ['ArrowDown', -1],
])

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return SORENESS_SCORE_MIN
  return Math.min(
    SORENESS_SCORE_MAX,
    Math.max(SORENESS_SCORE_MIN, Math.round(value)),
  )
}

/**
 * The 0 to 10 soreness score as a slider and a number field bound to the same
 * value (section 22.5). The slider steps with the arrow keys itself, exactly
 * as browsers do, so keyboard use behaves the same everywhere.
 */
export function ScoreField({
  value,
  onChange,
  invalid,
  errorId,
}: {
  value: string
  onChange: (value: string) => void
  invalid: boolean
  errorId: string
}) {
  const sliderValue = clampScore(Number(value))

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    const step = STEP_BY_KEY.get(event.key)
    if (step === undefined) return
    event.preventDefault()
    onChange(String(clampScore(sliderValue + step)))
  }

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Soreness score</legend>
      <p id="soreness-score-hint" className="text-slate-700">
        0 means no soreness, 10 means the worst you can imagine.
      </p>
      <input
        type="range"
        aria-label="Soreness score, slider"
        aria-describedby="soreness-score-hint"
        min={SORENESS_SCORE_MIN}
        max={SORENESS_SCORE_MAX}
        step={1}
        value={sliderValue}
        onKeyDown={onSliderKey}
        onChange={(event) => onChange(event.target.value)}
        className="block h-11 w-full max-w-sm accent-slate-800"
      />
      <label className="flex flex-wrap items-center gap-3">
        <span>Score from 0 to 10</span>
        <input
          type="number"
          inputMode="numeric"
          min={SORENESS_SCORE_MIN}
          max={SORENESS_SCORE_MAX}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : 'soreness-score-hint'}
          className="min-h-11 w-24 rounded-lg border-2 border-slate-500 px-3 text-xl"
        />
      </label>
    </fieldset>
  )
}
