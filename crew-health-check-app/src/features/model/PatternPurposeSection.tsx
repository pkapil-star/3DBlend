import { Card } from '../../components/Card.tsx'
import type { PersonalPatternModelFile } from '../../engine/index.ts'
import { readinessWords } from '../../lib/insights.ts'
import { crewLabel } from '../../lib/labels.ts'
import { SECOND_OPINION_TITLE } from '../../link/earthLink.ts'
import { useAppStore } from '../../store/index.ts'
import { selectActiveCrew, selectEvaluation } from '../../store/selectors.ts'

/**
 * Today's raw score for the active crew member, with its meaning. The crew
 * card never shows this number (section 26.17); the model card does.
 */
function TodayScore({ model }: { model: PersonalPatternModelFile }) {
  const evaluation = useAppStore(selectEvaluation)
  const member = useAppStore(selectActiveCrew)
  const insight = evaluation.insights.find(
    (entry) => entry.modelId === model.modelId,
  )
  const who = member ? crewLabel(member) : 'the active crew member'
  if (insight) {
    return (
      <p>
        Today, for {who}: score {insight.score.toFixed(2)}. A score above 1
        means today is more unusual than every day in the recent baseline: it is
        today&rsquo;s distance divided by the largest leave-one-out distance of
        the baseline days. It is not a percentage or a chance.
      </p>
    )
  }
  const readiness = evaluation.patternReadiness
  return (
    <p>
      Today, for {who}: no insight.
      {readiness && ` ${readinessWords(readiness).line}.`}
    </p>
  )
}

/** What the model does, and what it may and may not do in the app. */
export function PatternPurposeSection({
  model,
}: {
  model: PersonalPatternModelFile
}) {
  return (
    <Card title="What it does">
      <p>{model.label}</p>
      <p className="mt-2">
        It looks at a crew member&rsquo;s daily readings together and asks
        whether today&rsquo;s combination is unusual for this person. It learns
        on board from their own readings and needs no outside data.
      </p>
      <h3 className="mt-4 font-semibold">What it may do in this app</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          Show an insight headed &ldquo;{model.headline}&rdquo; on Home, with
          the note &ldquo;{model.notableText}&rdquo;, and under the body areas
          of its readings.
        </li>
        <li>
          It never sets a status, never creates or hides an alert, never changes
          who leads the response, and never sends a message by itself.
        </li>
        <li>
          The crew may choose to send an insight to the ground. It goes as a
          consult labeled &ldquo;{SECOND_OPINION_TITLE}&rdquo;.
        </li>
      </ul>
      <p className="mt-3">Every insight carries this note: {model.caveat}</p>
      <h3 className="mt-4 font-semibold">Today</h3>
      <div className="mt-1">
        <TodayScore model={model} />
      </div>
    </Card>
  )
}
