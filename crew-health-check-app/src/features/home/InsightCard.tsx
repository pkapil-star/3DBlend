import { Lightbulb } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { formatTimeOfDay } from '../../clock/missionClock.ts'
import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { Tag } from '../../components/Tag.tsx'
import type { Evaluation, Insight } from '../../engine/index.ts'
import { todaysValue } from '../../lib/checkin.ts'
import { factorDetail, factorWords, insightText } from '../../lib/insights.ts'
import { modelName } from '../../lib/modelScore.ts'
import { messageWords } from '../../lib/route.ts'
import { SECOND_OPINION_TITLE } from '../../link/earthLink.ts'
import { useAppStore } from '../../store/index.ts'

/**
 * "Send to ground" for one insight: only when the crew member chooses, and at
 * most once (section 26.17). Focus moves to the result, so a keyboard user is
 * not dropped at the top of the page.
 */
function SendInsight({ insightKey }: { insightKey: string }) {
  const sent = useAppStore((state) =>
    state.outbox.find((message) => message.insightKey === insightKey),
  )
  const sendInsightToGround = useAppStore((state) => state.sendInsightToGround)
  const [error, setError] = useState<string | null>(null)
  const [moveFocus, setMoveFocus] = useState(false)
  const sentRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (moveFocus) sentRef.current?.focus()
  }, [moveFocus, sent])

  if (sent) {
    return (
      <p
        ref={sentRef}
        tabIndex={-1}
        className="flex flex-wrap items-center gap-2"
      >
        {SECOND_OPINION_TITLE} at {formatTimeOfDay(sent.sentAtMs)} mission time.{' '}
        {messageWords(sent)}.<Tag>Simulated</Tag>
      </p>
    )
  }
  return (
    <>
      <button
        type="button"
        className={SECONDARY_BUTTON}
        onClick={() => {
          const result = sendInsightToGround(insightKey)
          if (result.ok) {
            setError(null)
            setMoveFocus(true)
          } else {
            setError(result.message)
          }
        }}
      >
        Send to ground
      </button>
      {error && (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      )}
    </>
  )
}

/**
 * One second opinion (section 26.17): neutral styling, never a status token,
 * no number and no percentage. The model card explains the score.
 */
export function InsightCard({
  insight,
  evaluation,
}: {
  insight: Insight
  evaluation: Evaluation
}) {
  const headingId = useId()
  const readings = useAppStore((state) => state.readings)
  const records = {
    crewId: insight.crewId,
    today: insight.day,
    readings,
    symptoms: [],
    noSymptomDays: {},
  }
  const text = insightText(insight)

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-lg border border-slate-300 bg-slate-50 p-3"
    >
      <p className="flex flex-wrap items-center gap-2">
        <Lightbulb aria-hidden="true" size={20} />
        <span className="font-semibold">Insight</span>
        <Tag>Model estimate</Tag>
        {text.originTag && <Tag>{text.originTag}</Tag>}
        <span className="text-slate-700">
          {modelName({
            modelId: insight.modelId,
            version: insight.modelVersion,
          })}
        </span>
      </p>
      <h3 id={headingId} className="mt-2 text-lg font-semibold">
        {text.headline}
      </h3>
      <p>{text.note}.</p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {insight.factors.map((factor) => {
          const detail = factorDetail(
            factor,
            todaysValue(records, factor.indicator),
            evaluation.baselines[factor.indicator],
          )
          return (
            <li key={factor.indicator}>
              {factorWords(factor)}
              {detail && <span className="text-slate-700"> ({detail})</span>}
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-slate-700">{text.caveat}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to={text.cardPath}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          How this model works
        </Link>
        <SendInsight insightKey={insight.key} />
      </div>
    </article>
  )
}
