import { Link, useParams } from 'react-router'
import { AlertItem } from '../../components/AlertItem.tsx'
import { Card } from '../../components/Card.tsx'
import { HabitatFeeds } from '../../components/HabitatFeeds.tsx'
import { RegionInsights } from '../../components/RegionInsights.tsx'
import { StatusBadge } from '../../components/StatusBadge.tsx'
import { healthData } from '../../data/index.ts'
import { regionIdSchema } from '../../engine/schemas.ts'
import { activeAlerts, missingDataText } from '../../lib/alerts.ts'
import { insightsForRegion } from '../../lib/insights.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEvaluation } from '../../store/selectors.ts'
import { IndicatorTrend } from './IndicatorTrend.tsx'
import { RegionWhy } from './RegionWhy.tsx'

/** Region detail `#/region/:regionId` (ARCHITECTURE.md section 19.3): understand one body area. */
export function RegionPage() {
  const { regionId = '' } = useParams()
  const evaluation = useAppStore(selectEvaluation)
  const parsed = regionIdSchema.safeParse(regionId)
  const region = parsed.success
    ? healthData.regions.find((entry) => entry.id === parsed.data)
    : undefined

  if (!parsed.success || !region) {
    return (
      <section aria-labelledby="region-missing">
        <h1 id="region-missing" className="text-2xl font-semibold">
          No such body area
        </h1>
        <p className="mt-2">
          <Link to="/" className="underline underline-offset-4">
            Go to Home
          </Link>
        </p>
      </section>
    )
  }

  const id = parsed.data
  const alerts = activeAlerts(evaluation).filter((alert) => alert.region === id)
  const missing = missingDataText(evaluation, id)
  const indicators = healthData.indicators.filter((def) => def.region === id)
  const notes = insightsForRegion(evaluation, id)

  return (
    <article aria-labelledby="region-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="region-title" className="text-2xl font-semibold">
          {region.label}
        </h1>
        <StatusBadge status={evaluation.regionStatus[id]} />
      </div>
      {missing && <p>{missing}</p>}

      <Card title="Active alerts in this area">
        {alerts.length === 0 ? (
          <p>No active alert in this area.</p>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <AlertItem key={alert.key} alert={alert} />
            ))}
          </ul>
        )}
      </Card>

      {notes.length > 0 && (
        <Card title="Second opinions about this area">
          <RegionInsights notes={notes} />
        </Card>
      )}

      {id === 'whole_body' && (
        <Card title="Habitat today">
          <HabitatFeeds />
        </Card>
      )}
      {id === 'skin' && (
        <Card title="About this area">
          <p>
            Skin has no measurement of its own. Good here means only that no
            alert is active. It does not show that your skin is healthy.
          </p>
        </Card>
      )}

      {indicators.map((def) => (
        <IndicatorTrend key={def.id} def={def} evaluation={evaluation} />
      ))}

      <RegionWhy regionId={id} indicators={indicators} />

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
