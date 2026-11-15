import { Link } from 'react-router'
import { SEP_RISK_CARD_PATH, scoreLimits } from '../lib/modelScore.ts'

/**
 * Shown next to every experimental model score: what the score is about,
 * that false alarms are frequent, and what it is not. With `withLink` it
 * ends with the link to the model card.
 */
export function ModelScoreNote({ withLink = false }: { withLink?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <p className="font-semibold">About this score</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {scoreLimits().map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {withLink && (
        <p className="mt-2">
          <Link
            to={SEP_RISK_CARD_PATH}
            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          >
            How this model was made
          </Link>
        </p>
      )}
    </div>
  )
}
