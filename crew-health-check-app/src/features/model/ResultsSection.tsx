import { Card } from '../../components/Card.tsx'
import type { SepRiskModelFile } from '../../engine/index.ts'
import { findingOf, interval, percent, score, signed } from './format.ts'

type Comparison = SepRiskModelFile['comparisons']['classOnly']

/** One sentence on what a difference interval allows us to say. */
function findingWords(
  what: string,
  difference: number,
  ci: readonly [number, number],
): string {
  const numbers = `${signed(difference)} (95% interval ${interval(ci)})`
  switch (findingOf(ci)) {
    case 'higher':
      return `${what}: the shipped model was higher by ${numbers}. The whole interval is above zero.`
    case 'lower':
      return `${what}: the shipped model was lower by ${numbers}. The whole interval is below zero.`
    case 'inconclusive':
      return `${what}: inconclusive. The difference is ${numbers}, and the interval includes zero, so these test years cannot tell the two models apart. This is not evidence that they perform equally.`
  }
}

function ComparisonItem({
  name,
  comparison,
}: {
  name: string
  comparison: Comparison
}) {
  const { test, shippedMinusThis } = comparison
  return (
    <li>
      <span className="font-semibold">{name}:</span> ROC AUC{' '}
      {score(test.rocAuc)} ({interval(test.rocAucCi95)}), TSS {score(test.tss)}{' '}
      ({interval(test.tssCi95)}).
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          {findingWords(
            'ROC AUC',
            shippedMinusThis.rocAuc,
            shippedMinusThis.rocAucCi95,
          )}
        </li>
        <li>
          {findingWords('TSS', shippedMinusThis.tss, shippedMinusThis.tssCi95)}
        </li>
      </ul>
    </li>
  )
}

/** How the model did on the held-out test years, and against the two comparison models. */
export function ResultsSection({ model }: { model: SepRiskModelFile }) {
  const { test, validation, testFlaggedAtThreshold, bootstrap } = model.metrics
  const { splits } = model.data
  const counts = test.confusion
  const positives = counts.tp + counts.fn
  return (
    <Card title="How well it did on the held-out years">
      <p>
        The test years ({splits.test.years}) were kept aside: {splits.test.n}{' '}
        flares, {splits.test.positives} of them positive.
      </p>

      <h3 className="mt-4 font-semibold">At the alert level</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          Flagged {testFlaggedAtThreshold.flagged} of the{' '}
          {testFlaggedAtThreshold.of} test flares.
        </li>
        <li>
          Caught {counts.tp} of the {positives} positive flares (
          {percent(test.recall)}); missed {counts.fn}.
        </li>
        <li>
          <span className="font-semibold">
            {counts.fp} of the {testFlaggedAtThreshold.flagged} flagged flares
            were false alarms ({percent(test.falseAlarmRatio)}).
          </span>
        </li>
      </ul>

      <h3 className="mt-4 font-semibold">Scores</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          ROC AUC {score(test.rocAuc)} (95% interval {interval(test.rocAucCi95)}
          ): how well the scores rank positive flares above negative ones. 0.5
          is chance, 1 is perfect.
        </li>
        <li>
          TSS {score(test.tss)} (95% interval {interval(test.tssCi95)}): the
          share of positive flares flagged minus the share of negative flares
          flagged.
        </li>
        <li>
          Average precision (PR AUC) {score(test.prAuc)}: how precise the flags
          stay as more positive flares are found. Useful because positive flares
          are rare.
        </li>
        <li>
          HSS {score(test.hss)}: correct flags beyond what chance agreement
          would give.
        </li>
      </ul>
      <p className="mt-2 text-slate-700">
        Intervals: {bootstrap.used} of {bootstrap.resamples} bootstrap resamples
        of the test years, {bootstrap.method} method.
      </p>
      <p className="mt-2">
        On the validation years ({splits.validation.years}) the ROC AUC was{' '}
        {score(validation.rocAuc)} and the TSS {score(validation.tss)}. Those
        years hold only {splits.validation.positives} positive flares, so the
        choices made there rest on few cases.
      </p>

      <h3 className="mt-4 font-semibold">
        Compared with two other models, on the same test years
      </h3>
      <ul className="mt-1 space-y-3">
        <ComparisonItem
          name="Baseline, flare class alone"
          comparison={model.comparisons.classOnly}
        />
        <ComparisonItem
          name="Benchmark, gradient boosting (not shipped)"
          comparison={model.comparisons.gradientBoosting}
        />
      </ul>
      <p className="mt-2 text-slate-700">
        Each model has its own alert level, chosen by the same rule on the
        validation years.
      </p>
    </Card>
  )
}
