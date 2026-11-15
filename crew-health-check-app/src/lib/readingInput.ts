import type { IndicatorDef } from '../engine/index.ts'

export type ParsedReading =
  { ok: true; value: number } | { ok: false; message: string }

/**
 * Turns typed text into a reading value. Values outside the input range are
 * refused with a message, never corrected (ARCHITECTURE.md section 19.2).
 * The range only blocks typos; it is not a clinical limit.
 */
export function parseReadingInput(
  text: string,
  def: IndicatorDef,
  emptyMessage = 'Enter a value, or choose Skip for now.',
): ParsedReading {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { ok: false, message: emptyMessage }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return { ok: false, message: 'Enter a number.' }
  }
  if (value < def.inputMin || value > def.inputMax) {
    const unit = def.unit === '' ? '' : ` ${def.unit}`
    return {
      ok: false,
      message: `Enter a value between ${def.inputMin} and ${def.inputMax}${unit}.`,
    }
  }
  return { ok: true, value }
}
