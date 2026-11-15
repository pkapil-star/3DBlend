import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../../components/buttonStyles.ts'

export interface StepNavigation {
  onNext: () => void
  onBack: (() => void) | null
}

/** Back, Skip for now, and the step's main button. Skipped items stay due. */
export function StepActions({
  navigation,
  submitLabel = 'Save and continue',
  skippable = true,
}: {
  navigation: StepNavigation
  submitLabel?: string
  skippable?: boolean
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="submit" className={PRIMARY_BUTTON}>
        {submitLabel}
      </button>
      {skippable && (
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={navigation.onNext}
        >
          Skip for now
        </button>
      )}
      {navigation.onBack && (
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={navigation.onBack}
        >
          Back
        </button>
      )}
    </div>
  )
}
