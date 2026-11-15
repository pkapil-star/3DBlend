import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { SourceList } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { SepRiskModelFile } from '../../engine/index.ts'
import { modelName } from '../../lib/modelScore.ts'
import { CalibrationSection } from './CalibrationSection.tsx'
import { DataSection } from './DataSection.tsx'
import { dateOf } from './format.ts'
import { HowItWorksSection } from './HowItWorksSection.tsx'
import { PurposeSection } from './PurposeSection.tsx'
import { ResultsSection } from './ResultsSection.tsx'

/**
 * The card of the sep-risk model (section 19.11). Every number on it is read
 * from the model file that ml/train_sep_risk.py wrote; none is typed here.
 */
export function SepRiskModelCard({ model }: { model: SepRiskModelFile }) {
  return (
    <article aria-labelledby="model-title" className="space-y-4">
      <div>
        <h1 id="model-title" className="text-2xl font-semibold">
          Model card: solar flare outlook
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-700">
          <span>
            Model {modelName(model)}, made on {dateOf(model.createdAt)}
          </span>
          <Tag>Model estimate</Tag>
          <Tag>Experimental</Tag>
        </p>
        <p className="mt-2">
          Every number on this page is read from the model&rsquo;s own file. A
          prototype for a hackathon, not an operational forecast.
        </p>
      </div>
      <PurposeSection model={model} />
      <DataSection model={model} />
      <HowItWorksSection model={model} />
      <ResultsSection model={model} />
      <CalibrationSection model={model} />
      <Card title="Limits">
        <p className="mb-2 text-slate-700">
          Copied from the model&rsquo;s own file. There, &ldquo;estimate&rdquo;
          means the model&rsquo;s output on its 0 to 1 scale, which this app
          shows as a score from 0 to 100.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {model.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
      <Card title="Sources">
        <SourceList sourceIds={model.sourceIds} />
        <p className="mt-3 text-slate-700">
          The full model card, the instrument documentation behind the labels
          and the steps to rebuild the model are in the project repository,
          under ml/reports and ml/README.md.
        </p>
      </Card>
      <p>
        <Link to="/" className="underline underline-offset-4">
          Back to Home
        </Link>
      </p>
    </article>
  )
}
