import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { SourceList } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { EarthHospitalModelFile } from '../../engine/index.ts'
import { modelName } from '../../lib/modelScore.ts'
import { dateOf } from './format.ts'
import { HospitalDataSection } from './HospitalDataSection.tsx'
import { HospitalPurposeSection } from './HospitalPurposeSection.tsx'
import { HospitalResultsSection } from './HospitalResultsSection.tsx'

/**
 * The card of the Earth hospital model (section 26.19). Every number is read
 * from the file ml/train_earth_hospital.py wrote. It says first where the
 * model learned and that it was never tested on astronauts.
 */
export function EarthHospitalModelCard({
  model,
}: {
  model: EarthHospitalModelFile
}) {
  return (
    <article aria-labelledby="model-title" className="space-y-4">
      <div>
        <h1 id="model-title" className="text-2xl font-semibold">
          Model card: Earth hospital second opinion
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-700">
          <span>
            Model {modelName(model)}, made on {dateOf(model.createdAt)}
          </span>
          <Tag>Model estimate</Tag>
          <Tag>Earth ICU data</Tag>
          <Tag>Never tested on astronauts</Tag>
        </p>
        <p className="mt-2">
          Every number on this page is read from the model&rsquo;s own file.{' '}
          <strong>
            It learned from patients in Earth intensive care units and has never
            been tested on astronauts.
          </strong>{' '}
          A second opinion only.
        </p>
      </div>
      <HospitalPurposeSection model={model} />
      <HospitalDataSection model={model} />
      <HospitalResultsSection model={model} />
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
        <SourceList sourceIds={model.sourceIds} />
        <p className="mt-3 text-slate-700">
          The full model card and the steps to rebuild the model are in the
          project repository, under ml/reports and ml/README.md. The PhysioNet
          patient files themselves are never published with this project.
        </p>
      </Card>
      <p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Back to Home
        </Link>
      </p>
    </article>
  )
}
