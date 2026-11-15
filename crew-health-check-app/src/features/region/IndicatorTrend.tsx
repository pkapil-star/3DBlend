import { Card } from '../../components/Card.tsx'
import { TrendChart } from '../../components/TrendChart.tsx'
import {
  lastReadingPerDay,
  type Evaluation,
  type IndicatorDef,
} from '../../engine/index.ts'
import { formatValue, normalText } from '../../lib/labels.ts'
import {
  TREND_DAYS,
  bandOf,
  trendSummary,
  trendWindow,
} from '../../lib/trendSummary.ts'
import { useAppStore } from '../../store/index.ts'
import { selectToday } from '../../store/selectors.ts'

/**
 * One reading on the region screen (section 19.3): the latest value, the
 * person's normal, and 30 days against the usual range with a one-line
 * summary. Urgent re-checks are left out, as in every baseline and trend.
 */
export function IndicatorTrend({
  def,
  evaluation,
}: {
  def: IndicatorDef
  evaluation: Evaluation
}) {
  const today = useAppStore(selectToday)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const readings = useAppStore((state) => state.readings)
  const values = lastReadingPerDay(
    readings.filter((reading) => reading.crewId === crewId),
    def.id,
  ).filter((entry) => entry.day <= today)
  const latest = values.at(-1)
  const baseline = evaluation.baselines[def.id]
  const recent = trendWindow(values, today)
  const unit = def.unit === '' ? '' : ` (${def.unit})`

  return (
    <Card title={def.label}>
      <p className="text-xl font-semibold">
        {latest
          ? `${formatValue(latest.value, def)} on day ${latest.day}`
          : 'Not recorded yet'}
      </p>
      <p>{normalText(baseline, def)}</p>
      <TrendChart
        points={recent.map(({ day, value }) => ({ day, value }))}
        band={bandOf(baseline)}
        firstDay={today - TREND_DAYS + 1}
        lastDay={today}
        label={`${def.label}${unit}`}
        summary={trendSummary(recent, baseline, def)}
      />
    </Card>
  )
}
