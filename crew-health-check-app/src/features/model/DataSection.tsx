import { Card } from '../../components/Card.tsx'
import { SourceLink } from '../../components/SourceLink.tsx'
import type { SepRiskModelFile } from '../../engine/index.ts'
import { dateOf, percent } from './format.ts'

const SPLIT_WORDS = {
  train: 'Training',
  validation: 'Validation',
  test: 'Test (held out)',
} as const

/** Where the flares come from, how they were labelled, and how they were split. */
export function DataSection({ model }: { model: SepRiskModelFile }) {
  const { data } = model
  const records = data.sepRecordClasses
  return (
    <Card title="The data">
      <p>
        Real records from {data.source}, retrieved on {dateOf(data.retrievedAt)}
        . Flares with peak times from {dateOf(data.firstFlare)} to{' '}
        {dateOf(data.lastFlare)}.
      </p>
      <p className="mt-2">
        <SourceLink sourceId={data.sourceId} />
      </p>
      <p className="mt-2">
        DONKI describes its content as experimental research information.
        Official U.S. space weather forecasts come from NOAA&rsquo;s Space
        Weather Prediction Center.
      </p>
      <p className="mt-2">
        In this app the flares are replayed in scenarios. The crew and their
        health readings in every scenario are simulated.
      </p>

      <h3 className="mt-4 font-semibold">Which flares are used</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {data.filters.map((filter) => (
          <li key={filter}>{filter}</li>
        ))}
      </ul>
      <p className="mt-2">
        Left out:{' '}
        {Object.entries(data.dropped)
          .map(([reason, count]) => `${reason}: ${count}`)
          .join('; ')}
        .
      </p>

      <h3 className="mt-4 font-semibold">How flares were labelled</h3>
      <p className="mt-1">
        Particle event records in the download: {records.observedOnly} observed
        by an instrument, {records.modelOnly} model output, {records.unknown} of
        unknown origin, {records.mixed} mixed. Only records observed by an
        instrument can make a flare positive.
      </p>
      <p className="mt-2">
        A negative flare has no qualifying recorded particle event association.
        That does not show that no particle event occurred.
      </p>

      <h3 className="mt-4 font-semibold">Split by year, in time order</h3>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left">
          <caption className="sr-only">
            Flares per split, with positives and exclusions
          </caption>
          <thead>
            <tr className="border-b border-slate-300">
              <th scope="col" className="py-1 pr-3">
                Split
              </th>
              <th scope="col" className="py-1 pr-3">
                Years
              </th>
              <th scope="col" className="py-1 pr-3">
                Flares
              </th>
              <th scope="col" className="py-1 pr-3">
                Positive
              </th>
              <th scope="col" className="py-1 pr-3">
                Share positive
              </th>
              <th scope="col" className="py-1">
                Left out as ambiguous
              </th>
            </tr>
          </thead>
          <tbody>
            {(['train', 'validation', 'test'] as const).map((name) => {
              const split = data.splits[name]
              return (
                <tr key={name} className="border-b border-slate-200">
                  <th scope="row" className="py-1 pr-3 font-semibold">
                    {SPLIT_WORDS[name]}
                  </th>
                  <td className="py-1 pr-3">{split.years}</td>
                  <td className="py-1 pr-3">{split.n}</td>
                  <td className="py-1 pr-3">{split.positives}</td>
                  <td className="py-1 pr-3">
                    {percent(split.positives / split.n)}
                  </td>
                  <td className="py-1">{split.excludedAmbiguous}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-slate-700">
        A flare whose only particle event evidence is model output or of unknown
        origin is left out as ambiguous. It is never counted as negative.
      </p>
    </Card>
  )
}
