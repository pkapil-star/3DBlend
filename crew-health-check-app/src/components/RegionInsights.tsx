import { Lightbulb } from 'lucide-react'
import type { Insight, InsightFactor } from '../engine/index.ts'
import { factorWords, insightText } from '../lib/insights.ts'
import { Tag } from './Tag.tsx'

/**
 * Second opinions whose factors involve one region's readings (section
 * 26.17), from insightsForRegion. An insight never changes the region's status.
 */
export function RegionInsights({
  notes,
}: {
  notes: readonly { insight: Insight; factors: InsightFactor[] }[]
}) {
  return (
    <ul className="space-y-1">
      {notes.map(({ insight, factors }) => (
        <li key={insight.key} className="flex flex-wrap items-center gap-2">
          <Lightbulb aria-hidden="true" size={18} />
          <span className="font-semibold">Insight</span>
          <Tag>Model estimate</Tag>
          <span>
            {insightText(insight).headline}:{' '}
            {factors.map((factor) => factorWords(factor)).join('; ')}. Details
            under &ldquo;Second opinions&rdquo; on Home.
          </span>
        </li>
      ))}
    </ul>
  )
}
