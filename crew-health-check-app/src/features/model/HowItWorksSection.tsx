import { Card } from '../../components/Card.tsx'
import { sepRiskScore, type SepRiskModelFile } from '../../engine/index.ts'
import { score, signed } from './format.ts'

// What each feature measures, in plain words. These describe the
// calculation in ml/features.py; they are not claims about health.
const FEATURE_WORDS: Record<string, string> = {
  log10_peak_flux: 'How strong the flare was (its GOES X-ray class)',
  lon_sin: 'How far east or west on the Sun the flare was',
  lon_cos: "How close to the centre of the Sun's disk the flare was",
  log1p_rise_min: 'How long the flare took to reach its peak',
  log1p_duration_min: 'How long the flare lasted',
  has_cme: 'Whether DONKI links a CME analysis to the flare',
  log1p_cme_speed: 'How fast that CME was',
  cme_half_angle_deg: 'How wide that CME was',
}

/** The features, how the score is computed, and how the choices were made. */
export function HowItWorksSection({ model }: { model: SepRiskModelFile }) {
  return (
    <Card title="How it works">
      <p>
        Each feature is measured from its average in the training years,
        multiplied by its coefficient and added to a starting value (the
        intercept, {signed(model.intercept, 4)}). The sum is turned into an
        output between 0 and 1, which the app shows as a score from 0 to 100.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left">
          <caption className="sr-only">
            The features of the model and their coefficients
          </caption>
          <thead>
            <tr className="border-b border-slate-300">
              <th scope="col" className="py-1 pr-3">
                Feature
              </th>
              <th scope="col" className="py-1 pr-3">
                Group
              </th>
              <th scope="col" className="py-1">
                Coefficient
              </th>
            </tr>
          </thead>
          <tbody>
            {model.features.map((feature) => (
              <tr key={feature.name} className="border-b border-slate-200">
                <td className="py-1 pr-3">
                  {FEATURE_WORDS[feature.name] ?? feature.name}
                </td>
                <td className="py-1 pr-3">{feature.group}</td>
                <td className="py-1">{signed(feature.coef, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-slate-700">
        A positive coefficient means a larger value raises the score. A flare
        with no recorded end time uses the typical duration of the training
        years.
      </p>

      <h3 className="mt-4 font-semibold">How the choices were made</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          The averages and coefficients come from the training years (
          {model.data.splits.train.years}) only.
        </li>
        <li>
          The strength of the penalty (C = {model.hyperparameters.C}) and the
          alert level were chosen on the validation years (
          {model.data.splits.validation.years}) only.
        </li>
        <li>
          Alert level rule: {model.thresholdRule}. Value:{' '}
          {score(model.threshold, 4)} on the model&rsquo;s 0 to 1 scale, shown
          as {sepRiskScore(model.threshold)} out of 100.
        </li>
        <li>
          The test years ({model.data.splits.test.years}) were scored once,
          after these choices. Nothing was chosen from them.
        </li>
      </ul>
    </Card>
  )
}
