import { ModelScoreNote } from '../../components/ModelScoreNote.tsx'
import { Tag } from '../../components/Tag.tsx'
import type { ModelEvidence } from '../../engine/index.ts'

/**
 * Under a model score in "What changed" (section 19.4): the factors that move
 * the score most, which real flare it is for, and what the score is not.
 */
export function ModelEvidenceDetails({ model }: { model: ModelEvidence }) {
  return (
    <div className="mt-2 space-y-3">
      <div>
        <p className="font-semibold">What moves the score most</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {model.factors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
        <p className="mt-1 text-slate-700">
          &ldquo;Raises&rdquo; and &ldquo;lowers&rdquo; compare this flare with
          an average flare in the model&rsquo;s training years.
        </p>
      </div>
      <p>
        <Tag>Historical flare</Tag>{' '}
        <span>
          This is a real flare from NASA&rsquo;s DONKI catalog, record{' '}
          <a
            href={model.flare.link}
            target="_blank"
            rel="noreferrer"
            className="break-all underline underline-offset-4"
          >
            {model.flare.donkiId}
          </a>
          , replayed on this mission timeline. The crew and their health
          readings are simulated.
        </span>
      </p>
      <ModelScoreNote withLink />
    </div>
  )
}
