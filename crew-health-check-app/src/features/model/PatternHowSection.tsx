import { Card } from '../../components/Card.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { PersonalPatternModelFile } from '../../engine/index.ts'
import { indicatorDef } from '../../lib/labels.ts'

/** The readings it uses, its two design values and its steps. */
export function PatternHowSection({
  model,
}: {
  model: PersonalPatternModelFile
}) {
  return (
    <Card title="How it works">
      <h3 className="font-semibold">Readings it uses</h3>
      <p className="mt-1">
        {model.indicators.map((id) => indicatorDef(id).label).join(', ')}.
        Exercise is left out because today&rsquo;s value is not complete until
        the day ends. An urgent re-check, such as a blood sugar re-check that is
        not fasting, is never used.
      </p>
      <h3 className="mt-4 font-semibold">Settings</h3>
      <ul className="mt-1 space-y-2">
        <li className="flex flex-wrap items-center gap-2">
          <span>
            At least {model.minIndicatorsToday} of these readings must be in
            today.
          </span>
          <Tag>Design value</Tag>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>
            It needs {model.minDays} baseline days with all of today&rsquo;s
            readings; until then Home says &ldquo;Learning your pattern&rdquo;.
          </span>
          <Tag>Design value</Tag>
        </li>
      </ul>
      <h3 className="mt-4 font-semibold">Steps</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        <li>
          Each reading becomes a z-score: how far it is from your own normal, in
          units of your usual spread (the same baseline as the rules).
        </li>
        <li>
          From your baseline days it learns how your readings usually move
          together, with Ledoit-Wolf shrinkage, which keeps the estimate stable
          when there are few days.
        </li>
        <li>
          Today&rsquo;s distance from that pattern (the squared Mahalanobis
          distance) is compared with each baseline day&rsquo;s own distance,
          measured with that day left out.
        </li>
        <li>{model.thresholdRule}</li>
        <li>
          The insight names up to three readings that add most to the distance,
          each as &ldquo;higher&rdquo; or &ldquo;lower than your normal&rdquo;.
        </li>
      </ol>
    </Card>
  )
}
