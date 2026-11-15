import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '../../components/Card.tsx'
import { StatusBadge } from '../../components/StatusBadge.tsx'
import { STATUS_DISPLAY } from '../../components/statusDisplay.ts'
import { healthData } from '../../data/index.ts'
import type { Evaluation, RegionId } from '../../engine/index.ts'
import { activeAlerts, missingDataText } from '../../lib/alerts.ts'
import { ruleById } from '../../lib/labels.ts'

interface StatusListProps {
  evaluation: Evaluation
}

/** What a region's row says next to its status badge. */
function headline(evaluation: Evaluation, region: RegionId): string {
  const top = activeAlerts(evaluation).find((alert) => alert.region === region)
  if (top) return ruleById(top.ruleId)?.title ?? top.ruleId
  if (evaluation.regionStatus[region] === 'no_data')
    return 'Nothing recorded recently'
  return 'No active alert'
}

/**
 * The accessible status list (section 19.1): one row per region, with word,
 * icon and headline. Each row opens the region's detail screen (section 19.3).
 */
export function StatusList({ evaluation }: StatusListProps) {
  return (
    <Card title="Status by area">
      <ul className="divide-y divide-slate-200">
        {healthData.regions.map((region) => {
          const status = evaluation.regionStatus[region.id]
          const text = headline(evaluation, region.id)
          const missing = missingDataText(evaluation, region.id)
          // Spelled out so a screen reader hears "Head: Watch. Sleep has been
          // low…", not the parts run together.
          const name = [
            `${region.label}: ${STATUS_DISPLAY[status].word}`,
            text,
            missing,
          ]
            .filter(Boolean)
            .join('. ')
          return (
            <li key={region.id}>
              <Link
                to={`/region/${region.id}`}
                aria-label={name}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left"
              >
                <span className="w-28 font-semibold">{region.label}</span>
                <StatusBadge status={status} />
                {/* On a phone the headline gets its own full-width line. */}
                <span className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
                  {text}
                  {missing && (
                    <span className="block text-slate-600">{missing}</span>
                  )}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  size={20}
                  className="ml-auto shrink-0"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
