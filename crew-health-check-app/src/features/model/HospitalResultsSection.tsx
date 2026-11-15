import { Card } from '../../components/Card.tsx'
import type { EarthHospitalModelFile } from '../../engine/index.ts'
import { interval, percent, score } from './format.ts'

type Scores = EarthHospitalModelFile['metrics']['test']

const FINDING_WORDS = {
  higher: 'the shipped model was higher; the whole interval is above zero',
  lower: 'the shipped model was lower; the whole interval is below zero',
  inconclusive:
    'inconclusive: the interval includes zero, so this test cannot tell the two apart. This is no evidence that they perform equally',
} as const

function ResultLines({ name, scores }: { name: string; scores: Scores }) {
  const { intervals } = scores
  return (
    <li>
      <span className="font-semibold">{name}:</span> ROC AUC{' '}
      {score(scores.rocAuc)} (95% interval {interval(intervals.rocAuc)});
      labelled hours caught {percent(scores.sensitivity)} (
      {percent(intervals.sensitivity[0])} to {percent(intervals.sensitivity[1])}
      ); unlabelled hours flagged {percent(scores.falsePositiveRate)} (
      {percent(intervals.falsePositiveRate[0])} to{' '}
      {percent(intervals.falsePositiveRate[1])}); TSS {score(scores.tss)} (
      {interval(intervals.tss)}).
    </li>
  )
}

/** Results at the operating point, the comparisons and the sanity check in simulation. */
export function HospitalResultsSection({
  model,
}: {
  model: EarthHospitalModelFile
}) {
  const { metrics, comparisons } = model
  const best = metrics.highestTssOnValidation
  const patients = metrics.testPatients
  return (
    <Card title="How well it did">
      <p>
        Operating point: threshold {model.threshold.toFixed(4)}.{' '}
        {model.thresholdRule}
      </p>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <ResultLines name="Hospital A validation" scores={metrics.validation} />
        <ResultLines
          name="Hospital B, the external test, scored once"
          scores={metrics.test}
        />
      </ul>
      <p className="mt-2">
        Hospital B patients: {patients.ofThemFlaggedAtLeastOnce} of{' '}
        {patients.patientsWithLabel} with a labelled hour had at least one
        flagged hour; {patients.ofThemFlaggedAtLeastOnceWithout} of{' '}
        {patients.patientsWithoutLabel} without one did too.
      </p>
      <p className="mt-2">
        For comparison, the highest-TSS point on validation (TSS{' '}
        {score(best.tss)}) would flag {percent(best.falsePositiveRate)} of
        unlabelled hours: too many for a second opinion that must stay quiet.
      </p>
      <h3 className="mt-4 font-semibold">Comparisons on hospital B</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {(
          [
            ['Temperature change alone', comparisons.temperatureOnly],
            ['Gradient boosting benchmark', comparisons.gradientBoosting],
          ] as const
        ).map(([name, entry]) => (
          <li key={name}>
            {name}: ROC AUC {score(entry.test.rocAuc)}. Shipped minus this:{' '}
            {score(entry.shippedMinusThis.test.rocAuc.value)} (95% interval{' '}
            {interval(entry.shippedMinusThis.test.rocAuc.ci95)}):{' '}
            {FINDING_WORDS[entry.shippedMinusThis.test.rocAuc.finding]}.
          </li>
        ))}
      </ul>
      <p className="mt-2 text-slate-700">
        Intervals resample patients, not hours: {metrics.bootstrap.used} of{' '}
        {metrics.bootstrap.resamples} resamples, seed {metrics.bootstrap.seed}.
      </p>
      <h3 className="mt-4 font-semibold">Sanity check in simulation</h3>
      <p className="mt-1">{model.scenarioCheck.note}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {model.scenarioCheck.fever.map((entry) => (
          <li key={`${entry.crewId}-${entry.moment}`}>
            Fever scenario, {entry.crewId}, {entry.moment} (day {entry.day}):{' '}
            {entry.scored && entry.output !== null
              ? `output ${entry.output.toFixed(4)}: ${entry.notable ? 'an insight' : 'no insight'}`
              : 'not scored, because there are no readings for that day at 09:00'}
            .
          </li>
        ))}
      </ul>
    </Card>
  )
}
