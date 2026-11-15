import { Card } from '../../components/Card.tsx'
import type { SepRiskModelFile } from '../../engine/index.ts'
import { percent, score } from './format.ts'

type Bin = SepRiskModelFile['metrics']['reliability'][number]

/** What one filled bin shows: outputs too high, too low, or in line. */
function binFinding(bin: Bin): string | null {
  if (bin.n === 0 || bin.meanPredicted === null || bin.observed === null) {
    return null
  }
  const range = `${bin.binFrom.toFixed(1)} to ${bin.binTo.toFixed(1)}`
  const numbers = `mean output ${percent(bin.meanPredicted)}, ${percent(bin.observed)} of those flares were positive (${bin.n} flares)`
  if (bin.meanPredicted > bin.observed) {
    return `Outputs from ${range} were too high: ${numbers}.`
  }
  if (bin.meanPredicted < bin.observed) {
    return `Outputs from ${range} were too low: ${numbers}.`
  }
  return `Outputs from ${range} matched: ${numbers}.`
}

/**
 * Why the app shows a score and not a percent chance: on the test years the
 * model's output did not match how often flares were positive.
 */
export function CalibrationSection({ model }: { model: SepRiskModelFile }) {
  const { reliability, test } = model.metrics
  const { splits } = model.data
  const share = (name: 'train' | 'validation' | 'test') =>
    percent(splits[name].positives / splits[name].n)
  const findings = reliability
    .map(binFinding)
    .filter((line): line is string => line !== null)
  return (
    <Card title="Why it is a score, not a percent chance">
      <p>
        A well calibrated model that outputs 0.30 would be right about 30 times
        in 100. On the test years this model&rsquo;s output did not match what
        was recorded:
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-left">
          <caption className="sr-only">
            Model output compared with the share of positive flares, test years
          </caption>
          <thead>
            <tr className="border-b border-slate-300">
              <th scope="col" className="py-1 pr-3">
                Model output
              </th>
              <th scope="col" className="py-1 pr-3">
                Flares
              </th>
              <th scope="col" className="py-1 pr-3">
                Mean output
              </th>
              <th scope="col" className="py-1">
                Share positive
              </th>
            </tr>
          </thead>
          <tbody>
            {reliability.map((bin) => (
              <tr key={bin.binFrom} className="border-b border-slate-200">
                <th scope="row" className="py-1 pr-3 font-normal">
                  {bin.binFrom.toFixed(1)} to {bin.binTo.toFixed(1)}
                </th>
                <td className="py-1 pr-3">{bin.n}</td>
                <td className="py-1 pr-3">
                  {bin.n === 0 ? 'no flares' : percent(bin.meanPredicted)}
                </td>
                <td className="py-1">
                  {bin.n === 0 ? 'no flares' : percent(bin.observed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {findings.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2">
        One reason: positive flares are a smaller share of the recent years.
        Share positive: {share('train')} in the training years,{' '}
        {share('validation')} in the validation years and {share('test')} in the
        test years.
      </p>

      <h3 className="mt-4 font-semibold">Brier skill score</h3>
      <p className="mt-1">
        It compares the model&rsquo;s squared error with a constant forecast;
        above 0 is better than that forecast.
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          Against always forecasting the training share (
          {percent(model.comparisons.climatology.trainingBaseRate)}):{' '}
          {score(test.brierSkill)}. This reference is easy to beat, because the
          test years have far fewer positives.
        </li>
        <li>
          Against the test years&rsquo; own share, which nobody could know in
          advance: {score(test.brierSkillVsOwnBaseRate)}.
        </li>
      </ul>
    </Card>
  )
}
