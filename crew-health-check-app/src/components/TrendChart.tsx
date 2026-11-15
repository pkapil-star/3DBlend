import { useEffect, useRef, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

// A 30-day trend with the person's usual range shaded (ARCHITECTURE.md
// sections 19.3 and 20). The chart is drawn for sighted users; its one-line
// summary underneath says the same in words for everyone.

interface TrendChartProps {
  /** One value per mission day, in day order. */
  points: readonly { day: number; value: number }[]
  /** center ± 2 × spread, or null while the baseline is not ready. */
  band: { low: number; high: number; center: number } | null
  firstDay: number
  lastDay: number
  /** "Sleep last night (h)" */
  label: string
  summary: string
}

const HEIGHT = 200
const FALLBACK_WIDTH = 320
const TICK = { fontSize: 16, fill: 'var(--color-chart-axis)' }

/** The width of the chart's box, followed as the window changes size. */
function useBoxWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** A round tick step: 1, 2, 2.5 or 5 times a power of ten, giving about three intervals. */
function niceStep(range: number): number {
  const rough = range / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= rough)
  return (step ?? 10) * power
}

/** Round ticks that cover the readings and the band. */
function ticksOf(
  points: TrendChartProps['points'],
  band: TrendChartProps['band'],
): number[] {
  const values = points.map((point) => point.value)
  if (band) values.push(band.low, band.high)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const step = niceStep(high - low || 1)
  const first = Math.floor(low / step) * step
  const ticks: number[] = []
  for (let tick = first; tick < high + step; tick += step) {
    ticks.push(Number(tick.toFixed(6)))
    if (tick >= high) break
  }
  return ticks
}

function tickText(value: number): string {
  return String(Number(value.toFixed(1)))
}

export function TrendChart({
  points,
  band,
  firstDay,
  lastDay,
  label,
  summary,
}: TrendChartProps) {
  const { ref, width } = useBoxWidth()
  const ticks = ticksOf(points, band)
  return (
    <figure className="mt-3">
      <p className="font-semibold">{label}, last 30 days</p>
      <div ref={ref} className="w-full" aria-hidden="true">
        {points.length > 0 && (
          <ComposedChart
            width={width}
            height={HEIGHT}
            data={[...points]}
            margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              stroke="var(--color-chart-band-edge)"
              strokeOpacity={0.35}
              strokeDasharray="2 4"
              vertical={false}
            />
            {band && (
              <ReferenceArea
                y1={band.low}
                y2={band.high}
                fill="var(--color-chart-band)"
                fillOpacity={0.9}
                stroke="var(--color-chart-band-edge)"
                strokeOpacity={0.7}
              />
            )}
            {band && (
              <ReferenceLine
                y={band.center}
                stroke="var(--color-chart-center)"
                strokeDasharray="6 4"
              />
            )}
            <XAxis
              dataKey="day"
              type="number"
              domain={[firstDay, lastDay]}
              allowDecimals={false}
              tickCount={4}
              tick={TICK}
            />
            <YAxis
              domain={[ticks[0] ?? 0, ticks.at(-1) ?? 1]}
              ticks={ticks}
              tickFormatter={tickText}
              width={56}
              tick={TICK}
            />
            <Line
              dataKey="value"
              stroke="var(--color-chart-line)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--color-chart-line)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </div>
      <figcaption className="mt-1">{summary}</figcaption>
    </figure>
  )
}
