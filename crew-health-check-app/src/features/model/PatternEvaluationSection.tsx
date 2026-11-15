import { Card } from '../../components/Card.tsx'
import type { PersonalPatternModelFile } from '../../engine/index.ts'
import { percent } from './format.ts'

type Evaluation = PersonalPatternModelFile['evaluation']
type Rate = Evaluation['falseNotice']['model']
type Rates = Evaluation['falseNotice']

const METHODS = [
  ['model', 'This model'],
  ['rulesOnly', 'Rules alone'],
  ['isolationForest', 'IsolationForest'],
] as const

/** "68.9% (620 of 900; 95% interval 65.8% to 71.8%)" */
function counted(rate: Rate): string {
  return `${percent(rate.rate)} (${rate.flagged} of ${rate.of}; 95% interval ${percent(rate.ci95[0])} to ${percent(rate.ci95[1])})`
}

function summaryOf(rates: Rates, size: number): string {
  return `At size ${size}, this model noticed ${percent(rates.model.rate)} of shifted days, the rules alone ${percent(rates.rulesOnly.rate)} and IsolationForest ${percent(rates.isolationForest.rate)}.`
}

/** One shift pattern: a narrow table of percentages, a summary line, then counts and intervals. */
function PatternResults({
  evaluation,
  pattern,
}: {
  evaluation: Evaluation
  pattern: Evaluation['patterns'][number]
}) {
  const rows = evaluation.detection.filter(
    (entry) => entry.pattern === pattern.id,
  )
  const middle = rows[Math.floor(rows.length / 2)]
  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="pb-1 text-left font-semibold">
            {pattern.label}: shifted days noticed
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pr-2">
                Size
              </th>
              {METHODS.map(([key, name]) => (
                <th scope="col" key={key} className="pr-2">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.size} className="border-t border-slate-200">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {row.size}
                </th>
                {METHODS.map(([key]) => (
                  <td key={key} className="py-1 pr-2">
                    {percent(row[key].rate)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {middle && <p className="mt-1">{summaryOf(middle, middle.size)}</p>}
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4">
          Counts and 95% intervals
        </summary>
        <ul className="list-disc space-y-1 pl-5">
          {rows.flatMap((row) =>
            METHODS.map(([key, name]) => (
              <li key={`${row.size}-${key}`}>
                Size {row.size}, {name}: {counted(row[key])}
              </li>
            )),
          )}
        </ul>
      </details>
    </div>
  )
}

/** The simulated evaluation, every number from the model file (section 26.18). */
export function PatternEvaluationSection({
  model,
}: {
  model: PersonalPatternModelFile
}) {
  const evaluation = model.evaluation
  const [firstDay, lastDay] = evaluation.evaluationDays
  return (
    <Card title="Simulated evaluation">
      <p className="font-semibold">
        Simulated data only. These numbers describe the method on this
        project&rsquo;s simulator; they are not results on real crew.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          {evaluation.histories} fictional histories:{' '}
          {evaluation.historiesPerProfile} for each of{' '}
          {evaluation.crewProfiles.length} simulated crew profiles (seed{' '}
          {evaluation.seed}).
        </li>
        <li>
          Each history is checked on one day between mission days {firstDay} and{' '}
          {lastDay}, with a full {evaluation.baselineDays}-day baseline.
        </li>
        <li>
          Shifted copies of the same history add a change for the last{' '}
          {evaluation.shiftDays} days, on top of the same day-to-day noise.
          Sizes: {evaluation.sizes.join(', ')}, {evaluation.sizeUnit}.
        </li>
        <li>
          The rules alone use {evaluation.rulesEvaluated.join(', ')}. Not part
          of the simulation: {evaluation.rulesNotEvaluated.join(', ')}.
        </li>
        <li>
          IsolationForest is a benchmark with scikit-learn&rsquo;s default
          settings ({evaluation.isolationForest.nEstimators} trees), fitted on
          the same baseline days.
        </li>
      </ul>

      <h3 className="mt-4 font-semibold">Notices on ordinary days</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {METHODS.map(([key, name]) => (
          <li key={key}>
            {name}: {counted(evaluation.falseNotice[key])}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        If today were just like the {evaluation.baselineDays} baseline days, it
        would be the most unusual of {evaluation.baselineDays + 1} days about{' '}
        {percent(evaluation.chanceIfExchangeable)} of the time.
      </p>

      <h3 className="mt-4 font-semibold">Shifted days noticed</h3>
      {evaluation.patterns.map((pattern) => (
        <PatternResults
          key={pattern.id}
          evaluation={evaluation}
          pattern={pattern}
        />
      ))}
    </Card>
  )
}
