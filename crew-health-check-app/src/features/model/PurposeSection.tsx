import { Card } from '../../components/Card.tsx'
import { ModelScoreNote } from '../../components/ModelScoreNote.tsx'
import type { SepRiskModelFile } from '../../engine/index.ts'
import { ruleById } from '../../lib/labels.ts'

/** What the model does, what its score is not, and what it may do in the app. */
export function PurposeSection({ model }: { model: SepRiskModelFile }) {
  const outlook = ruleById('R-RAD-03')
  const inProgress = ruleById('R-RAD-01')
  return (
    <Card title="What it does">
      <p>
        This model gives a solar flare of class M1.0 or above a score. The app
        shows it from 0 to 100 as an &ldquo;Experimental model score&rdquo;.
      </p>
      <p className="mt-2">
        It is a logistic regression on {model.features.length} features of the
        flare and its linked coronal mass ejection (CME), trained on older years
        of NASA DONKI records and tested once on later years.
      </p>
      <div className="mt-3">
        <ModelScoreNote />
      </div>
      <h3 className="mt-4 font-semibold">What it may do in this app</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          Raise one watch-level alert, &ldquo;{outlook?.title}&rdquo;, when a
          flare in the last 24 hours scores at or above the model&rsquo;s alert
          level.
        </li>
        <li>
          It never raises an act-level alert and never decides who leads the
          response.
        </li>
        <li>
          The alert &ldquo;{inProgress?.title}&rdquo; replaces the outlook.
        </li>
      </ul>
      <h3 className="mt-4 font-semibold">What it was trained to tell apart</h3>
      <p className="mt-1">{model.label}</p>
    </Card>
  )
}
