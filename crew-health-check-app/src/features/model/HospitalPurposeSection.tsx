import { Card } from '../../components/Card.tsx'
import type { EarthHospitalModelFile } from '../../engine/index.ts'
import { crewLabel, indicatorDef } from '../../lib/labels.ts'
import { SECOND_OPINION_TITLE } from '../../link/earthLink.ts'
import { useAppStore } from '../../store/index.ts'
import { selectActiveCrew, selectEvaluation } from '../../store/selectors.ts'

/** Today's raw output for the active crew member, with its meaning; never on the crew card. */
function TodayOutput({ model }: { model: EarthHospitalModelFile }) {
  const evaluation = useAppStore(selectEvaluation)
  const member = useAppStore(selectActiveCrew)
  const insight = evaluation.insights.find(
    (entry) => entry.modelId === model.modelId,
  )
  const who = member ? crewLabel(member) : 'the active crew member'
  if (insight) {
    return (
      <p>
        Today, for {who}: output {insight.score.toFixed(4)}, at or above the
        threshold {model.threshold.toFixed(4)}, so Home shows an insight. The
        output is the model&rsquo;s value for Earth ICU hours; it is not a
        chance of anything for an astronaut.
      </p>
    )
  }
  return (
    <p>
      Today, for {who}: no insight. The model runs only when today&rsquo;s
      readings of all five (
      {model.features
        .map((feature) => indicatorDef(feature.indicator).label)
        .join(', ')}
      ) are in and each has a ready normal, and it shows an insight only at or
      above its threshold.
    </p>
  )
}

/** What the model does, what it learned from, and what it may do in the app. */
export function HospitalPurposeSection({
  model,
}: {
  model: EarthHospitalModelFile
}) {
  return (
    <Card title="What it does">
      <p>
        A logistic regression on five changes from a person&rsquo;s own normal:
        each of today&rsquo;s readings as a z-score against that person&rsquo;s
        baseline, never an absolute value. It learned which combinations of
        changes came before a label in Earth ICU patients.
      </p>
      <h3 className="mt-4 font-semibold">The label it learned</h3>
      <p className="mt-1">{model.label}</p>
      <p className="mt-1 text-slate-700">
        This label is named here, on the model card, so that the model can be
        judged. The crew card never names it, and never shows a number or a
        percentage.
      </p>
      <h3 className="mt-4 font-semibold">What it may do in this app</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          Show an insight headed &ldquo;{model.headline}&rdquo; with the note
          &ldquo;{model.notableText}&rdquo; and the caveat &ldquo;
          {model.caveat}&rdquo;.
        </li>
        <li>
          It never sets a status, never creates or hides an alert, never changes
          who leads the response, and never sends a message by itself.
        </li>
        <li>
          The crew may choose to send an insight to the ground, as a consult
          labeled &ldquo;{SECOND_OPINION_TITLE}&rdquo;.
        </li>
      </ul>
      <h3 className="mt-4 font-semibold">Today</h3>
      <div className="mt-1">
        <TodayOutput model={model} />
      </div>
    </Card>
  )
}
