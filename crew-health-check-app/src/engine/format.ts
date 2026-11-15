import type { IndicatorDef } from './types.ts'

// Number formatting for evidence items. A reading is shown with the precision
// it was entered at; derived values (normals, averages) get one decimal for
// fractional indicators, so "Your normal: 6.8 h" rather than "6.875 h".

export function decimalsOf(step: number): number {
  const text = String(step)
  const point = text.indexOf('.')
  return point === -1 ? 0 : text.length - point - 1
}

export function withUnit(text: string, unit: string): string {
  return unit === '' ? text : `${text} ${unit}`
}

export function formatReading(value: number, def: IndicatorDef): string {
  return withUnit(value.toFixed(decimalsOf(def.step)), def.unit)
}

export function formatDerived(value: number, def: IndicatorDef): string {
  return withUnit(value.toFixed(def.step < 1 ? 1 : 0), def.unit)
}

/**
 * The name of an urgent re-check: "Body temperature re-check", or the
 * indicator's own `recheckLabel` where the plain form would mislead
 * ("Blood sugar re-check (not fasting)", section 10).
 */
export function recheckName(def: IndicatorDef): string {
  return def.recheckLabel ?? `${def.label} re-check`
}
