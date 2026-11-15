import { Card } from '../../components/Card.tsx'
import { SourceList } from '../../components/SourceLink.tsx'
import { healthData } from '../../data/index.ts'
import type { IndicatorDef, RegionId } from '../../engine/index.ts'

/**
 * "Why this matters in space" with sources (section 19.3). An area with
 * readings explains each reading; an area without (Skin, Environment) uses
 * the explanations of its rules. Every sentence comes from the data files.
 */
export function RegionWhy({
  regionId,
  indicators,
}: {
  regionId: RegionId
  indicators: readonly IndicatorDef[]
}) {
  const rules = healthData.rules.filter((rule) => rule.region === regionId)
  const items =
    indicators.length > 0
      ? indicators.map((def) => ({
          key: def.id,
          title: def.label,
          text: def.whyInSpace,
          sourceIds: def.sourceIds,
        }))
      : rules.map((rule) => ({
          key: rule.id,
          title: rule.title,
          text: rule.explain.whySpace,
          sourceIds: rule.sourceIds,
        }))

  return (
    <Card title="Why this matters in space">
      {items.length === 0 ? (
        <p>This area has no reading and no rule of its own yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.key}>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-1">{item.text}</p>
              <div className="mt-1">
                <SourceList sourceIds={item.sourceIds} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
