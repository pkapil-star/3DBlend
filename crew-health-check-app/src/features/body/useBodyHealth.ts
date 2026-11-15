import { useMemo } from 'react'
import {
  OVERLAY_REGIONS,
  latestValue,
  type OverlayRegion,
} from '../../bodyview/healthOverlay.ts'
import { healthData } from '../../data/index.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEvaluation } from '../../store/selectors.ts'
import type { ViewerHealth } from './viewer/Viewer3D.tsx'

/**
 * Today's engine output for the active crew member, in the shape the 3D
 * overlay needs (section 22.12). Read only: nothing here reaches the engine.
 */
export function useBodyHealth(): ViewerHealth {
  const evaluation = useAppStore(selectEvaluation)
  const readings = useAppStore((state) => state.readings)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const nowMs = useAppStore((state) => state.mission.nowMs)

  const statuses = evaluation.regionStatus
  const insightRegions = new Set<string>(
    evaluation.insights.flatMap((insight) =>
      insight.factors.flatMap((factor) => {
        const indicator = healthData.indicators.find(
          (entry) => entry.id === factor.indicator,
        )
        return indicator ? [indicator.region] : []
      }),
    ),
  )
  const bpm = latestValue(readings, crewId, 'heart_rate', nowMs)
  // The clock ticks often; rebuild (and repaint the body) only when what is shown changes.
  const key = JSON.stringify([statuses, [...insightRegions].sort(), bpm])
  return useMemo(() => {
    const [shown, insights, heartRateBpm] = JSON.parse(key) as [
      Record<string, ViewerHealth['rows'][number]['status']>,
      string[],
      number | null,
    ]
    const rows = OVERLAY_REGIONS.flatMap((region: OverlayRegion) => {
      const def = healthData.regions.find((entry) => entry.id === region)
      return def
        ? [
            {
              region,
              label: def.label,
              status: shown[region] ?? 'no_data',
              insight: insights.includes(region),
            },
          ]
        : []
    })
    return {
      statuses: Object.fromEntries(rows.map((row) => [row.region, row.status])),
      rows,
      heartRateBpm,
    }
  }, [key])
}
