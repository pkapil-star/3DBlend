import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import type { Evaluation } from '../../engine/index.ts'
import {
  PERSONAL_PATTERN_CARD_PATH,
  readinessWords,
} from '../../lib/insights.ts'
import { InsightCard } from './InsightCard.tsx'

/** Home shows at most two insights (section 26.17). */
const MAX_SHOWN = 2

/**
 * Home's "Second opinions" card, under the alert list (section 26.17). It
 * shows insights, or why there is none: still learning, check-in not done,
 * or nothing unusual. It never shows a status.
 */
export function SecondOpinionsCard({ evaluation }: { evaluation: Evaluation }) {
  const readiness = evaluation.patternReadiness
  const shown = evaluation.insights.slice(0, MAX_SHOWN)

  if (readiness === null) {
    return (
      <Card title="Second opinions">
        <p>Second opinions are off: no model file is loaded.</p>
      </Card>
    )
  }

  if (shown.length > 0) {
    return (
      <Card title="Second opinions">
        <ul className="space-y-3">
          {shown.map((insight) => (
            <li key={insight.key}>
              <InsightCard insight={insight} evaluation={evaluation} />
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  const words = readinessWords(readiness)
  return (
    <Card title="Second opinions">
      <p className="font-semibold">{words.line}</p>
      <p className="mt-1">{words.detail}</p>
      <Link
        to={PERSONAL_PATTERN_CARD_PATH}
        className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
      >
        About the personal pattern model
      </Link>
    </Card>
  )
}
