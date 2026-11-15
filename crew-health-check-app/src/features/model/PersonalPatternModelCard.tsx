import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { SourceList } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { PersonalPatternModelFile } from '../../engine/index.ts'
import { modelName } from '../../lib/modelScore.ts'
import { dateOf } from './format.ts'
import { PatternEvaluationSection } from './PatternEvaluationSection.tsx'
import { PatternHowSection } from './PatternHowSection.tsx'
import { PatternPurposeSection } from './PatternPurposeSection.tsx'

/**
 * The card of the personal pattern model (section 26.18). Every number on it
 * is read from the file ml/eval_personal_pattern.py wrote. Its evaluation is
 * simulated, and the card says so before anything else.
 */
export function PersonalPatternModelCard({
  model,
}: {
  model: PersonalPatternModelFile
}) {
  return (
    <article aria-labelledby="model-title" className="space-y-4">
      <div>
        <h1 id="model-title" className="text-2xl font-semibold">
          Model card: personal pattern (second opinion)
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-700">
          <span>
            Model {modelName(model)}, made on {dateOf(model.createdAt)}
          </span>
          <Tag>Model estimate</Tag>
          <Tag>Simulated evaluation</Tag>
        </p>
        <p className="mt-2">
          Every number on this page is read from the model&rsquo;s own file.{' '}
          <strong>
            It was evaluated on simulated data only: the results show that the
            method works as designed on this project&rsquo;s simulator, not that
            it notices real illness.
          </strong>
        </p>
      </div>
      <PatternPurposeSection model={model} />
      <PatternHowSection model={model} />
      <PatternEvaluationSection model={model} />
      <Card title="Limits">
        <p className="mb-2 text-slate-700">
          Copied from the model&rsquo;s own file.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {model.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
      <Card title="Sources">
        <p className="mb-2">
          The simulator&rsquo;s in-flight drift shapes are seeded from these
          sources; its personal means and noise levels are design values.
        </p>
        <SourceList sourceIds={model.sourceIds} />
        <p className="mt-3 text-slate-700">
          The method uses Ledoit-Wolf shrinkage and, as a benchmark,
          IsolationForest, both from scikit-learn. The full model card and the
          steps to rebuild it are in the project repository, under ml/reports
          and ml/README.md.
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
